import {
  type InboxSupport,
  IntegrationError,
} from "@workspace/integration-core";
import type { OutlookContext } from "./config";
import { fetchReceived } from "./content";
import { listReceived } from "./received";

function readOnly(): never {
  throw new IntegrationError(
    "insufficient_permission",
    "Outlook mailboxes are connected with read-only inbox access, so messages cannot be searched for, moved, or changed.",
  );
}

export function createInbox(context: OutlookContext): InboxSupport {
  return {
    search: async () => readOnly(),
    applyActions: async (_credentials, ref, actions) => ({
      ref,
      unsupported: [...new Set(actions.map((action) => action.type))],
    }),
    ensureFolder: async () => readOnly(),
    listReceived: (credentials, input) =>
      listReceived(context, credentials, input),
    fetchReceived: (credentials, ref) =>
      fetchReceived(context, credentials, ref),
  };
}
