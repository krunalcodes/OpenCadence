import { isRow, rowsOf, textOrNull } from "@/lib/api";

export const brandFonts = [
  { value: "system", label: "System default" },
  { value: "arial", label: "Arial" },
  { value: "helvetica", label: "Helvetica" },
  { value: "georgia", label: "Georgia" },
  { value: "times", label: "Times New Roman" },
  { value: "verdana", label: "Verdana" },
  { value: "tahoma", label: "Tahoma" },
  { value: "trebuchet", label: "Trebuchet MS" },
  { value: "courier", label: "Courier New" },
] as const;

export type BrandFontFamily = (typeof brandFonts)[number]["value"];

export type BrandLogo = {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
};

export type BrandSocialLink = { network: string; url: string };

export type Brand = {
  brandName: string;
  websiteUrl: string | null;
  logo: BrandLogo | null;
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

export const maxSocialLinks = 8;

export const brandDefaults = {
  primaryColor: "#2563eb",
  backgroundColor: "#f4f4f5",
  contentColor: "#ffffff",
  textColor: "#18181b",
  fontFamily: "system",
} as const satisfies Partial<Brand>;

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

export function isBrandFontFamily(value: unknown): value is BrandFontFamily {
  return brandFonts.some((font) => font.value === value);
}

export function fontStack(fontFamily: string): string {
  return fontStacks[isBrandFontFamily(fontFamily) ? fontFamily : "system"];
}

const hexColor = /^#[0-9a-f]{6}$/;

function colorOr(value: unknown, fallback: string) {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  return hexColor.test(text) ? text : fallback;
}

function sizeOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function parseLogo(value: unknown): BrandLogo | null {
  if (!isRow(value)) {
    return null;
  }
  const id = textOrNull(value.id);
  const url = textOrNull(value.url);
  if (!id || !url) {
    return null;
  }
  return {
    id,
    url,
    width: sizeOrNull(value.width),
    height: sizeOrNull(value.height),
  };
}

export function parseBrand(value: unknown): Brand | null {
  if (!isRow(value) || typeof value.brandName !== "string") {
    return null;
  }
  return {
    brandName: value.brandName,
    websiteUrl: textOrNull(value.websiteUrl),
    logo: parseLogo(value.logo),
    primaryColor: colorOr(value.primaryColor, brandDefaults.primaryColor),
    backgroundColor: colorOr(
      value.backgroundColor,
      brandDefaults.backgroundColor,
    ),
    contentColor: colorOr(value.contentColor, brandDefaults.contentColor),
    textColor: colorOr(value.textColor, brandDefaults.textColor),
    fontFamily: isBrandFontFamily(value.fontFamily)
      ? value.fontFamily
      : brandDefaults.fontFamily,
    postalAddress: textOrNull(value.postalAddress),
    voice: textOrNull(value.voice),
    socialLinks: rowsOf(value.socialLinks)
      .flatMap((link) => {
        const network = textOrNull(link.network);
        const url = textOrNull(link.url);
        return network && url ? [{ network, url }] : [];
      })
      .slice(0, maxSocialLinks),
    canManage: value.canManage === true,
  };
}
