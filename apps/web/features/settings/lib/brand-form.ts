import type { Row } from "@/lib/api";
import {
  type Brand,
  type BrandFontFamily,
  type BrandLogo,
  maxSocialLinks,
} from "@/lib/brand";

export const maxBrandNameLength = 120;
export const maxPostalAddressLength = 500;
export const maxVoiceLength = 1000;
export const minimumContrast = 4.5;

export const colorFields = [
  "primaryColor",
  "backgroundColor",
  "contentColor",
  "textColor",
] as const;

export type ColorField = (typeof colorFields)[number];

export const socialNetworks = [
  { value: "website", label: "Website" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "x", label: "X" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "youtube", label: "YouTube" },
  { value: "tiktok", label: "TikTok" },
  { value: "threads", label: "Threads" },
  { value: "bluesky", label: "Bluesky" },
  { value: "mastodon", label: "Mastodon" },
  { value: "github", label: "GitHub" },
  { value: "discord", label: "Discord" },
  { value: "pinterest", label: "Pinterest" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "telegram", label: "Telegram" },
];

export function networkLabel(network: string) {
  return (
    socialNetworks.find((option) => option.value === network)?.label ?? network
  );
}

export function networkOptions(current: string) {
  return current === "" ||
    socialNetworks.some((option) => option.value === current)
    ? socialNetworks
    : [...socialNetworks, { value: current, label: current }];
}

export type SocialRow = { key: string; network: string; url: string };

export type BrandFormValues = {
  brandName: string;
  websiteUrl: string;
  logo: BrandLogo | null;
  primaryColor: string;
  backgroundColor: string;
  contentColor: string;
  textColor: string;
  fontFamily: BrandFontFamily;
  postalAddress: string;
  voice: string;
  socialLinks: SocialRow[];
};

export type BrandFormErrors = Partial<
  Record<
    | "brandName"
    | "websiteUrl"
    | "logo"
    | ColorField
    | "postalAddress"
    | "voice"
    | "socialLinks",
    string
  >
> & { social?: Record<string, { network?: boolean; url?: boolean }> };

export function toFormValues(brand: Brand): BrandFormValues {
  return {
    brandName: brand.brandName,
    websiteUrl: brand.websiteUrl ?? "",
    logo: brand.logo,
    primaryColor: brand.primaryColor,
    backgroundColor: brand.backgroundColor,
    contentColor: brand.contentColor,
    textColor: brand.textColor,
    fontFamily: brand.fontFamily,
    postalAddress: brand.postalAddress ?? "",
    voice: brand.voice ?? "",
    socialLinks: brand.socialLinks.map((link, index) => ({
      key: `saved-${index}`,
      network: link.network,
      url: link.url,
    })),
  };
}

export function normalizeHex(input: string): string | null {
  const value = input.trim().toLowerCase().replace(/^#/, "");
  if (/^[0-9a-f]{6}$/.test(value)) {
    return `#${value}`;
  }
  if (/^[0-9a-f]{3}$/.test(value)) {
    return `#${[...value].map((digit) => digit + digit).join("")}`;
  }
  return null;
}

export function normalizeUrl(input: string): string | null {
  const value = input.trim();
  if (value === "") {
    return null;
  }
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(value)
    ? value
    : `https://${value}`;
  try {
    const url = new URL(candidate);
    const known = url.protocol === "https:" || url.protocol === "http:";
    return known && url.hostname.includes(".") ? url.toString() : null;
  } catch {
    return null;
  }
}

function channel(value: number) {
  const unit = value / 255;
  return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string) {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return (
    0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)
  );
}

export function contrastRatio(first: string, second: string) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function formatRatio(ratio: number) {
  return (Math.floor(ratio * 10) / 10).toFixed(1);
}

export type BrandColors = Record<ColorField, string>;

export function resolveColors(
  values: BrandFormValues,
  fallback: BrandColors,
): BrandColors {
  return {
    primaryColor: normalizeHex(values.primaryColor) ?? fallback.primaryColor,
    backgroundColor:
      normalizeHex(values.backgroundColor) ?? fallback.backgroundColor,
    contentColor: normalizeHex(values.contentColor) ?? fallback.contentColor,
    textColor: normalizeHex(values.textColor) ?? fallback.textColor,
  };
}

export function isBlankRow(row: SocialRow) {
  return row.network === "" && row.url.trim() === "";
}

export function toPayload(values: BrandFormValues): Row {
  return {
    brandName: values.brandName.trim(),
    websiteUrl: normalizeUrl(values.websiteUrl),
    logoMediaId: values.logo?.id ?? null,
    primaryColor: normalizeHex(values.primaryColor) ?? values.primaryColor,
    backgroundColor:
      normalizeHex(values.backgroundColor) ?? values.backgroundColor,
    contentColor: normalizeHex(values.contentColor) ?? values.contentColor,
    textColor: normalizeHex(values.textColor) ?? values.textColor,
    fontFamily: values.fontFamily,
    postalAddress: values.postalAddress.trim() || null,
    voice: values.voice.trim() || null,
    socialLinks: values.socialLinks
      .filter((row) => !isBlankRow(row))
      .slice(0, maxSocialLinks)
      .map((row) => ({
        network: row.network,
        url: normalizeUrl(row.url) ?? row.url.trim(),
      })),
  };
}

export type BrandFormIssues = {
  brandName: boolean;
  websiteUrl: boolean;
  colors: ColorField[];
  postalAddress: boolean;
  voice: boolean;
  social: Record<string, { network?: boolean; url?: boolean }>;
};

export function findIssues(values: BrandFormValues): BrandFormIssues {
  const social: BrandFormIssues["social"] = {};
  for (const row of values.socialLinks) {
    if (isBlankRow(row)) {
      continue;
    }
    const network = row.network === "";
    const url = normalizeUrl(row.url) === null;
    if (network || url) {
      social[row.key] = { network, url };
    }
  }
  return {
    brandName: values.brandName.trim().length > maxBrandNameLength,
    websiteUrl:
      values.websiteUrl.trim() !== "" &&
      normalizeUrl(values.websiteUrl) === null,
    colors: colorFields.filter((field) => normalizeHex(values[field]) === null),
    postalAddress: values.postalAddress.trim().length > maxPostalAddressLength,
    voice: values.voice.trim().length > maxVoiceLength,
    social,
  };
}
