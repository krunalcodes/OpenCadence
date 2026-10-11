import type { Metadata } from "next";
import { InboxScreen } from "@/features/inbox/components/inbox-screen";
import { toFilters } from "@/features/inbox/lib/inbox";
import {
  getSources,
  getThread,
  getThreads,
} from "@/features/inbox/queries/inbox";
import { getActiveWorkspace } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const workspace = await getActiveWorkspace();
  return {
    title: workspace ? `Inbox · ${workspace.name}` : "Inbox",
  };
}

type InboxPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) || null;
}

export default async function InboxPage({ searchParams }: InboxPageProps) {
  const params = await searchParams;
  const filters = toFilters({
    status: first(params.status),
    unread: first(params.unread),
    source: first(params.source),
    q: first(params.q),
  });
  const threadId = first(params.thread);
  const [workspace, initial, sources, initialThread] = await Promise.all([
    getActiveWorkspace(),
    getThreads(filters),
    getSources(),
    threadId ? getThread(threadId) : null,
  ]);
  return (
    <InboxScreen
      key={workspace?.id ?? "none"}
      initial={initial}
      initialThreadId={threadId}
      initialThread={initialThread}
      sources={sources}
    />
  );
}
