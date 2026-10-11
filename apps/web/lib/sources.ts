import { isRow, rowsOf, textOrNull } from "@/lib/api";

export type SourceStatus = "active" | "paused" | "needs_attention";

export type SourceChoice = {
  id: string;
  name: string;
  email: string | null;
  integrationType: string;
  status: SourceStatus;
  isDefault: boolean;
};

const statuses: SourceStatus[] = ["active", "paused", "needs_attention"];

export function toSourceChoice(value: unknown): SourceChoice | null {
  if (!isRow(value)) {
    return null;
  }
  const id = textOrNull(value.id);
  const integrationType = textOrNull(value.integrationType);
  if (!id || !integrationType) {
    return null;
  }
  const email = textOrNull(value.email);
  return {
    id,
    name: textOrNull(value.name) ?? email ?? integrationType,
    email,
    integrationType,
    status: statuses.find((status) => status === value.status) ?? "active",
    isDefault: value.isDefault === true,
  };
}

export function toSourceChoices(value: unknown): SourceChoice[] {
  if (!isRow(value)) {
    return [];
  }
  return rowsOf(value.sources).flatMap((item) => {
    const source = toSourceChoice(item);
    return source ? [source] : [];
  });
}

export function canSendFrom(source: SourceChoice) {
  return source.status === "active";
}

export function sourceLabel(source: SourceChoice) {
  return source.email && source.email !== source.name
    ? `${source.name} (${source.email})`
    : source.name;
}
