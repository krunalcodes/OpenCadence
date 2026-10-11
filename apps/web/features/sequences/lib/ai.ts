import {
  defaultFollowUpDelay,
  maxDelayMinutes,
  unitMinutes,
} from "@/features/sequences/lib/steps";
import { splitTrailer } from "@/lib/ai-stream";

export const goalPresets = ["reply", "call", "trial", "link"] as const;

export type GoalPreset = (typeof goalPresets)[number];

export const tonePresets = [
  "friendly",
  "professional",
  "direct",
  "casual",
] as const;

export type TonePreset = (typeof tonePresets)[number];

export const customChoice = "custom";

export const stepCounts = [2, 3, 4, 5, 6] as const;

export const defaultStepCount = 4;

export const maxPromptLength = 4000;
export const maxAudienceLength = 500;
export const maxGoalLength = 300;
export const maxToneLength = 100;
export const maxDraftSteps = 10;

export const briefMergeTags = [
  "first_name",
  "last_name",
  "company",
  "job_title",
];

export type Brief = {
  prompt: string;
  audience: string;
  goal: string;
  customGoal: string;
  steps: number;
  tone: string;
  customTone: string;
};

export const emptyBrief: Brief = {
  prompt: "",
  audience: "",
  goal: "reply",
  customGoal: "",
  steps: defaultStepCount,
  tone: "friendly",
  customTone: "",
};

export type ParsedStep = {
  waitMinutes: number;
  subject: string;
  body: string;
  closed: boolean;
};

export type ParsedSequence = { name: string; steps: ParsedStep[] };

