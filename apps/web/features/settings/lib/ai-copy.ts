import type { ApiError } from "@/lib/api";

export const maxBaseUrlLength = 500;
export const maxModelLength = 200;

export const aiCopy = {
  metaTitle: "AI settings · OpenCadence",
  title: "AI",
  description:
    "The model provider that drafts, rewrites and reviews email in this workspace.",
  loading: "Loading AI settings",
  provider: {
    title: "Model provider",
    description:
      "This workspace brings its own API key. The key is stored encrypted and is never shown again. Requests go from this server straight to the endpoint you enter here, and nowhere else.",
    compatible:
      "Any provider with an OpenAI-compatible chat completions API works.",
    baseUrl: "Base URL",
    baseUrlHint: "The address of the provider's API, usually ending in /v1.",
    baseUrlMissing: "Enter the base URL of your provider's API.",
    baseUrlInvalid:
      "Enter a full address that starts with https://, such as https://api.together.xyz/v1.",
    baseUrlTooLong: (max: number) =>
      `Shorten the base URL to ${max} characters or fewer.`,
    baseUrlRejected:
      "The server cannot use this address. It must use https and point to a public host. To use a model server on a private network, the person who runs this server sets AI_ALLOW_PRIVATE_ENDPOINTS to true.",
    model: "Model",
    modelPlaceholder: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    modelHint:
      "The model identifier exactly as your provider lists it. Copy it from the provider's model page.",
    modelMissing: "Enter the model identifier from your provider.",
    modelTooLong: (max: number) =>
      `Shorten the model identifier to ${max} characters or fewer.`,
    apiKey: "API key",
    apiKeyHint: "Stored encrypted. You will not be able to view it again.",
    apiKeyMissing: "Paste the API key from your provider.",
    apiKeyReplaceMissing:
      "Paste the new API key, or choose Keep current key to leave it as it is.",
    apiKeyRejected:
      "The server did not accept this key. Paste it again without spaces or line breaks.",
    savedKey: "Saved API key",
    savedKeyValue: (hint: string) => `Ends in ${hint}`,
    savedKeyHidden: "A key is saved",
    savedKeyHint: "The key cannot be shown. Replace it to use a different one.",
    replace: "Replace key",
    keep: "Keep current key",
    save: "Save",
    test: "Test connection",
    testDirty: "Save your changes before testing the connection.",
    testIdle: "Test the connection to check the URL, model and key together.",
    notConfigured: "Nothing is saved yet. AI features stay off until you save.",
    testing: "Asking the model for a short reply.",
    testPassed: (model: string) => `Connected. ${model} answered.`,
    testPassedFallback: "Connected. The model answered.",
  },
  remove: {
    title: "Remove provider",
    description: "Turns the AI features off for everyone in this workspace.",
    body: "Removing the provider deletes the saved base URL, model and API key from this server. Templates and emails already written stay as they are.",
    note: "You can add a provider again at any time.",
    action: "Remove provider",
    dialogTitle: (workspace: string) =>
      `Remove the AI provider from ${workspace}?`,
    dialogBody: (host: string) =>
      `The saved key for ${host} is deleted and AI drafting, rewriting and review stop working for every member until a provider is added again.`,
    dialogBodyFallback:
      "The saved key is deleted and AI drafting, rewriting and review stop working for every member until a provider is added again.",
    confirm: "Remove provider",
  },
  readOnly: {
    title: "You can view the AI settings.",
    body: "An owner or admin of this workspace can change the provider.",
    emptyTitle: "No AI provider is set up.",
    emptyBody:
      "An owner or admin of this workspace can add one. Until then the AI features stay off.",
    notSet: "Not set",
  },
  loadFailed: "Could not load the AI settings.",
  toasts: {
    saved: "AI provider saved",
    saveFailed: "Could not save the AI provider",
    testPassed: "Connection works",
    testFailed: "Connection test failed",
    removed: "AI provider removed",
    removeFailed: "Could not remove the AI provider",
  },
  errors: {
    network:
      "This server did not answer. Check your connection and that the API is running.",
    signedOut:
      "You are signed out or have no active workspace. Reload the page and sign in again.",
    forbidden:
      "Your role does not allow changing the AI settings. Ask an owner or admin of this workspace.",
    notConfigured: "No provider is saved yet. Save the settings, then test.",
    rateLimited:
      "Too many AI requests in the last minute. Wait a minute, then try again.",
    provider:
      "The provider did not accept the request. Check the base URL, the model identifier and the API key.",
    providerDetail: (detail: string) =>
      `The provider did not accept the request: ${detail} Check the base URL, the model identifier and the API key.`,
    fallback: "Nothing was changed. Try again in a moment.",
  },
};

function sentence(text: string) {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export function describeAiError(error: ApiError) {
  if (error.status === 0) {
    return aiCopy.errors.network;
  }
  if (error.status === 401) {
    return aiCopy.errors.signedOut;
  }
  if (error.status === 403 || error.code === "forbidden") {
    return aiCopy.errors.forbidden;
  }
  if (error.code === "ai_provider_error") {
    return error.message
      ? aiCopy.errors.providerDetail(sentence(error.message))
      : aiCopy.errors.provider;
  }
  if (error.code === "ai_not_configured") {
    return aiCopy.errors.notConfigured;
  }
  if (error.code === "ai_rate_limited" || error.status === 429) {
    return aiCopy.errors.rateLimited;
  }
  if (error.code === "validation" && error.field === "baseUrl") {
    return aiCopy.provider.baseUrlRejected;
  }
  return error.message ?? aiCopy.errors.fallback;
}

export type AiField = "baseUrl" | "model" | "apiKey";

export function aiFieldError(
  error: ApiError,
): { field: AiField; message: string } | null {
  if (error.code !== "validation") {
    return null;
  }
  switch (error.field) {
    case "baseUrl":
      return { field: "baseUrl", message: aiCopy.provider.baseUrlRejected };
    case "model":
      return {
        field: "model",
        message: error.message ?? aiCopy.provider.modelMissing,
      };
    case "apiKey":
      return { field: "apiKey", message: aiCopy.provider.apiKeyRejected };
    default:
      return null;
  }
}

export function validateBaseUrl(value: string) {
  const text = value.trim();
  if (text === "") {
    return aiCopy.provider.baseUrlMissing;
  }
  if (text.length > maxBaseUrlLength) {
    return aiCopy.provider.baseUrlTooLong(maxBaseUrlLength);
  }
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:"
      ? undefined
      : aiCopy.provider.baseUrlInvalid;
  } catch {
    return aiCopy.provider.baseUrlInvalid;
  }
}

export function validateModel(value: string) {
  const text = value.trim();
  if (text === "") {
    return aiCopy.provider.modelMissing;
  }
  return text.length > maxModelLength
    ? aiCopy.provider.modelTooLong(maxModelLength)
    : undefined;
}

export function hostOf(baseUrl: string | null) {
  if (!baseUrl) {
    return null;
  }
  try {
    return new URL(baseUrl).host;
  } catch {
    return null;
  }
}
