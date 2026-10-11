import { useState } from "react";

export type LoadedPage<T> = { items: T[]; nextCursor: string | null };

type Extra<T> = { key: unknown; items: T[]; cursor: string | null };

export function useLoadMore<T extends { id: string }>(
  key: unknown,
  first: LoadedPage<T>,
) {
  const [extra, setExtra] = useState<Extra<T>>({
    key,
    items: [],
    cursor: first.nextCursor,
  });
  const [loading, setLoading] = useState(false);

  if (extra.key !== key) {
    setExtra({ key, items: [], cursor: first.nextCursor });
  }

  const current = extra.key === key;
  const items = current ? [...first.items, ...extra.items] : first.items;
  const cursor = current ? extra.cursor : first.nextCursor;

  async function loadMore(
    fetchPage: (cursor: string) => Promise<LoadedPage<T> | null>,
  ) {
    if (loading || !cursor) {
      return;
    }
    setLoading(true);
    const page = await fetchPage(cursor);
    setLoading(false);
    if (!page) {
      return;
    }
    setExtra((state) => {
      if (state.key !== key) {
        return state;
      }
      const known = new Set(
        [...first.items, ...state.items].map((item) => item.id),
      );
      return {
        key,
        items: [
          ...state.items,
          ...page.items.filter((item) => !known.has(item.id)),
        ],
        cursor: page.nextCursor,
      };
    });
  }

  return { items, cursor, loading, loadMore };
}
