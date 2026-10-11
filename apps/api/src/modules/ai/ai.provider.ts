import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, streamText } from "ai";

export type ProviderSettings = {
  baseUrl: string;
  model: string;
  apiKey: string;
};

export type GenerationRequest = {
  settings: ProviderSettings;
  instructions: string;
  prompt: string;
  maxOutputTokens: number;
  temperature: number;
  timeoutMs: number;
  signal?: AbortSignal;
};

export class AiProviderError extends Error {
  constructor(
    readonly summary: string,
    readonly status: number | null,
  ) {
    super(summary);
  }
}

const withoutRedirects: typeof fetch = (input, init) =>
  fetch(input, { ...init, redirect: "error" });

function model(settings: ProviderSettings) {
  return createOpenAICompatible({
    name: "workspace",
    baseURL: settings.baseUrl,
    apiKey: settings.apiKey,
    fetch: withoutRedirects,
  }).chatModel(settings.model);
}

function statusOf(error: unknown, depth = 0): number | null {
  if (typeof error !== "object" || error === null || depth > 4) {
    return null;
  }
  const { statusCode, lastError, cause } = error as {
    statusCode?: unknown;
    lastError?: unknown;
    cause?: unknown;
  };
  if (typeof statusCode === "number") {
    return statusCode;
  }
  return statusOf(lastError, depth + 1) ?? statusOf(cause, depth + 1);
}

function isTimeout(error: unknown, depth = 0): boolean {
  if (typeof error !== "object" || error === null || depth > 4) {
    return false;
  }
  const { name, lastError, cause } = error as {
    name?: unknown;
    lastError?: unknown;
    cause?: unknown;
  };
  return (
    name === "TimeoutError" ||
    name === "AbortError" ||
    isTimeout(lastError, depth + 1) ||
    isTimeout(cause, depth + 1)
  );
}

export function toProviderError(error: unknown) {
  if (error instanceof AiProviderError) {
    return error;
  }
  const status = statusOf(error);
  if (status === 401 || status === 403) {
    return new AiProviderError("The AI provider rejected the API key.", status);
  }
  if (status === 404) {
    return new AiProviderError(
      "The AI provider did not find the model or the endpoint. Check the base URL and the model name.",
      status,
    );
  }
  if (status === 429) {
    return new AiProviderError(
      "The AI provider is limiting requests for this key. Try again shortly.",
      status,
    );
  }
  if (status !== null && status >= 500) {
    return new AiProviderError(
      "The AI provider had an error. Try again shortly.",
      status,
    );
  }
  if (status !== null) {
    return new AiProviderError(
      "The AI provider did not accept the request. Check the model name.",
      status,
    );
  }
  if (isTimeout(error)) {
    return new AiProviderError(
      "The AI provider took too long to respond.",
      null,
    );
  }
  return new AiProviderError("The AI provider could not be reached.", null);
}

function callOptions(request: GenerationRequest) {
  return {
    model: model(request.settings),
    instructions: request.instructions,
    prompt: request.prompt,
    maxOutputTokens: request.maxOutputTokens,
    temperature: request.temperature,
    timeout: request.timeoutMs,
    abortSignal: request.signal,
    maxRetries: 1,
  };
}

export async function generate(request: GenerationRequest) {
  try {
    const result = await generateText(callOptions(request));
    return result.text;
  } catch (error) {
    throw toProviderError(error);
  }
}

export async function* streamGeneration(
  request: GenerationRequest,
): AsyncGenerator<string> {
  try {
    const result = streamText({
      ...callOptions(request),
      onError: () => undefined,
    });
    for await (const part of result.stream) {
      if (part.type === "text-delta") {
        yield part.text;
      } else if (part.type === "error") {
        throw toProviderError(part.error);
      } else if (part.type === "abort") {
        throw new AiProviderError(
          "The AI provider took too long to respond.",
          null,
        );
      }
    }
  } catch (error) {
    throw toProviderError(error);
  }
}
