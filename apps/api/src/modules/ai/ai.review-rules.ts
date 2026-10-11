import { findImages, findLinks, htmlToText } from "./ai.html";

export type ReviewIssue = {
  source: "rules" | "ai";
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  suggestion: string | null;
};

export type ReviewInput = {
  subject: string;
  previewText: string | null;
  html: string;
  brandHasPostalAddress: boolean;
};

const CLIP_BYTES = 102 * 1024;
const LONG_SUBJECT = 60;
const VERY_LONG_SUBJECT = 90;
const MANY_LINKS = 15;
const TOO_MANY_LINKS = 25;
const TEXT_PER_IMAGE = 100;
const ALMOST_NO_TEXT = 20;

const shorteners = new Set([
  "bit.ly",
  "bitly.com",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "ow.ly",
  "is.gd",
  "buff.ly",
  "rebrand.ly",
  "cutt.ly",
  "shorturl.at",
  "tiny.cc",
  "rb.gy",
  "lnkd.in",
  "t.ly",
  "s.id",
  "v.gd",
  "soo.gd",
]);

const MERGE_TAG =
  /\{\{\s*([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)?)\s*(?:\|[^}]*)?\}\}/g;
const URL_LIKE_TEXT =
  /^(?:https?:\/\/)?(?:www\.)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?:[/:?#]\S*)?$/i;

function rule(
  severity: ReviewIssue["severity"],
  title: string,
  detail: string,
  suggestion: string | null,
): ReviewIssue {
  return { source: "rules", severity, title, detail, suggestion };
}

function hostOf(value: string) {
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(value)
    ? value
    : `https://${value}`;
  if (!URL.canParse(candidate)) {
    return null;
  }
  const url = new URL(candidate);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }
  return url.hostname.toLowerCase().replace(/^www\./, "");
}

function sameSite(a: string, b: string) {
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

function usesMergeTag(value: string, key: string) {
  for (const match of value.matchAll(MERGE_TAG)) {
    if (match[1] === key) {
      return true;
    }
  }
  return false;
}

function subjectIssues(subject: string) {
  const issues: ReviewIssue[] = [];
  const trimmed = subject.trim();
  if (trimmed === "") {
    issues.push(
      rule(
        "high",
        "The subject is missing",
        "An email without a subject is often filtered as spam and rarely opened.",
        "Write a short subject that says what the email is about.",
      ),
    );
    return issues;
  }

  const length = [...trimmed].length;
  if (length > VERY_LONG_SUBJECT) {
    issues.push(
      rule(
        "medium",
        "The subject is very long",
        `The subject is ${length} characters. Most inboxes show about 60, so the rest is cut off.`,
        "Shorten it to under 60 characters and put the important words first.",
      ),
    );
  } else if (length > LONG_SUBJECT) {
    issues.push(
      rule(
        "low",
        "The subject may be cut off",
        `The subject is ${length} characters. Phones show about 40 and desktop inboxes about 60.`,
        "Put the important words in the first 40 characters.",
      ),
    );
  }

  const letters = trimmed.replace(/\{\{[^}]*\}\}/g, "").match(/\p{L}/gu) ?? [];
  const upper = letters.filter(
    (letter) =>
      letter === letter.toUpperCase() && letter !== letter.toLowerCase(),
  );
  if (letters.length >= 6 && upper.length / letters.length >= 0.7) {
    issues.push(
      rule(
        "medium",
        "The subject is mostly capital letters",
        "Subjects written in capitals read as shouting and are a common spam signal.",
        "Use sentence case.",
      ),
    );
  }

  const marks = trimmed.match(/[!?]/g)?.length ?? 0;
  if (marks >= 3 || /[!?]{2,}/.test(trimmed) || /[$€£]{2,}/.test(trimmed)) {
    issues.push(
      rule(
        "medium",
        "The subject has heavy punctuation",
        "Repeated exclamation marks, question marks or currency signs are a common spam signal.",
        "Keep at most one exclamation or question mark.",
      ),
    );
  }
  return issues;
}

