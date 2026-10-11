export const capabilities = [
  "send",
  "replies",
  "warmup",
  "webhooks",
  "volume",
] as const;

export type Capability = (typeof capabilities)[number];
