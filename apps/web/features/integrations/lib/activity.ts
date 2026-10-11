import type { BadgeTone } from "@/components/status-badge";
import type {
  EventSeverity,
  SourceEvent,
} from "@/features/integrations/lib/sources";
import {
  createEventClock as createClock,
  type DateMode,
} from "@/lib/event-clock";

export const severityTones: Record<EventSeverity, BadgeTone> = {
  info: "success",
  warning: "warning",
  error: "danger",
};

export const severityLabels: Record<EventSeverity, string> = {
  info: "OK",
  warning: "Warning",
  error: "Failed",
};

type EventText = { title: string; detail: string };

const eventTexts: Record<string, EventText> = {
  connected: {
    title: "Source connected",
    detail: "The source was added to this workspace.",
  },
  reconnected: {
    title: "Reconnected",
    detail: "Access was approved again, so sending can continue.",
  },
  disconnected: {
    title: "Source disconnected",
    detail: "The source was removed and its saved credentials were deleted.",
  },
  connection_test_passed: {
    title: "Connection test passed",
    detail: "The provider accepted the saved credentials.",
  },
  connection_test_failed: {
    title: "Connection test failed",
    detail: "The provider did not accept the request. Open for its answer.",
  },
  auth_failed: {
    title: "Sign-in rejected",
    detail:
      "The provider refused the saved access. The source needs to be reconnected or given a new key.",
  },
  paused: {
    title: "Sending paused",
    detail: "Nothing goes out through this source until it is resumed.",
  },
  resumed: {
    title: "Sending resumed",
    detail: "The source is sending again.",
  },
  renamed: {
    title: "Source renamed",
    detail: "The name shown in OpenCadence was changed.",
  },
  limit_changed: {
    title: "Daily limit changed",
    detail: "The number of emails this source may send per day was updated.",
  },
  test_email_sent: {
    title: "Test email sent",
    detail: "The provider accepted a test email.",
  },
  test_email_failed: {
    title: "Test email failed",
    detail: "The provider did not accept the test email.",
  },
  webhook_registered: {
    title: "Event tracking registered",
    detail: "The provider will now report bounces and complaints.",
  },
  webhook_registration_failed: {
    title: "Event tracking not registered",
    detail:
      "Bounce and complaint tracking could not be set up with the provider.",
  },
  rate_limited: {
    title: "Rate limit reached",
    detail: "The provider asked OpenCadence to slow down.",
  },
};

const providerEventTexts: Record<string, EventText> = {
  sent: {
    title: "Email sent",
    detail: "The provider accepted an email for delivery.",
  },
  delivered: {
    title: "Email delivered",
    detail: "The recipient's mail server accepted the email.",
  },
  delayed: {
    title: "Delivery delayed",
    detail:
      "The recipient's mail server deferred the email. The provider keeps trying.",
  },
  bounced: {
    title: "Bounce received",
    detail: "The recipient's mail server rejected the email.",
  },
  complained: {
    title: "Complaint received",
    detail: "A recipient marked the email as spam.",
  },
  failed: {
    title: "Send failed",
    detail: "The provider could not send the email.",
  },
  suppressed: {
    title: "Recipient suppressed",
    detail:
      "The provider refused to send to an address on its suppression list.",
  },
};

function humanize(value: string) {
  const words = value.replace(/[_.-]+/g, " ").trim();
  return words === ""
    ? ""
    : `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

export const activityCopy = {
  title: "Activity log",
  description:
    "What happened on each sending source: connections, tests, limits and provider events.",
  sourceLabel: "Filter by source",
  sourcePlaceholder: "All sources",
  sourceEmpty: "No source matches. Clear the box to see all.",
  levelLabel: "Result",
  levels: { all: "All", warning: "Warnings", error: "Failed" },
  activeFilters: "Active filters",
  removeFilter: (label: string) => `Remove filter: ${label}`,
  clearAll: "Clear all",
  count: (shown: number, more: boolean) =>
    more
      ? `Latest ${shown} events`
      : `${shown} ${shown === 1 ? "event" : "events"}`,
  columns: {
    time: "Time",
    source: "Source",
    event: "Event",
    result: "Result",
  },
  days: { today: "Today", yesterday: "Yesterday" },
  open: (title: string, source: string) => `${title}, ${source}. Open details`,
  removedSource: "Removed source",
  unknownEvent: "Source event",
  unknownDetail: "OpenCadence recorded this event for the source.",
  providerEvent: "Provider event",
  providerDetail: "The provider reported an event for an email.",
  emptyTitle: "No activity yet",
  emptyBody:
    "Connections, tests and provider events show up here as they happen.",
  noMatchTitle: "No events match",
  noMatchBody: "Try a different source or result, or clear the filters.",
  loadMore: "Load more",
  loadMoreFailed: "Could not load more events",
  loadFailed: {
    title: "Could not load the activity log.",
    body: "The server did not answer. Check that the API is running, then try again.",
    retry: "Try again",
  },
  sheet: {
    when: "When",
    source: "Source",
    result: "Result",
    response: "Response from the provider",
    copy: "Copy",
    copied: "Copied",
    copyFailed: "Could not copy the response",
    copyFailedBody:
      "Your browser blocked access to the clipboard. Select the text and copy it by hand.",
    viewSource: "View source",
    whenAt: (day: string, time: string) => `${day}, ${time}`,
  },
};

export function eventText(
  event: Pick<SourceEvent, "type" | "code">,
): EventText {
  if (event.type === "provider_event") {
    return (
      providerEventTexts[event.code ?? ""] ?? {
        title: humanize(event.code ?? "") || activityCopy.providerEvent,
        detail: activityCopy.providerDetail,
      }
    );
  }
  return (
    eventTexts[event.type] ?? {
      title: humanize(event.type) || activityCopy.unknownEvent,
      detail: activityCopy.unknownDetail,
    }
  );
}

export function eventResponse(event: Pick<SourceEvent, "code" | "message">) {
  if (!event.message) {
    return null;
  }
  return event.code ? `${event.code}\n${event.message}` : event.message;
}

export type { EventClock, EventMoment } from "@/lib/event-clock";

export function createEventClock(mode: DateMode, now: Date) {
  return createClock(mode, now, activityCopy.days);
}
