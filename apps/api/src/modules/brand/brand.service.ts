import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { apiError } from "../../common/api-error";
import type { WorkspaceAuthContext } from "../../common/guards/workspace-auth.guard";
import { isUuid } from "../../common/uuid";
import {
  assertCanManageWorkspace,
  canManageWorkspace,
} from "../../common/workspace-role";
import { MediaService } from "../media/media.service";
import { BrandRepository, type BrandValues } from "./brand.repository";

export const brandFontFamilies = [
  "system",
  "arial",
  "helvetica",
  "georgia",
  "times",
  "verdana",
  "tahoma",
  "trebuchet",
  "courier",
] as const;

export type BrandFontFamily = (typeof brandFontFamilies)[number];

export type BrandSocialLink = { network: string; url: string };

export type Brand = {
  brandName: string;
  websiteUrl: string | null;
  logo: {
    id: string;
    url: string;
    width: number | null;
    height: number | null;
  } | null;
  primaryColor: string;
  backgroundColor: string;
  contentColor: string;
  textColor: string;
  fontFamily: BrandFontFamily;
  postalAddress: string | null;
  voice: string | null;
  socialLinks: BrandSocialLink[];
  canManage: boolean;
};

export type BrandSettings = Omit<Brand, "canManage">;

const defaults = {
  primaryColor: "#2563eb",
  backgroundColor: "#f4f4f5",
  contentColor: "#ffffff",
  textColor: "#18181b",
  fontFamily: "system",
} as const;

const fontStacks: Record<BrandFontFamily, string> = {
  system:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  arial: "Arial, Helvetica, sans-serif",
  helvetica: "Helvetica, Arial, sans-serif",
  georgia: "Georgia, 'Times New Roman', Times, serif",
  times: "'Times New Roman', Times, serif",
  verdana: "Verdana, Geneva, sans-serif",
  tahoma: "Tahoma, Verdana, Geneva, sans-serif",
  trebuchet: "'Trebuchet MS', 'Lucida Grande', Tahoma, sans-serif",
  courier: "'Courier New', Courier, monospace",
};

const maxBrandNameLength = 120;
const maxUrlLength = 2000;
const maxPostalAddressLength = 500;
const maxVoiceLength = 1000;
const maxSocialLinks = 8;
const maxNetworkLength = 40;
const colorFields = [
  "primaryColor",
  "backgroundColor",
  "contentColor",
  "textColor",
] as const;
const colorPattern = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/;

function isFontFamily(value: unknown): value is BrandFontFamily {
  return brandFontFamilies.some((font) => font === value);
}

export function fontStack(fontFamily: string): string {
  return fontStacks[isFontFamily(fontFamily) ? fontFamily : "system"];
}

function validation(message: string, field: string) {
  return apiError(HttpStatus.BAD_REQUEST, "validation", message, field);
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseText(
  value: unknown,
  field: string,
  label: string,
  max: number,
): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw validation(`${field} must be text.`, field);
  }
  const text = value.trim();
  if (text.length > max) {
    throw validation(
      `Keep ${label} to ${max.toLocaleString("en-US")} characters or fewer.`,
      field,
    );
  }
  return text || null;
}

function parseUrl(value: unknown, field: string, label: string) {
  const text = parseText(value, field, label, maxUrlLength);
  if (text === null) {
    return null;
  }
  const url = URL.canParse(text) ? new URL(text) : null;
  if (
    !url ||
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw validation(
      `Enter ${label} as a full address that starts with http:// or https://.`,
      field,
    );
  }
  return text;
}

function parseColor(value: unknown, field: string) {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  const digits = colorPattern.exec(text)?.[1];
  if (!digits) {
    throw validation("Enter the colour as a hex code like #2563eb.", field);
  }
  return `#${digits.length === 3 ? [...digits].map((digit) => digit + digit).join("") : digits}`;
}

