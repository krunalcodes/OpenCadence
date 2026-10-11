import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useIntervalRefresh } from "@/features/inbox/hooks/use-interval-refresh";
import { copy, describeActionError } from "@/features/inbox/lib/copy";
import {
  appendPage,
  filtersKey,
  type InboxFilters,
  type InboxMessage,
  isId,
  mergeFirstPage,
  refreshEveryMs,
  type Thread,
  type ThreadDetail,
  type ThreadResult,
  type ThreadsResult,
} from "@/features/inbox/lib/inbox";
import {
  fetchThread,
  fetchThreads,
  type ThreadAction,
  updateThread,
} from "@/features/inbox/queries/client";
import { publishInboxUnread } from "@/lib/inbox-unread";

export type ListState = {
  key: string;
  status: "ready" | "loading" | "failed";
  items: Thread[];
  cursor: string | null;
  loadedMore: boolean;
};

export type DetailState =
  | { id: string; status: "loading" | "missing" | "failed" }
  | { id: string; status: "ready"; thread: ThreadDetail };

type ThreadPatch = Partial<
  Pick<
    Thread,
    | "status"
    | "unread"
    | "lastDirection"
    | "lastMessageAt"
    | "snippet"
    | "messageCount"
  >
>;

type UseInboxInput = {
  initial: ThreadsResult;
  filters: InboxFilters;
  selectedId: string | null;
  initialThreadId: string | null;
  initialThread: ThreadResult | null;
};

const statusAfterSend = [2500, 8000];

function toDetail(id: string, result: ThreadResult): DetailState {
  return result.state === "ready"
    ? { id, status: "ready", thread: result.thread }
    : { id, status: result.state };
}