const stepOpen = /<step\b([^>]*)>/gi;
const stepClose = /<\/step\s*>/i;
const waitAttribute = /wait_days\s*=\s*["']?\s*(-?\d+(?:\.\d+)?)/i;

function withoutPartialTag(value: string) {
  const open = value.lastIndexOf("<");
  return open !== -1 && !value.slice(open).includes(">")
    ? value.slice(0, open)
    : value;
}

function line(value: string) {
  return decodeEntities(value.replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

type Block = { start: number; end: number; value: string } | null;

function block(raw: string, tag: string, greedy: boolean): Block {
  const lower = raw.toLowerCase();
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const start = lower.indexOf(open);
  if (start === -1) {
    return null;
  }
  const from = start + open.length;
  const end = greedy ? lower.lastIndexOf(close) : lower.indexOf(close, from);
  if (end === -1 || end < from) {
    return {
      start,
      end: raw.length,
      value: withoutPartialTag(raw.slice(from)),
    };
  }
  return { start, end: end + close.length, value: raw.slice(from, end) };
}

function waitOf(attributes: string, index: number) {
  const fallback = index === 0 ? 0 : defaultFollowUpDelay;
  const match = waitAttribute.exec(attributes);
  if (!match) {
    return fallback;
  }
  const minutes = Math.round(Number(match[1]) * unitMinutes.days);
  const least = index === 0 ? 0 : 1;
  return Number.isFinite(minutes) &&
    minutes >= least &&
    minutes <= maxDelayMinutes
    ? minutes
    : fallback;
}

export function parseSequenceStream(raw: string): ParsedSequence {
  const text = splitTrailer(raw).text;
  const opens = [...text.matchAll(stepOpen)].slice(0, maxDraftSteps);
  const first = opens[0];
  const head = first ? text.slice(0, first.index) : text;
  const name = block(head, "name", false);
  const steps = opens.map((match, index): ParsedStep => {
    const next = opens[index + 1];
    const whole = text.slice(
      match.index + match[0].length,
      next ? next.index : text.length,
    );
    const close = stepClose.exec(whole);
    const closed = close !== null || next !== undefined;
    const segment = close
      ? whole.slice(0, close.index)
      : closed
        ? whole
        : withoutPartialTag(whole);
    const body = block(segment, "body", true);
    const before = body ? segment.slice(0, body.start) : segment;
    const subject = block(before, "subject", false);
    const loose =
      !body && closed
        ? subject
          ? segment.slice(0, subject.start) + segment.slice(subject.end)
          : segment
        : "";
    return {
      waitMinutes: waitOf(match[1] ?? "", index),
      subject: subject ? line(subject.value) : "",
      body: (body ? body.value : loose).trim(),
      closed,
    };
  });
  return { name: name ? line(name.value) : "", steps };
}

export type BodyTag = "p" | "strong" | "em" | "ul" | "li";

export type BodyNode =
  | { type: "text"; value: string }
  | { type: "break" }
  | { type: "link"; href: string; children: BodyNode[] }
  | { type: "element"; tag: BodyTag; children: BodyNode[] };

type Parent = Extract<BodyNode, { children: BodyNode[] }>;

const token =
  /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;

const hrefAttribute = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;

const tagNames: Record<string, BodyTag> = {
  p: "p",
  div: "p",
  h1: "p",
  h2: "p",
  h3: "p",
  h4: "p",
  h5: "p",
  h6: "p",
  blockquote: "p",
  strong: "strong",
  b: "strong",
  em: "em",
  i: "em",
  ul: "ul",
  ol: "ul",
  li: "li",
};

const hiddenTags = ["script", "style", "head", "title", "template", "iframe"];

const entities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(value: string) {
  return value.replace(
    /&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]+);/gi,
    (match, code: string) => {
      if (code.startsWith("#")) {
        const point =
          code[1] === "x" || code[1] === "X"
            ? Number.parseInt(code.slice(2), 16)
            : Number.parseInt(code.slice(1), 10);
        return Number.isFinite(point) && point > 0 && point <= 0x10ffff
          ? String.fromCodePoint(point)
          : "";
      }
      return entities[code.toLowerCase()] ?? match;
    },
  );
}

export function safeHref(value: string) {
  const href = value.trim();
  return /^(https?:\/\/|mailto:)/i.test(href) || /^\{\{[^{}]+\}\}$/.test(href)
    ? href
    : null;
}

export function isWebHref(href: string) {
  return /^(https?:\/\/|mailto:)/i.test(href);
}

function isBlock(node: BodyNode) {
  return node.type === "element" && (node.tag === "p" || node.tag === "ul");
}

function isBlank(node: BodyNode) {
  return node.type === "text" && node.value.trim() === "";
}

function wrapLoose(nodes: BodyNode[]): BodyNode[] {
  const blocks: BodyNode[] = [];
  let loose: BodyNode[] = [];
  const flush = () => {
    if (loose.some((node) => !isBlank(node))) {
      blocks.push({ type: "element", tag: "p", children: loose });
    }
    loose = [];
  };
  for (const node of nodes) {
    if (isBlock(node)) {
      flush();
      blocks.push(node);
    } else {
      loose.push(node);
    }
  }
  flush();
  return blocks;
}

export function parseBody(html: string): BodyNode[] {
  const root: BodyNode[] = [];
  const stack: Parent[] = [];
  let hidden: string | null = null;
  let cursor = 0;

  const children = () => stack[stack.length - 1]?.children ?? root;
  const depthOf = (test: (node: Parent) => boolean) => {
    for (let index = stack.length - 1; index >= 0; index -= 1) {
      const node = stack[index];
      if (node && test(node)) {
        return index;
      }
    }
    return -1;
  };
  const isTag = (tag: BodyTag) => (node: Parent) =>
    node.type === "element" && node.tag === tag;
  const open = (node: Parent) => {
    children().push(node);
    stack.push(node);
  };
  const addText = (raw: string) => {
    if (hidden || raw === "") {
      return;
    }
    const value = decodeEntities(raw).replace(/\s+/g, " ");
    if (value !== "") {
      children().push({ type: "text", value });
    }
  };

  for (const match of html.matchAll(token)) {
    addText(html.slice(cursor, match.index));
    cursor = match.index + match[0].length;
    const name = match[2]?.toLowerCase();
    if (!name) {
      continue;
    }
    const closing = match[1] === "/";
    if (hidden) {
      if (closing && name === hidden) {
        hidden = null;
      }
      continue;
    }
    if (hiddenTags.includes(name)) {
      if (!closing) {
        hidden = name;
      }
      continue;
    }
    if (name === "br") {
      children().push({ type: "break" });
      continue;
    }
    if (name === "a") {
      const depth = depthOf((node) => node.type === "link");
      if (depth !== -1) {
        stack.length = depth;
      }
      if (closing) {
        continue;
      }
      const found = hrefAttribute.exec(match[3] ?? "");
      const href = safeHref(
        decodeEntities(found?.[1] ?? found?.[2] ?? found?.[3] ?? ""),
      );
      if (href) {
        open({ type: "link", href, children: [] });
      }
      continue;
    }
    const tag = tagNames[name];
    if (!tag) {
      continue;
    }
    if (closing) {
      const depth = depthOf(isTag(tag));
      if (depth !== -1) {
        stack.length = depth;
      }
      continue;
    }
    if (tag === "p" || tag === "ul") {
      const paragraph = depthOf(isTag("p"));
      if (paragraph !== -1) {
        stack.length = paragraph;
      }
    }
    if (tag === "li") {
      const item = depthOf(isTag("li"));
      const list = depthOf(isTag("ul"));
      if (item > list) {
        stack.length = item;
      } else if (list === -1) {
        stack.length = 0;
        open({ type: "element", tag: "ul", children: [] });
      }
    }
    open({ type: "element", tag, children: [] });
  }
  addText(html.slice(cursor));
  return wrapLoose(root);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function serializeBody(nodes: BodyNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === "text") {
        return escapeHtml(node.value);
      }
      if (node.type === "break") {
        return "<br />";
      }
      const inner = serializeBody(node.children);
      return node.type === "link"
        ? `<a href="${escapeHtml(node.href)}">${inner}</a>`
        : `<${node.tag}>${inner}</${node.tag}>`;
    })
    .join("");
}

