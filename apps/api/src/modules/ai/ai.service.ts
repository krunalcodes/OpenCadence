import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { apiError } from "../../common/api-error";
import type { Env } from "../../config/env";
import { CryptoService } from "../../infra/crypto/crypto.service";
import { BrandService } from "../brand/brand.service";
import { checkEndpoint } from "./ai.endpoint";
import { htmlToText } from "./ai.html";
import { parseReviewIssues, parseSubjects } from "./ai.parse";
import {
  AiProviderError,
  generate,
  type ProviderSettings,
  streamGeneration,
} from "./ai.provider";
import { AiRateLimiter } from "./ai.rate-limiter";
import {
  AiRepository,
  type AiSettingsKey,
  type AiSettingsRow,
} from "./ai.repository";
import { type ReviewIssue, runReviewRules } from "./ai.review-rules";
import { prime, skipThinking, startAt } from "./ai.stream";
import {
  type DraftKind,
  draftInstructions,
  draftPrompt,
} from "./prompts/draft";
import { reviewInstructions, reviewPrompt } from "./prompts/review";
import {
  type RewriteAction,
  rewriteInstructions,
  rewritePrompt,
} from "./prompts/rewrite";
import type { PromptBrand } from "./prompts/shared";
import { subjectsInstructions, subjectsPrompt } from "./prompts/subjects";

export type AiSettings = {
  configured: boolean;
  baseUrl: string | null;
  model: string | null;
  keyHint: string | null;
};

type Input = Record<string, unknown>;

type Actor = { workspaceId: string; userId: string };

const GENERATION_TIMEOUT_MS = 60_000;
const TEST_TIMEOUT_MS = 20_000;
const MAX_PROMPT = 4_000;
const MAX_HTML = 200_000;
const MAX_REWRITE_TEXT = 8_000;
const MAX_INSTRUCTION = 500;
const MAX_TONE = 200;
const MAX_SUBJECT = 998;
const MAX_PREVIEW = 300;
const MAX_MERGE_TAGS = 50;
const MAX_CONTENT_FOR_MODEL = 12_000;
const MAX_MODEL = 200;
const MAX_API_KEY = 500;
const MIN_HINTED_KEY = 12;
const STREAM_ERROR = "\n<error>ai_provider_error</error>\n";

const DRAFT_KINDS: readonly DraftKind[] = [
  "newsletter",
  "outreach",
  "announcement",
  "transactional",
];
const REWRITE_ACTIONS: readonly RewriteAction[] = [
  "shorten",
  "expand",
  "friendlier",
  "more_formal",
  "fix_grammar",
  "custom",
];
const MERGE_KEY = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)?$/;

function invalid(field: string, message: string) {
  return apiError(HttpStatus.BAD_REQUEST, "validation", message, field);
}

function providerFailure(error: AiProviderError) {
  return apiError(HttpStatus.BAD_GATEWAY, "ai_provider_error", error.summary);
}

function requiredText(input: Input, field: string, max: number) {
  const value = input[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw invalid(field, `${field} is required.`);
  }
  if (value.length > max) {
    throw invalid(field, `${field} must be at most ${max} characters.`);
  }
  return value;
}

function optionalText(input: Input, field: string, max: number) {
  const value = input[field];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw invalid(field, `${field} must be text.`);
  }
  if (value.length > max) {
    throw invalid(field, `${field} must be at most ${max} characters.`);
  }
  return value.trim() === "" ? null : value;
}

function oneOf<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
) {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw invalid(field, `${field} must be one of: ${allowed.join(", ")}.`);
  }
  return value as T;
}

function aad(workspaceId: string) {
  return `${workspaceId}:ai_api_key`;
}

function hostOf(baseUrl: string) {
  return new URL(baseUrl).host.toLowerCase();
}

