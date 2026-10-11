import { useSyncExternalStore } from "react";

type Published = { token: string; count: number };

const listeners = new Set<() => void>();
let currentToken = "";
let published: Published | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot() {
  return published;
}

function serverSnapshot() {
  return null;
}

export function publishInboxUnread(count: number) {
  if (published?.token === currentToken && published.count === count) {
    return;
  }
  published = { token: currentToken, count };
  for (const listener of listeners) {
    listener();
  }
}

export function useInboxUnread(loaded: number | undefined, scope: string) {
  const token = `${scope}:${loaded ?? ""}`;
  const live = useSyncExternalStore(subscribe, snapshot, serverSnapshot);

  if (typeof window !== "undefined") {
    currentToken = token;
  }

  return live && live.token === token ? live.count : loaded;
}