export function useInbox({
  initial,
  filters,
  selectedId,
  initialThreadId,
  initialThread,
}: UseInboxInput) {
  const key = filtersKey(filters);
  const [list, setList] = useState<ListState>(() => ({
    key,
    status: initial.state === "ready" ? "ready" : "failed",
    items: initial.state === "ready" ? initial.items : [],
    cursor: initial.state === "ready" ? initial.nextCursor : null,
    loadedMore: false,
  }));
  const [unreadCount, setUnreadCount] = useState(
    initial.state === "ready" ? initial.unreadCount : null,
  );
  const [detail, setDetail] = useState<DetailState | null>(() =>
    initialThreadId && initialThread
      ? toDetail(initialThreadId, initialThread)
      : null,
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [acting, setActing] = useState<ThreadAction | null>(null);

  const filtersRef = useRef(filters);
  const listRef = useRef(list);
  const detailRef = useRef(detail);
  const selectedRef = useRef(selectedId);
  const unreadRef = useRef(unreadCount);
  const listRequest = useRef(0);
  const epoch = useRef(0);
  const readMark = useRef<string | null>(null);
  const timers = useRef<number[]>([]);
  const mounted = useRef(false);

  const putList = useCallback((next: ListState) => {
    listRef.current = next;
    setList(next);
  }, []);

  const putDetail = useCallback((next: DetailState | null) => {
    detailRef.current = next;
    setDetail(next);
  }, []);

  const putUnread = useCallback((next: number) => {
    const count = Math.max(0, next);
    unreadRef.current = count;
    setUnreadCount(count);
    publishInboxUnread(count);
  }, []);

  const patchThread = useCallback(
    (id: string, patch: ThreadPatch) => {
      const current = listRef.current;
      putList({
        ...current,
        items: current.items.map((item) =>
          item.id === id ? { ...item, ...patch } : item,
        ),
      });
      const open = detailRef.current;
      if (open?.id === id && open.status === "ready") {
        putDetail({ ...open, thread: { ...open.thread, ...patch } });
      }
    },
    [putList, putDetail],
  );

  const loadList = useCallback(
    async (wanted: InboxFilters) => {
      const request = listRequest.current + 1;
      listRequest.current = request;
      putList({
        ...listRef.current,
        key: filtersKey(wanted),
        status: "loading",
      });
      const result = await fetchThreads(wanted);
      if (listRequest.current !== request) {
        return;
      }
      if (!result.ok) {
        putList({
          key: filtersKey(wanted),
          status: "failed",
          items: [],
          cursor: null,
          loadedMore: false,
        });
        return;
      }
      putList({
        key: filtersKey(wanted),
        status: "ready",
        items: result.data.items,
        cursor: result.data.nextCursor,
        loadedMore: false,
      });
      putUnread(result.data.unreadCount);
    },
    [putList, putUnread],
  );

  const refreshList = useCallback(async () => {
    const current = listRef.current;
    if (current.status === "loading") {
      return;
    }
    const request = listRequest.current;
    const started = epoch.current;
    const result = await fetchThreads(filtersRef.current);
    if (
      !result.ok ||
      listRequest.current !== request ||
      epoch.current !== started
    ) {
      return;
    }
    const latest = listRef.current;
    const keepTail = latest.status === "ready" && latest.loadedMore;
    putList({
      key: latest.key,
      status: "ready",
      items: mergeFirstPage(latest.items, result.data, keepTail),
      cursor:
        keepTail && result.data.nextCursor !== null
          ? latest.cursor
          : result.data.nextCursor,
      loadedMore: keepTail && result.data.nextCursor !== null,
    });
    putUnread(result.data.unreadCount);
  }, [putList, putUnread]);

  const loadDetail = useCallback(
    async (id: string, quiet: boolean) => {
      const started = epoch.current;
      const result = await fetchThread(id);
      if (selectedRef.current !== id) {
        return;
      }
      if (quiet && epoch.current !== started) {
        return;
      }
      if (result.ok) {
        putDetail({ id, status: "ready", thread: result.data });
        return;
      }
      const missing =
        result.error.status === 404 || result.error.status === 400;
      if (missing) {
        putDetail({ id, status: "missing" });
      } else if (!quiet) {
        putDetail({ id, status: "failed" });
      }
    },
    [putDetail],
  );

  useEffect(() => {
    filtersRef.current = filters;
    if (listRef.current.key !== key) {
      void loadList(filters);
    }
  }, [filters, key, loadList]);

  useEffect(() => {
    const firstRun = !mounted.current;
    mounted.current = true;
    selectedRef.current = selectedId;
    readMark.current = null;
    if (!selectedId) {
      return;
    }
    const known = detailRef.current;
    if (known?.id === selectedId && (firstRun || known.status === "ready")) {
      if (!firstRun) {
        void loadDetail(selectedId, true);
      }
      return;
    }
    if (!isId(selectedId)) {
      putDetail({ id: selectedId, status: "missing" });
      return;
    }
    putDetail({ id: selectedId, status: "loading" });
    void loadDetail(selectedId, false);
  }, [selectedId, loadDetail, putDetail]);

  useEffect(() => {
    if (
      detail?.status !== "ready" ||
      detail.id !== selectedId ||
      !detail.thread.unread
    ) {
      return;
    }
    const current = detailRef.current;
    if (current?.status !== "ready" || !current.thread.unread) {
      return;
    }
    const { id, lastMessageAt, status } = detail.thread;
    const mark = `${id}:${lastMessageAt}`;
    if (readMark.current === mark) {
      return;
    }
    readMark.current = mark;
    epoch.current += 1;
    patchThread(id, { unread: false });
    if (status === "open" && unreadRef.current !== null) {
      putUnread(unreadRef.current - 1);
    }
    void updateThread(id, "read").then(() => {
      epoch.current += 1;
    });
  }, [detail, selectedId, patchThread, putUnread]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  useIntervalRefresh(
    refreshEveryMs,
    useCallback(async () => {
      const open = selectedRef.current;
      const known = detailRef.current;
      await Promise.all([
        refreshList(),
        open && known?.id === open && known.status === "ready"
          ? loadDetail(open, true)
          : null,
      ]);
    }, [refreshList, loadDetail]),
  );

  async function act(
    thread: Thread,
    action: Exclude<ThreadAction, "read">,
    failure: string,
  ) {
    const before: ThreadPatch = {
      status: thread.status,
      unread: thread.unread,
    };
    const after: ThreadPatch =
      action === "close"
        ? { status: "closed" }
        : action === "reopen"
          ? { status: "open" }
          : { unread: true };
    const wasCounted = thread.status === "open" && thread.unread;
    const willCount =
      (after.status ?? thread.status) === "open" &&
      (after.unread ?? thread.unread);
    epoch.current += 1;
    setActing(action);
    if (action === "unread") {
      readMark.current = `${thread.id}:${thread.lastMessageAt}`;
    }
    patchThread(thread.id, after);
    if (unreadRef.current !== null && wasCounted !== willCount) {
      putUnread(unreadRef.current + (willCount ? 1 : -1));
    }
    const leaves =
      action !== "unread" &&
      filtersRef.current.status !== "all" &&
      filtersRef.current.status !== after.status;
    if (leaves) {
      const current = listRef.current;
      putList({
        ...current,
        items: current.items.filter((item) => item.id !== thread.id),
      });
    }
    const result = await updateThread(thread.id, action);
    epoch.current += 1;
    setActing(null);
    if (!result.ok) {
      patchThread(thread.id, before);
      toast.error(failure, { description: describeActionError(result.error) });
      void refreshList();
      if (result.error.status === 404 && selectedRef.current === thread.id) {
        putDetail({ id: thread.id, status: "missing" });
      }
      return false;
    }
    void refreshList();
    return true;
  }

  function close(thread: Thread) {
    return act(thread, "close", copy.toasts.closeFailed);
  }

  function reopen(thread: Thread) {
    return act(thread, "reopen", copy.toasts.reopenFailed);
  }

  function markUnread(thread: Thread) {
    return act(thread, "unread", copy.toasts.unreadFailed);
  }

  function replySent(thread: Thread, message: InboxMessage) {
    epoch.current += 1;
    const open = detailRef.current;
    if (open?.id === thread.id && open.status === "ready") {
      putDetail({
        ...open,
        thread: {
          ...open.thread,
          messages: open.thread.messages.some((item) => item.id === message.id)
            ? open.thread.messages
            : [...open.thread.messages, message],
        },
      });
    }
    const wasCounted = thread.status === "open" && thread.unread;
    patchThread(thread.id, {
      status: "open",
      unread: false,
      lastDirection: "outbound",
      lastMessageAt: message.occurredAt || thread.lastMessageAt,
      snippet: (message.text ?? "").replace(/\s+/g, " ").trim().slice(0, 200),
      messageCount: thread.messageCount + 1,
    });
    if (wasCounted && unreadRef.current !== null) {
      putUnread(unreadRef.current - 1);
    }
    for (const delay of statusAfterSend) {
      timers.current.push(
        window.setTimeout(() => {
          void refreshList();
          if (selectedRef.current === thread.id) {
            void loadDetail(thread.id, true);
          }
        }, delay),
      );
    }
  }

  async function loadMore() {
    const current = listRef.current;
    if (loadingMore || current.status !== "ready" || !current.cursor) {
      return;
    }
    const request = listRequest.current;
    setLoadingMore(true);
    const result = await fetchThreads(filtersRef.current, current.cursor);
    setLoadingMore(false);
    if (listRequest.current !== request) {
      return;
    }
    if (!result.ok) {
      toast.error(copy.loadMoreFailed, {
        description: describeActionError(result.error),
      });
      return;
    }
    const latest = listRef.current;
    putList({
      ...latest,
      items: appendPage(latest.items, result.data.items),
      cursor: result.data.nextCursor,
      loadedMore: true,
    });
  }

  async function retryList() {
    setRetrying(true);
    await loadList(filtersRef.current);
    setRetrying(false);
  }

  async function retryThread() {
    const id = selectedRef.current;
    if (!id) {
      return;
    }
    setRetrying(true);
    await loadDetail(id, false);
    setRetrying(false);
  }

  const shown: DetailState | null = !selectedId
    ? null
    : detail?.id === selectedId
      ? detail
      : { id: selectedId, status: "loading" };

  return {
    list,
    detail: shown,
    unreadCount,
    loadingMore,
    retrying,
    acting,
    close,
    reopen,
    markUnread,
    replySent,
    loadMore,
    retryList,
    retryThread,
  };
}