export function runReviewRules(input: ReviewInput): ReviewIssue[] {
  const issues = subjectIssues(input.subject);
  const links = findLinks(input.html);
  const images = findImages(input.html);
  const text = htmlToText(input.html);
  const textLength = text.replace(/\s+/g, "").length;

  if (!links.some((link) => usesMergeTag(link.href, "unsubscribe_url"))) {
    issues.push(
      rule(
        "high",
        "There is no unsubscribe link",
        "Campaigns and sequences need a working unsubscribe link. Mailbox providers and the law in most countries require one.",
        "Add a link whose address is {{ unsubscribe_url }}, usually in the footer.",
      ),
    );
  }

  if (!input.brandHasPostalAddress) {
    issues.push(
      rule(
        "medium",
        "The brand has no postal address",
        "Marketing email must show a physical postal address in most countries, and the brand settings do not have one yet.",
        "Add the address in the brand settings, then include {{ brand.address }} in the footer.",
      ),
    );
  }

  const missingAlt = images.filter((image) => image.alt === null).length;
  if (missingAlt > 0) {
    issues.push(
      rule(
        "medium",
        missingAlt === 1
          ? "An image has no alt text"
          : `${missingAlt} images have no alt text`,
        "Many inboxes block images until the reader allows them, and screen readers rely on alt text.",
        "Describe each meaningful image, and give decorative images an empty alt.",
      ),
    );
  }

  if (images.length > 0 && textLength < ALMOST_NO_TEXT) {
    issues.push(
      rule(
        "high",
        "The email is only an image",
        "With images blocked the reader sees an empty email, and image-only emails are often filtered as spam.",
        "Write the message as text and keep the image as a supplement.",
      ),
    );
  } else if (images.length > 0 && textLength / images.length < TEXT_PER_IMAGE) {
    issues.push(
      rule(
        "medium",
        "The email is image-heavy",
        `There are ${images.length} images and little text. A low text to image ratio hurts inbox placement.`,
        "Add a few sentences of text or remove some images.",
      ),
    );
  }

  const webLinks = links.filter((link) => hostOf(link.href) !== null);
  if (webLinks.length > TOO_MANY_LINKS) {
    issues.push(
      rule(
        "medium",
        "There are too many links",
        `The email has ${webLinks.length} links. A large number of links is a spam signal and splits the reader's attention.`,
        "Keep the links that support the main action and remove the rest.",
      ),
    );
  } else if (webLinks.length > MANY_LINKS) {
    issues.push(
      rule(
        "low",
        "There are many links",
        `The email has ${webLinks.length} links. Fewer links make the main action clearer.`,
        "Remove links that do not support the main action.",
      ),
    );
  }

  const mismatched = webLinks.filter((link) => {
    const shown = URL_LIKE_TEXT.exec(link.text.trim());
    const shownHost = shown ? hostOf(link.text.trim()) : null;
    const actualHost = hostOf(link.href);
    return (
      shownHost !== null &&
      actualHost !== null &&
      !sameSite(shownHost, actualHost)
    );
  });
  const firstMismatch = mismatched[0];
  if (firstMismatch) {
    issues.push(
      rule(
        "high",
        "A link shows one address and opens another",
        `The link text "${firstMismatch.text.trim().slice(0, 80)}" opens a different site. Spam filters treat this as phishing.`,
        "Use descriptive words as the link text, or make the text match the destination.",
      ),
    );
  }

  const shortened = [
    ...new Set(
      webLinks
        .map((link) => hostOf(link.href))
        .filter(
          (host): host is string => host !== null && shorteners.has(host),
        ),
    ),
  ];
  if (shortened.length > 0) {
    issues.push(
      rule(
        "medium",
        "A link uses a URL shortener",
        `Links through ${shortened.join(", ")} hide the destination, and shared shortener domains are often blocklisted.`,
        "Link to the full address on your own domain.",
      ),
    );
  }

  const bytes = Buffer.byteLength(input.html, "utf8");
  if (bytes > CLIP_BYTES) {
    issues.push(
      rule(
        "medium",
        "The email is large enough to be clipped",
        `The HTML is ${Math.round(bytes / 1024)} KB. Some inboxes cut off messages over 102 KB, which can hide the footer and the unsubscribe link.`,
        "Shorten the email or remove repeated sections.",
      ),
    );
  }

  return issues;
}
