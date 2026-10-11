export type ConfirmationBrand = {
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  backgroundColor: string;
  contentColor: string;
  textColor: string;
  fontStack: string;
};

export type ConfirmationEmailInput = {
  brand: ConfirmationBrand;
  subject: string;
  confirmUrl: string;
};

export type ConfirmationEmail = { subject: string; html: string; text: string };

const copy = {
  heading: "Confirm your subscription",
  intro: (sender: string) =>
    `Please confirm that you want to receive emails from ${sender}.`,
  fallbackSender: "us",
  action: "Confirm subscription",
  paste: "If the button does not work, copy this address into your browser:",
  ignore:
    "If you did not ask for this, ignore this email. You will not be subscribed.",
};

const fallbackColors = {
  primaryColor: "#2563eb",
  backgroundColor: "#f4f4f5",
  contentColor: "#ffffff",
  textColor: "#18181b",
};

const colorPattern = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const fontStackPattern = /^[A-Za-z0-9 ,'-]{1,200}$/;
const fallbackFontStack = "Arial, Helvetica, sans-serif";
const maxSubjectLength = 150;

const entities: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => entities[character] ?? "");
}

function color(value: string, fallback: string) {
  return colorPattern.test(value) ? value.toLowerCase() : fallback;
}

function httpUrl(value: string | null) {
  if (!value || !URL.canParse(value)) {
    return null;
  }
  const url = new URL(value);
  return url.protocol === "http:" || url.protocol === "https:"
    ? url.href
    : null;
}

function readableOn(background: string) {
  const hex =
    background.length === 4
      ? [...background.slice(1)].map((digit) => digit + digit).join("")
      : background.slice(1);
  const [red, green, blue] = [0, 2, 4].map(
    (start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255,
  );
  const luminance =
    0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0);
  return luminance > 0.6 ? "#18181b" : "#ffffff";
}

function singleLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function buildConfirmationEmail(
  input: ConfirmationEmailInput,
): ConfirmationEmail {
  const confirmUrl = httpUrl(input.confirmUrl);
  if (!confirmUrl) {
    throw new TypeError("The confirmation link must be an http or https URL.");
  }
  const brandName = singleLine(input.brand.name);
  const sender = brandName || copy.fallbackSender;
  const subject =
    singleLine(input.subject).slice(0, maxSubjectLength) || copy.heading;
  const primary = color(input.brand.primaryColor, fallbackColors.primaryColor);
  const background = color(
    input.brand.backgroundColor,
    fallbackColors.backgroundColor,
  );
  const content = color(input.brand.contentColor, fallbackColors.contentColor);
  const text = color(input.brand.textColor, fallbackColors.textColor);
  const font = fontStackPattern.test(input.brand.fontStack)
    ? input.brand.fontStack
    : fallbackFontStack;
  const logoUrl = httpUrl(input.brand.logoUrl);
  const link = escapeHtml(confirmUrl);

  const header = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(brandName)}" height="40" style="display:block;height:40px;width:auto;max-width:240px;border:0;" />`
    : brandName
      ? `<p style="margin:0;font-size:16px;font-weight:600;color:${text};">${escapeHtml(brandName)}</p>`
      : "";

  const html = [
    "<!doctype html>",
    '<html lang="en">',
    `<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(subject)}</title></head>`,
    `<body style="margin:0;padding:0;background-color:${background};">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${background};"><tr><td align="center" style="padding:32px 16px;">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:${content};border-radius:8px;"><tr><td style="padding:32px;font-family:${font};color:${text};">`,
    header ? `<div style="margin:0 0 24px;">${header}</div>` : "",
    `<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;font-weight:600;color:${text};">${escapeHtml(copy.heading)}</h1>`,
    `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${text};">${escapeHtml(copy.intro(sender))}</p>`,
    `<p style="margin:0 0 24px;"><a href="${link}" style="display:inline-block;padding:12px 20px;border-radius:6px;background-color:${primary};color:${readableOn(primary)};font-size:15px;font-weight:600;text-decoration:none;">${escapeHtml(copy.action)}</a></p>`,
    `<p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:${text};">${escapeHtml(copy.paste)}</p>`,
    `<p style="margin:0 0 24px;font-size:13px;line-height:1.6;word-break:break-all;"><a href="${link}" style="color:${text};">${link}</a></p>`,
    `<p style="margin:0;font-size:13px;line-height:1.6;color:${text};">${escapeHtml(copy.ignore)}</p>`,
    "</td></tr></table>",
    "</td></tr></table>",
    "</body>",
    "</html>",
  ].join("");

  const plain = [
    copy.heading,
    "",
    copy.intro(sender),
    "",
    `${copy.action}: ${confirmUrl}`,
    "",
    copy.ignore,
    "",
  ].join("\n");

  return { subject, html, text: plain };
}