function parseSocialLinks(value: unknown): BrandSocialLink[] {
  if (!Array.isArray(value)) {
    throw validation("socialLinks must be a list.", "socialLinks");
  }
  if (value.length > maxSocialLinks) {
    throw validation(
      `Add up to ${maxSocialLinks} social links.`,
      "socialLinks",
    );
  }
  return value.map((entry) => {
    const { network, url } = record(entry);
    const name = typeof network === "string" ? network.trim() : "";
    if (name === "" || name.length > maxNetworkLength) {
      throw validation(
        `Give every social link a network name of 1 to ${maxNetworkLength} characters.`,
        "socialLinks",
      );
    }
    const href = parseUrl(url ?? null, "socialLinks", "every social link");
    if (!href) {
      throw validation(
        "Enter every social link as a full address that starts with http:// or https://.",
        "socialLinks",
      );
    }
    return { network: name, url: href };
  });
}

@Injectable()
export class BrandService {
  constructor(
    @Inject(BrandRepository) private readonly repository: BrandRepository,
    @Inject(MediaService) private readonly media: MediaService,
  ) {}

  async get(workspaceId: string): Promise<BrandSettings> {
    const row = await this.repository.find(workspaceId);
    const logo = row?.logoMediaId
      ? await this.media.get(workspaceId, row.logoMediaId)
      : null;
    return {
      brandName: row?.brandName ?? "",
      websiteUrl: row?.websiteUrl ?? null,
      logo: logo
        ? {
            id: logo.id,
            url: logo.url,
            width: logo.width,
            height: logo.height,
          }
        : null,
      primaryColor: row?.primaryColor ?? defaults.primaryColor,
      backgroundColor: row?.backgroundColor ?? defaults.backgroundColor,
      contentColor: row?.contentColor ?? defaults.contentColor,
      textColor: row?.textColor ?? defaults.textColor,
      fontFamily: isFontFamily(row?.fontFamily)
        ? row.fontFamily
        : defaults.fontFamily,
      postalAddress: row?.postalAddress ?? null,
      voice: row?.voice ?? null,
      socialLinks: row?.socialLinks ?? [],
    };
  }

  async read(context: WorkspaceAuthContext): Promise<Brand> {
    return {
      ...(await this.get(context.workspaceId)),
      canManage: canManageWorkspace(context),
    };
  }

  async update(context: WorkspaceAuthContext, input: unknown): Promise<Brand> {
    assertCanManageWorkspace(context);
    const body = record(input);
    const values: BrandValues = {};

    if (body.brandName !== undefined) {
      values.brandName =
        parseText(
          body.brandName,
          "brandName",
          "the brand name",
          maxBrandNameLength,
        ) ?? "";
    }
    if (body.websiteUrl !== undefined) {
      values.websiteUrl = parseUrl(
        body.websiteUrl,
        "websiteUrl",
        "the website",
      );
    }
    if (body.logoMediaId !== undefined) {
      if (body.logoMediaId === null) {
        values.logoMediaId = null;
      } else {
        const asset =
          typeof body.logoMediaId === "string" && isUuid(body.logoMediaId)
            ? await this.media.get(context.workspaceId, body.logoMediaId)
            : null;
        if (!asset) {
          throw this.logoMissing();
        }
        values.logoMediaId = asset.id;
      }
    }
    for (const field of colorFields) {
      if (body[field] !== undefined) {
        values[field] = parseColor(body[field], field);
      }
    }
    if (body.fontFamily !== undefined) {
      if (!isFontFamily(body.fontFamily)) {
        throw validation(
          `fontFamily must be one of: ${brandFontFamilies.join(", ")}.`,
          "fontFamily",
        );
      }
      values.fontFamily = body.fontFamily;
    }
    if (body.postalAddress !== undefined) {
      values.postalAddress = parseText(
        body.postalAddress,
        "postalAddress",
        "the postal address",
        maxPostalAddressLength,
      );
    }
    if (body.voice !== undefined) {
      values.voice = parseText(
        body.voice,
        "voice",
        "the brand voice",
        maxVoiceLength,
      );
    }
    if (body.socialLinks !== undefined) {
      values.socialLinks = parseSocialLinks(body.socialLinks);
    }

    const result = await this.repository.upsert(
      context.workspaceId,
      values,
      context.method === "session" ? context.userId : null,
    );
    if (!result.ok) {
      throw this.logoMissing();
    }
    return this.read(context);
  }

  private logoMissing() {
    return validation(
      "The logo image was not found. Upload it again.",
      "logoMediaId",
    );
  }
}
