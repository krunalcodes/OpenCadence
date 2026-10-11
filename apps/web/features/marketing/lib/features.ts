export const features = [
  {
    slug: "newsletters",
    href: "/features/newsletters",
    title: "Newsletters",
    description: "Build, segment, schedule, and A/B test campaigns.",
    group: "Send",
  },
  {
    slug: "sequences",
    href: "/features/sequences",
    title: "Sequences",
    description: "Multi-step outreach that stops when someone replies.",
    group: "Send",
  },
  {
    slug: "transactional",
    href: "/features/transactional",
    title: "Transactional API",
    description: "Receipts and password resets from your own app.",
    group: "Send",
  },
  {
    slug: "deliverability",
    href: "/features/deliverability",
    title: "Deliverability",
    description: "Warm-up, DNS checks, and health for every sender.",
    group: "Deliver",
  },
  {
    slug: "integrations",
    href: "/features/integrations",
    title: "Integrations",
    description: "Gmail, Outlook, SMTP, Resend, Amazon SES, and more.",
    group: "Deliver",
  },
  {
    slug: "platform",
    href: "/features/platform",
    title: "Teams and security",
    description: "Workspaces, roles, single sign-on, and an audit log.",
    group: "Run",
  },
] as const;

export type Feature = (typeof features)[number];
