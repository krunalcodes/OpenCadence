import {
  CreateConfigurationSetCommand,
  CreateConfigurationSetEventDestinationCommand,
  type EventDestination,
  type EventType,
  GetConfigurationSetEventDestinationsCommand,
  type GetConfigurationSetEventDestinationsCommandOutput,
  UpdateConfigurationSetEventDestinationCommand,
} from "@aws-sdk/client-sesv2";
import {
  type Credentials,
  IntegrationError,
  isIntegrationError,
} from "@workspace/integration-core";
import { accessKeyFrom, call } from "./client";
import {
  configurationSetNamePattern,
  defaultEventDestinationName,
  defaultEventTypes,
  type ResolvedSesConfig,
} from "./config";

export type SesEventType = EventType;

export type EventDestinationOptions = {
  configurationSetName: string;
  topicArn: string;
  eventDestinationName?: string;
  eventTypes?: SesEventType[];
};

export type EventDestinationResult = {
  configurationSetName: string;
  eventDestinationName: string;
  topicArn: string;
  eventTypes: SesEventType[];
  configurationSet: "created" | "existing";
  eventDestination: "created" | "updated" | "existing";
};

const topicArnPattern =
  /^arn:aws[a-z-]*:sns:[a-z0-9-]+:\d{12}:[A-Za-z0-9_-]{1,256}$/;

export function isStandardTopicArn(value: string) {
  return topicArnPattern.test(value);
}

function covers(destination: EventDestination, eventTypes: SesEventType[]) {
  const matching = destination.MatchingEventTypes ?? [];
  return (
    destination.Enabled === true &&
    eventTypes.every((type) => matching.includes(type))
  );
}

export async function ensureEventDestination(
  config: ResolvedSesConfig,
  credentials: Credentials,
  options: EventDestinationOptions,
): Promise<EventDestinationResult> {
  const access = accessKeyFrom(credentials);
  const { configurationSetName, topicArn } = options;
  const requestedName =
    options.eventDestinationName ?? defaultEventDestinationName;
  const eventTypes = options.eventTypes?.length
    ? options.eventTypes
    : [...defaultEventTypes];
  if (
    !configurationSetNamePattern.test(configurationSetName) ||
    !configurationSetNamePattern.test(requestedName)
  ) {
    throw new IntegrationError(
      "validation",
      "Configuration set and event destination names can use up to 64 letters, numbers, hyphens, and underscores.",
    );
  }
  if (!isStandardTopicArn(topicArn)) {
    throw new IntegrationError(
      "validation",
      "The SNS topic ARN is not valid. Amazon SES publishes to standard topics only.",
    );
  }

  let configurationSet: EventDestinationResult["configurationSet"] = "created";
  try {
    await call(
      config,
      access,
      new CreateConfigurationSetCommand({
        ConfigurationSetName: configurationSetName,
      }),
      { permission: "ses:CreateConfigurationSet", resourceLimits: true },
    );
  } catch (error) {
    if (
      !isIntegrationError(error) ||
      error.providerCode !== "AlreadyExistsException"
    ) {
      throw error;
    }
    configurationSet = "existing";
  }

  const current = await call<GetConfigurationSetEventDestinationsCommandOutput>(
    config,
    access,
    new GetConfigurationSetEventDestinationsCommand({
      ConfigurationSetName: configurationSetName,
    }),
    { permission: "ses:GetConfigurationSetEventDestinations" },
  );
  const destinations = current.EventDestinations ?? [];
  const existing =
    destinations.find(
      (destination) => destination.SnsDestination?.TopicArn === topicArn,
    ) ?? destinations.find((destination) => destination.Name === requestedName);
  const eventDestinationName = existing?.Name ?? requestedName;
  const sameTopic = existing?.SnsDestination?.TopicArn === topicArn;
  const result = {
    configurationSetName,
    eventDestinationName,
    topicArn,
    configurationSet,
  };

  if (existing && sameTopic && covers(existing, eventTypes)) {
    return {
      ...result,
      eventTypes: existing.MatchingEventTypes ?? eventTypes,
      eventDestination: "existing",
    };
  }

  const merged = sameTopic
    ? [...new Set([...(existing?.MatchingEventTypes ?? []), ...eventTypes])]
    : eventTypes;
  const definition = {
    ConfigurationSetName: configurationSetName,
    EventDestinationName: eventDestinationName,
    EventDestination: {
      Enabled: true,
      MatchingEventTypes: merged,
      SnsDestination: { TopicArn: topicArn },
    },
  };
  if (existing) {
    await call(
      config,
      access,
      new UpdateConfigurationSetEventDestinationCommand(definition),
      { permission: "ses:UpdateConfigurationSetEventDestination" },
    );
    return { ...result, eventTypes: merged, eventDestination: "updated" };
  }
  await call(
    config,
    access,
    new CreateConfigurationSetEventDestinationCommand(definition),
    {
      permission: "ses:CreateConfigurationSetEventDestination",
      resourceLimits: true,
    },
  );
  return { ...result, eventTypes: merged, eventDestination: "created" };
}