function inlineText(nodes: BodyNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === "text") {
        return node.value;
      }
      if (node.type === "break") {
        return "\n";
      }
      if (node.type === "element" && node.tag === "ul") {
        return `\n${listText(node.children)}\n`;
      }
      return inlineText(node.children);
    })
    .join("");
}

function tidyLines(value: string) {
  return value
    .split("\n")
    .map((item) => item.replace(/\s+/g, " ").trim())
    .join("\n")
    .trim();
}

function listText(nodes: BodyNode[]): string {
  return nodes
    .filter((node) => !isBlank(node))
    .map((node) =>
      node.type === "text" || node.type === "break"
        ? inlineText([node])
        : inlineText(node.children),
    )
    .map((item) => `- ${tidyLines(item).replace(/\n+/g, " ")}`)
    .join("\n");
}

export function bodyToPlainText(nodes: BodyNode[]): string {
  return nodes
    .map((node) =>
      node.type === "element" && node.tag === "ul"
        ? listText(node.children)
        : tidyLines(inlineText([node])),
    )
    .filter((item) => item !== "")
    .join("\n\n");
}

export type BodyLink = { text: string; href: string };

export function collectLinks(nodes: BodyNode[]): BodyLink[] {
  return nodes.flatMap((node): BodyLink[] => {
    if (node.type === "link") {
      const text = inlineText(node.children).replace(/\s+/g, " ").trim();
      return text === "" ? [] : [{ text, href: node.href }];
    }
    return node.type === "element" ? collectLinks(node.children) : [];
  });
}

function withLinks(value: string, links: BodyLink[], used: Set<number>) {
  let rest = value;
  let html = "";
  for (;;) {
    let at = -1;
    let picked = -1;
    links.forEach((link, index) => {
      if (used.has(index)) {
        return;
      }
      const found = rest.indexOf(link.text);
      if (found !== -1 && (at === -1 || found < at)) {
        at = found;
        picked = index;
      }
    });
    const link = links[picked];
    if (!link) {
      return html + escapeHtml(rest);
    }
    used.add(picked);
    html += `${escapeHtml(rest.slice(0, at))}<a href="${escapeHtml(link.href)}">${escapeHtml(link.text)}</a>`;
    rest = rest.slice(at + link.text.length);
  }
}

const bullet = /^[-*•]\s+/;

export function plainTextToHtml(value: string, links: BodyLink[]): string {
  const used = new Set<number>();
  return value
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n+/)
    .map((paragraph) =>
      paragraph
        .split("\n")
        .map((item) => item.trim())
        .filter((item) => item !== ""),
    )
    .filter((lines) => lines.length > 0)
    .map((lines) =>
      lines.every((item) => bullet.test(item))
        ? `<ul>${lines
            .map(
              (item) =>
                `<li>${withLinks(item.replace(bullet, ""), links, used)}</li>`,
            )
            .join("")}</ul>`
        : `<p>${lines.map((item) => withLinks(item, links, used)).join("<br />")}</p>`,
    )
    .join("");
}

export type DraftStep = {
  key: string;
  waitMinutes: number;
  subject: string;
  sourceHtml: string;
  text: string | null;
};

export type SequenceDraft = { name: string; steps: DraftStep[] };

export function toSequenceDraft(
  parsed: ParsedSequence,
  finished: boolean,
): SequenceDraft {
  const steps = parsed.steps
    .map(
      (step, index): DraftStep => ({
        key: `step-${index}`,
        waitMinutes: step.waitMinutes,
        subject: step.subject,
        sourceHtml: step.body,
        text: null,
      }),
    )
    .filter((step) => !finished || parseBody(step.sourceHtml).length > 0);
  return { name: parsed.name, steps };
}

export function stepNodes(step: DraftStep): BodyNode[] {
  const source = parseBody(step.sourceHtml);
  if (step.text === null || step.text === bodyToPlainText(source)) {
    return source;
  }
  return parseBody(plainTextToHtml(step.text, collectLinks(source)));
}

export function stepPlainText(step: DraftStep) {
  return step.text ?? bodyToPlainText(parseBody(step.sourceHtml));
}

export function normalizeWait(minutes: number, index: number) {
  if (index === 0) {
    return minutes;
  }
  return minutes < 1 ? defaultFollowUpDelay : minutes;
}

export type FromDraftStep = {
  waitMinutes: number;
  subject?: string;
  html: string;
  threadMode: "reply" | "new";
};

export function toFromDraftSteps(steps: DraftStep[]): FromDraftStep[] {
  return steps.map((step, index) => ({
    waitMinutes: normalizeWait(step.waitMinutes, index),
    ...(index === 0 ? { subject: step.subject.trim() } : {}),
    html: serializeBody(stepNodes(step)),
    threadMode: index === 0 ? "new" : "reply",
  }));
}

export function wordCount(value: string) {
  const words = value.trim().split(/\s+/);
  return words[0] === "" ? 0 : words.length;
}