function view(row: AiSettingsRow | null): AiSettings {
  return row
    ? {
        configured: true,
        baseUrl: row.baseUrl,
        model: row.model,
        keyHint: row.apiKeyHint,
      }
    : { configured: false, baseUrl: null, model: null, keyHint: null };
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly allowPrivate: boolean;

  constructor(
    @Inject(AiRepository) private readonly repository: AiRepository,
    @Inject(CryptoService) private readonly crypto: CryptoService,
    @Inject(AiRateLimiter) private readonly rateLimiter: AiRateLimiter,
    @Inject(BrandService) private readonly brand: BrandService,
    @Inject(ConfigService) config: ConfigService<Env, true>,
  ) {
    this.allowPrivate = config.get("AI_ALLOW_PRIVATE_ENDPOINTS", {
      infer: true,
    });
  }

  async getSettings(workspaceId: string) {
    return view(await this.repository.get(workspaceId));
  }

  async saveSettings(actor: Actor, input: Input) {
    if (typeof input.baseUrl !== "string") {
      throw invalid(
        "baseUrl",
        "Enter the base URL of an OpenAI-compatible API.",
      );
    }
    const endpoint = await checkEndpoint(input.baseUrl, {
      allowPrivate: this.allowPrivate,
    });
    if (!endpoint.ok) {
      throw invalid("baseUrl", endpoint.message);
    }

    const model = typeof input.model === "string" ? input.model.trim() : "";
    if (model === "" || model.length > MAX_MODEL || /\s/.test(model)) {
      throw invalid(
        "model",
        `Enter the model name, without spaces, at most ${MAX_MODEL} characters.`,
      );
    }

    let apiKey: string | null = null;
    if (input.apiKey !== undefined && input.apiKey !== null) {
      if (typeof input.apiKey !== "string") {
        throw invalid("apiKey", "The API key must be text.");
      }
      apiKey = input.apiKey.trim();
      if (
        apiKey === "" ||
        apiKey.length > MAX_API_KEY ||
        !/^[\x21-\x7e]+$/.test(apiKey)
      ) {
        throw invalid("apiKey", "Enter a valid API key.");
      }
    }

    const existing = await this.repository.get(actor.workspaceId);
    if (!apiKey && !existing) {
      throw invalid("apiKey", "Enter the API key.");
    }
    if (
      !apiKey &&
      existing &&
      hostOf(existing.baseUrl) !== hostOf(endpoint.url)
    ) {
      throw invalid(
        "apiKey",
        "Enter the API key again when changing the endpoint, so the saved key is never sent to a different host.",
      );
    }

    const write = {
      baseUrl: endpoint.url,
      model,
      updatedByUserId: actor.userId,
    };
    const row = apiKey
      ? await this.repository.create(actor.workspaceId, {
          ...write,
          key: this.seal(actor.workspaceId, apiKey),
        })
      : await this.repository.update(actor.workspaceId, {
          ...write,
          key: null,
        });
    return view(row);
  }

  async deleteSettings(workspaceId: string) {
    await this.repository.delete(workspaceId);
  }

  async testSettings(workspaceId: string, signal?: AbortSignal) {
    const settings = await this.ready(workspaceId);
    try {
      await generate({
        settings,
        instructions:
          "You are a connection test. Reply with the single word ok.",
        prompt: "Reply with ok.",
        maxOutputTokens: 16,
        temperature: 0,
        timeoutMs: TEST_TIMEOUT_MS,
        signal,
      });
    } catch (error) {
      throw this.failed(error);
    }
    return { ok: true as const };
  }

  async draft(workspaceId: string, input: Input, signal?: AbortSignal) {
    const prompt = requiredText(input, "prompt", MAX_PROMPT);
    const kind =
      input.kind === undefined || input.kind === null
        ? null
        : oneOf(input.kind, "kind", DRAFT_KINDS);
    const tone = optionalText(input, "tone", MAX_TONE);
    const currentHtml = optionalText(input, "currentHtml", MAX_HTML);
    const mergeTags = this.mergeTags(input.mergeTags);

    const settings = await this.ready(workspaceId);
    const promptInput = {
      brand: await this.promptBrand(workspaceId),
      prompt,
      kind,
      tone,
      currentHtml,
      mergeTags,
    };
    return this.stream(
      startAt(
        streamGeneration({
          settings,
          instructions: draftInstructions(promptInput),
          prompt: draftPrompt(promptInput),
          maxOutputTokens: 4_000,
          temperature: 0.7,
          timeoutMs: GENERATION_TIMEOUT_MS,
          signal,
        }),
        "<subject>",
      ),
      signal,
    );
  }

  async rewrite(workspaceId: string, input: Input, signal?: AbortSignal) {
    const text = requiredText(input, "text", MAX_REWRITE_TEXT);
    const action = oneOf(input.action, "action", REWRITE_ACTIONS);
    const instruction = optionalText(input, "instruction", MAX_INSTRUCTION);
    if (action === "custom" && !instruction) {
      throw invalid("instruction", "Say how the text should change.");
    }
    const context = optionalText(input, "context", MAX_REWRITE_TEXT);

    const settings = await this.ready(workspaceId);
    const promptInput = {
      brand: await this.promptBrand(workspaceId),
      text,
      action,
      instruction,
      context,
    };
    return this.stream(
      skipThinking(
        streamGeneration({
          settings,
          instructions: rewriteInstructions(promptInput),
          prompt: rewritePrompt(promptInput),
          maxOutputTokens: 3_000,
          temperature: action === "fix_grammar" ? 0.1 : 0.6,
          timeoutMs: GENERATION_TIMEOUT_MS,
          signal,
        }),
      ),
      signal,
    );
  }

  async subjects(workspaceId: string, input: Input, signal?: AbortSignal) {
    const html = optionalText(input, "html", MAX_HTML);
    const text = optionalText(input, "text", MAX_HTML);
    const current = optionalText(input, "current", MAX_SUBJECT);
    let count = 5;
    if (input.count !== undefined && input.count !== null) {
      if (
        typeof input.count !== "number" ||
        !Number.isInteger(input.count) ||
        input.count < 1 ||
        input.count > 8
      ) {
        throw invalid("count", "count must be a whole number from 1 to 8.");
      }
      count = input.count;
    }
    const content = (text ?? (html ? htmlToText(html) : "")).trim();
    if (content === "") {
      throw invalid("html", "Send the email as html or text.");
    }

    const settings = await this.ready(workspaceId);
    const promptInput = {
      brand: await this.promptBrand(workspaceId),
      content: content.slice(0, MAX_CONTENT_FOR_MODEL),
      current,
      count,
    };
    let output: string;
    try {
      output = await generate({
        settings,
        instructions: subjectsInstructions(promptInput),
        prompt: subjectsPrompt(promptInput),
        maxOutputTokens: 1_000,
        temperature: 0.8,
        timeoutMs: GENERATION_TIMEOUT_MS,
        signal,
      });
    } catch (error) {
      throw this.failed(error);
    }
    const suggestions = parseSubjects(output, count);
    if (suggestions.length === 0) {
      throw apiError(
        HttpStatus.BAD_GATEWAY,
        "ai_provider_error",
        "The model did not return usable suggestions. Try again, or try a different model.",
      );
    }
    return { suggestions };
  }

  async review(workspaceId: string, input: Input, signal?: AbortSignal) {
    if (typeof input.subject !== "string") {
      throw invalid("subject", "subject must be text.");
    }
    if (input.subject.length > MAX_SUBJECT) {
      throw invalid(
        "subject",
        `subject must be at most ${MAX_SUBJECT} characters.`,
      );
    }
    const subject = input.subject;
    const previewText = optionalText(input, "previewText", MAX_PREVIEW);
    if (typeof input.html !== "string") {
      throw invalid("html", "html is required.");
    }
    if (input.html.length > MAX_HTML) {
      throw invalid("html", `html must be at most ${MAX_HTML} characters.`);
    }
    const html = input.html;

    const brand = await this.promptBrand(workspaceId);
    const issues: ReviewIssue[] = runReviewRules({
      subject,
      previewText,
      html,
      brandHasPostalAddress: (brand.postalAddress ?? "").trim() !== "",
    });

    const content = htmlToText(html);
    if (content === "" && subject.trim() === "") {
      return { issues, aiReviewed: false };
    }
    try {
      const settings = await this.ready(workspaceId);
      const promptInput = {
        brand,
        subject,
        previewText,
        content: content.slice(0, MAX_CONTENT_FOR_MODEL),
      };
      const output = await generate({
        settings,
        instructions: reviewInstructions(promptInput),
        prompt: reviewPrompt(promptInput),
        maxOutputTokens: 1_500,
        temperature: 0.2,
        timeoutMs: GENERATION_TIMEOUT_MS,
        signal,
      });
      return {
        issues: [...issues, ...parseReviewIssues(output)],
        aiReviewed: true,
      };
    } catch (error) {
      if (error instanceof AiProviderError) {
        this.logFailure(error);
      }
      return { issues, aiReviewed: false };
    }
  }

  private async stream(source: AsyncGenerator<string>, signal?: AbortSignal) {
    let primed: Awaited<ReturnType<typeof prime>>;
    try {
      primed = await prime(source);
    } catch (error) {
      throw this.failed(error);
    }
    if (!primed) {
      throw apiError(
        HttpStatus.BAD_GATEWAY,
        "ai_provider_error",
        "The model returned no text. Try again, or try a different model.",
      );
    }
    const { first, rest } = primed;
    const logFailure = (error: unknown) => this.failed(error);
    return (async function* () {
      yield first;
      try {
        yield* rest;
      } catch (error) {
        if (!signal?.aborted) {
          logFailure(error);
          yield STREAM_ERROR;
        }
      }
    })();
  }

  private mergeTags(value: unknown) {
    if (value === undefined || value === null) {
      return [];
    }
    if (
      !Array.isArray(value) ||
      value.length > MAX_MERGE_TAGS ||
      !value.every(
        (tag): tag is string =>
          typeof tag === "string" && tag.length <= 80 && MERGE_KEY.test(tag),
      )
    ) {
      throw invalid(
        "mergeTags",
        `mergeTags must be a list of at most ${MAX_MERGE_TAGS} merge tag keys.`,
      );
    }
    return value;
  }

  private async ready(workspaceId: string): Promise<ProviderSettings> {
    const row = await this.repository.get(workspaceId);
    if (!row) {
      throw apiError(
        HttpStatus.CONFLICT,
        "ai_not_configured",
        "The writing assistant is not set up. Add a provider in the AI settings.",
      );
    }
    const endpoint = await checkEndpoint(row.baseUrl, {
      allowPrivate: this.allowPrivate,
    });
    if (!endpoint.ok) {
      throw invalid("baseUrl", endpoint.message);
    }
    if (!(await this.rateLimiter.take(workspaceId))) {
      throw apiError(
        HttpStatus.TOO_MANY_REQUESTS,
        "ai_rate_limited",
        "The writing assistant has reached its limit of 30 requests a minute for this workspace. Try again shortly.",
      );
    }
    return {
      baseUrl: endpoint.url,
      model: row.model,
      apiKey: this.crypto.decrypt(
        this.crypto.unwrapDataKey(row.keyVersion, row.wrappedDataKey),
        row.apiKeyCiphertext,
        aad(workspaceId),
      ),
    };
  }

  private seal(workspaceId: string, apiKey: string): AiSettingsKey {
    const { dataKey, keyVersion, wrappedDataKey } = this.crypto.createDataKey();
    return {
      keyVersion,
      wrappedDataKey,
      apiKeyCiphertext: this.crypto.encrypt(dataKey, apiKey, aad(workspaceId)),
      apiKeyHint: apiKey.length >= MIN_HINTED_KEY ? apiKey.slice(-4) : null,
    };
  }

  private async promptBrand(workspaceId: string): Promise<PromptBrand> {
    return this.brand.get(workspaceId);
  }

  private failed(error: unknown) {
    if (error instanceof AiProviderError) {
      this.logFailure(error);
      return providerFailure(error);
    }
    return error;
  }

  private logFailure(error: AiProviderError) {
    this.logger.warn(
      `AI provider call failed${error.status ? ` with status ${error.status}` : ""}: ${error.summary}`,
    );
  }
}
