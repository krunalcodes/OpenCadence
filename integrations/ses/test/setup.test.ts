import type { IntegrationError } from "@workspace/integration-core";
import { describe, expect, it } from "vitest";
import { accessKey, awsError, captureError, createAdapter } from "./helpers";

const topicArn = "arn:aws:sns:eu-west-1:123456789012:opencadence-events";

const options = { configurationSetName: "opencadence", topicArn };

const eventTypes = [
  "BOUNCE",
  "COMPLAINT",
  "DELIVERY",
  "DELIVERY_DELAY",
  "REJECT",
  "RENDERING_FAILURE",
];

describe("ensureEventDestination", () => {
  it("creates the configuration set and the SNS event destination", async () => {
    const { adapter, commands } = createAdapter({
      GetConfigurationSetEventDestinationsCommand: { EventDestinations: [] },
    });

    const result = await adapter.ensureEventDestination(accessKey, options);

    expect(commands).toEqual([
      {
        name: "CreateConfigurationSetCommand",
        input: { ConfigurationSetName: "opencadence" },
      },
      {
        name: "GetConfigurationSetEventDestinationsCommand",
        input: { ConfigurationSetName: "opencadence" },
      },
      {
        name: "CreateConfigurationSetEventDestinationCommand",
        input: {
          ConfigurationSetName: "opencadence",
          EventDestinationName: "opencadence",
          EventDestination: {
            Enabled: true,
            MatchingEventTypes: eventTypes,
            SnsDestination: { TopicArn: topicArn },
          },
        },
      },
    ]);
    expect(result).toEqual({
      configurationSetName: "opencadence",
      eventDestinationName: "opencadence",
      topicArn,
      eventTypes,
      configurationSet: "created",
      eventDestination: "created",
    });
  });

  it("reuses a configuration set and destination that already cover the events", async () => {
    const { adapter, commands } = createAdapter({
      CreateConfigurationSetCommand: awsError(
        "AlreadyExistsException",
        "Configuration set already exists",
        400,
      ),
      GetConfigurationSetEventDestinationsCommand: {
        EventDestinations: [
          {
            Name: "existing-destination",
            Enabled: true,
            MatchingEventTypes: [...eventTypes, "SEND"],
            SnsDestination: { TopicArn: topicArn },
          },
        ],
      },
    });

    const result = await adapter.ensureEventDestination(accessKey, options);

    expect(commands).toHaveLength(2);
    expect(result).toMatchObject({
      eventDestinationName: "existing-destination",
      configurationSet: "existing",
      eventDestination: "existing",
      eventTypes: [...eventTypes, "SEND"],
    });
  });

  it("updates a destination for the topic that is disabled or misses events", async () => {
    const { adapter, commands } = createAdapter({
      GetConfigurationSetEventDestinationsCommand: {
        EventDestinations: [
          {
            Name: "existing-destination",
            Enabled: false,
            MatchingEventTypes: ["OPEN", "BOUNCE"],
            SnsDestination: { TopicArn: topicArn },
          },
        ],
      },
    });

    const result = await adapter.ensureEventDestination(accessKey, options);

    expect(commands[2]).toEqual({
      name: "UpdateConfigurationSetEventDestinationCommand",
      input: {
        ConfigurationSetName: "opencadence",
        EventDestinationName: "existing-destination",
        EventDestination: {
          Enabled: true,
          MatchingEventTypes: [
            "OPEN",
            "BOUNCE",
            "COMPLAINT",
            "DELIVERY",
            "DELIVERY_DELAY",
            "REJECT",
            "RENDERING_FAILURE",
          ],
          SnsDestination: { TopicArn: topicArn },
        },
      },
    });
    expect(result.eventDestination).toBe("updated");
  });

  it("repoints a destination with the same name to the topic", async () => {
    const { adapter, commands } = createAdapter({
      GetConfigurationSetEventDestinationsCommand: {
        EventDestinations: [
          {
            Name: "opencadence",
            Enabled: true,
            MatchingEventTypes: ["OPEN"],
            SnsDestination: {
              TopicArn: "arn:aws:sns:eu-west-1:123456789012:old-topic",
            },
          },
        ],
      },
    });

    await adapter.ensureEventDestination(accessKey, {
      ...options,
      eventTypes: ["BOUNCE", "COMPLAINT"],
    });

    expect(commands[2]?.name).toBe(
      "UpdateConfigurationSetEventDestinationCommand",
    );
    expect(commands[2]?.input.EventDestination).toEqual({
      Enabled: true,
      MatchingEventTypes: ["BOUNCE", "COMPLAINT"],
      SnsDestination: { TopicArn: topicArn },
    });
  });

  it.each([
    [{ ...options, configurationSetName: "has spaces" }],
    [{ ...options, topicArn: "arn:aws:sqs:eu-west-1:123456789012:queue" }],
    [{ ...options, topicArn: `${topicArn}.fifo` }],
  ])("rejects invalid options before calling AWS", async (invalid) => {
    const { adapter, commands } = createAdapter();

    const error = (await captureError(() =>
      adapter.ensureEventDestination(accessKey, invalid),
    )) as IntegrationError;

    expect(error.code).toBe("validation");
    expect(commands).toHaveLength(0);
  });

  it("names the missing permission", async () => {
    const { adapter } = createAdapter({
      CreateConfigurationSetCommand: awsError("AccessDeniedException", "", 403),
    });

    const error = (await captureError(() =>
      adapter.ensureEventDestination(accessKey, options),
    )) as IntegrationError;

    expect(error.code).toBe("insufficient_permission");
    expect(error.message).toContain("ses:CreateConfigurationSet");
  });

  it("reports a resource limit as a validation problem", async () => {
    const { adapter } = createAdapter({
      GetConfigurationSetEventDestinationsCommand: { EventDestinations: [] },
      CreateConfigurationSetEventDestinationCommand: awsError(
        "LimitExceededException",
        "Too many event destinations",
        400,
      ),
    });

    const error = (await captureError(() =>
      adapter.ensureEventDestination(accessKey, options),
    )) as IntegrationError;

    expect(error.code).toBe("validation");
  });
});
