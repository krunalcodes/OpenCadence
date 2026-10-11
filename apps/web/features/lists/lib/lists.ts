import { countOf, isRow, type Row, rowsOf, textOrNull } from "@/lib/api";

export type List = {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  publicName: string | null;
  publicDescription: string | null;
  subscribedCount: number;
  unsubscribedCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ListsResult =
  | { state: "ready"; lists: List[] }
  | { state: "failed" };

export type ListInput = {
  name: string;
  description: string;
  isPublic: boolean;
  publicName: string;
  publicDescription: string;
};

export const maxPublicNameLength = 80;
export const maxPublicDescriptionLength = 500;

export function toList(value: unknown): List | null {
  if (!isRow(value)) {
    return null;
  }
  const row: Row = value;
  const id = textOrNull(row.id);
  const name = textOrNull(row.name);
  if (!id || !name) {
    return null;
  }
  return {
    id,
    name,
    description: textOrNull(row.description),
    isPublic: row.isPublic === true,
    publicName: textOrNull(row.publicName),
    publicDescription: textOrNull(row.publicDescription),
    subscribedCount: countOf(row.subscribedCount),
    unsubscribedCount: countOf(row.unsubscribedCount),
    createdAt: textOrNull(row.createdAt) ?? "",
    updatedAt: textOrNull(row.updatedAt) ?? "",
  };
}

export function toLists(value: unknown): List[] | null {
  if (!isRow(value) || !Array.isArray(value.lists)) {
    return null;
  }
  return rowsOf(value.lists).flatMap((item) => {
    const list = toList(item);
    return list ? [list] : [];
  });
}

export function listContactsSearch(id: string) {
  return new URLSearchParams({ listId: id }).toString();
}
