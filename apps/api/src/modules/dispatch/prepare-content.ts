import { messageToken, prepareEmail } from "@workspace/email-renderer";
import type { MessageContent, StoredContent } from "./content-archive";
import { unsubscribeMarkerHeader } from "./dispatch.constants";
import type { SnapshotRow } from "./dispatch.repository";

export type PrepareContentInput = {
  message: {
    id: string;
    trackOpens: boolean;
    trackClicks: boolean;
    unsubscribeListId: string | null;
  };
  content: StoredContent;
  snapshot: SnapshotRow | null;
  keys: { secret: Buffer; baseUrl: string };
  preview?: boolean;
};

export function withoutMarker(headers: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(headers).filter(
      ([name]) => name.toLowerCase() !== unsubscribeMarkerHeader,
    ),
  );
}

export function hasUnsubscribe(
  message: { unsubscribeListId: string | null },
  headers: Record<string, string>,
) {
  return (
    message.unsubscribeListId !== null ||
    Object.keys(headers).some(
      (name) => name.toLowerCase() === unsubscribeMarkerHeader,
    )
  );
}

export function prepareContent(input: PrepareContentInput): MessageContent {
  const { message, content, snapshot, keys } = input;
  const headers = withoutMarker(content.headers);
  const preview = input.preview === true;
  const unsubscribe = !preview && hasUnsubscribe(message, content.headers);
  const trackOpens = !preview && message.trackOpens;
  const trackClicks = !preview && message.trackClicks;
  if (!snapshot && !unsubscribe && !trackOpens && !trackClicks) {
    return { html: content.html, text: content.text, headers };
  }
  return prepareEmail({
    html: snapshot ? snapshot.html : content.html,
    text: snapshot ? snapshot.text || null : content.text,
    previewText: snapshot?.previewText || undefined,
    variables: { ...(content.variables ?? {}) },
    messageToken: messageToken(message.id, keys.secret),
    baseUrl: keys.baseUrl,
    secret: keys.secret,
    trackOpens,
    trackClicks,
    unsubscribe,
    headers,
  });
}
