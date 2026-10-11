import { isRow, textOrNull } from "@/lib/api";

export type AiSettings = {
  configured: boolean;
  baseUrl: string | null;
  model: string | null;
  keyHint: string | null;
  canManage: boolean;
};

export const defaultAiBaseUrl = "https://api.together.xyz/v1";

export function parseAiSettings(value: unknown): AiSettings | null {
  if (!isRow(value) || typeof value.configured !== "boolean") {
    return null;
  }
  return {
    configured: value.configured,
    baseUrl: textOrNull(value.baseUrl),
    model: textOrNull(value.model),
    keyHint: textOrNull(value.keyHint),
    canManage: value.canManage === true,
  };
}
