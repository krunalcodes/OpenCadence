import type { ComponentType } from "react";
import type { Feature } from "@/features/marketing/lib/features";
import * as doubleOptIn from "./double-opt-in-when-it-is-worth-it";
import * as warmUp from "./how-to-warm-up-a-new-mailbox";
import * as authentication from "./spf-dkim-dmarc-explained";
import * as followUp from "./writing-a-follow-up-sequence";

export type PostCategory = "Deliverability" | "Newsletters" | "Outreach";

export type PostSection = {
  id: string;
  title: string;
};

export type Post = {
  slug: string;
  title: string;
  description: string;
  date: string;
  readingMinutes: number;
  category: PostCategory;
  feature: Feature["slug"];
};

export type PostContent = {
  Body: ComponentType;
  sections: PostSection[];
};

export const author = "The OpenCadence team";

export const posts: Post[] = [
  {
    slug: "spf-dkim-dmarc-explained",
    title: "SPF, DKIM, and DMARC explained for people who send email",
    description:
      "What each DNS record does, what it looks like, and a safe order for turning on DMARC.",
    date: "2026-10-08",
    readingMinutes: 5,
    category: "Deliverability",
    feature: "deliverability",
  },
  {
    slug: "how-to-warm-up-a-new-mailbox",
    title: "How to warm up a new sending mailbox",
    description:
      "What warm-up is, a gradual ramp you can follow, and the signs that tell you to slow down.",
    date: "2026-09-29",
    readingMinutes: 5,
    category: "Deliverability",
    feature: "deliverability",
  },
  {
    slug: "writing-a-follow-up-sequence",
    title: "Writing a follow-up sequence people answer",
    description:
      "How many steps to send, how far apart, and why every email should ask for one thing.",
    date: "2026-09-17",
    readingMinutes: 5,
    category: "Outreach",
    feature: "sequences",
  },
  {
    slug: "double-opt-in-when-it-is-worth-it",
    title: "Double opt-in: when it is worth it",
    description:
      "How confirmed signup works, what it costs in list size, and when the trade pays off.",
    date: "2026-09-08",
    readingMinutes: 5,
    category: "Newsletters",
    feature: "newsletters",
  },
];

const content: Record<string, PostContent> = {
  "spf-dkim-dmarc-explained": authentication,
  "how-to-warm-up-a-new-mailbox": warmUp,
  "writing-a-follow-up-sequence": followUp,
  "double-opt-in-when-it-is-worth-it": doubleOptIn,
};

const dateFormat = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function formatPostDate(date: string) {
  return dateFormat.format(new Date(`${date}T00:00:00Z`));
}

export function getPost(slug: string) {
  return posts.find((post) => post.slug === slug);
}

export function getPostContent(slug: string) {
  return content[slug];
}

export function getRelatedPosts(slug: string, count = 2) {
  const current = getPost(slug);
  const others = posts.filter((post) => post.slug !== slug);
  const sameCategory = others.filter(
    (post) => post.category === current?.category,
  );
  const rest = others.filter((post) => post.category !== current?.category);
  return [...sameCategory, ...rest].slice(0, count);
}
