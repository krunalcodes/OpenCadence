export type PlanId = "free" | "pro" | "scale" | "enterprise";

export type BillingPeriod = "monthly" | "yearly";

export type PlanCta = "signUp" | "contact";

export type PlanPrice = {
  monthly: number;
  yearlyPerMonth: number;
};

export type PlanLimits = {
  senders: number | "unlimited";
  workspaces: number | "unlimited";
  members: number | "unlimited";
};

export type Plan = {
  id: PlanId;
  name: string;
  audience: string;
  price: PlanPrice | null;
  customPriceLabel?: string;
  customPriceNote?: string;
  cta: PlanCta;
  ctaLabel: string;
  recommended: boolean;
  limits: PlanLimits;
  highlightsLead: string;
  highlights: readonly string[];
};

export type ComparisonValue = boolean | string;

export type ComparisonRow = {
  label: string;
  hint?: string;
  values: Record<PlanId, ComparisonValue>;
};

export type ComparisonGroup = {
  title: string;
  rows: readonly ComparisonRow[];
};

export const currency = {
  code: "USD",
  symbol: "$",
} as const;

export const defaultBillingPeriod: BillingPeriod = "yearly";

export const billingPeriods: readonly { id: BillingPeriod; label: string }[] = [
  { id: "monthly", label: "Monthly" },
  { id: "yearly", label: "Yearly" },
];

export const recommendedTag = "Most popular";

export const freePriceNote = "Free plan";

export const plans: readonly Plan[] = [
  {
    id: "free",
    name: "Free",
    audience: "For one person sending from one address.",
    price: { monthly: 0, yearlyPerMonth: 0 },
    cta: "signUp",
    ctaLabel: "Start for free",
    recommended: false,
    limits: { senders: 1, workspaces: 1, members: 1 },
    highlightsLead: "Includes",
    highlights: [
      "Newsletters, sequences, and the transactional API",
      "Inbox warm-up and DNS checks",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    audience: "For a small team sending from several addresses.",
    price: { monthly: 29, yearlyPerMonth: 24 },
    cta: "signUp",
    ctaLabel: "Start for free",
    recommended: true,
    limits: { senders: 5, workspaces: 3, members: 5 },
    highlightsLead: "Everything in Free, plus",
    highlights: [
      "A/B tests on campaigns",
      "Roles and permissions",
      "Tracking links on your own domain",
    ],
  },
  {
    id: "scale",
    name: "Scale",
    audience: "For agencies and teams that run many senders.",
    price: { monthly: 99, yearlyPerMonth: 82 },
    cta: "signUp",
    ctaLabel: "Start for free",
    recommended: false,
    limits: { senders: 25, workspaces: 10, members: 20 },
    highlightsLead: "Everything in Pro, plus",
    highlights: ["Single sign-on", "Audit log", "Priority support"],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    audience: "For organisations that need custom limits and terms.",
    price: null,
    customPriceLabel: "Custom",
    customPriceNote: "Priced for your setup",
    cta: "contact",
    ctaLabel: "Talk to us",
    recommended: false,
    limits: {
      senders: "unlimited",
      workspaces: "unlimited",
      members: "unlimited",
    },
    highlightsLead: "Everything in Scale, plus",
    highlights: ["A named support contact", "Help with onboarding"],
  },
];

export const limitLabels: Record<
  keyof PlanLimits,
  { singular: string; plural: string }
> = {
  senders: {
    singular: "connected mailbox or provider",
    plural: "connected mailboxes and providers",
  },
  workspaces: { singular: "workspace", plural: "workspaces" },
  members: { singular: "team member", plural: "team members" },
};

export const contactsLimitLabel = "Unlimited contacts";

function limitValue(value: number | "unlimited"): string {
  return value === "unlimited" ? "Unlimited" : String(value);
}

function limitRow(
  label: string,
  key: keyof PlanLimits,
  hint?: string,
): ComparisonRow {
  const values = Object.fromEntries(
    plans.map((plan) => [plan.id, limitValue(plan.limits[key])]),
  ) as Record<PlanId, string>;
  return { label, hint, values };
}

function everyPlan(label: string, hint?: string): ComparisonRow {
  return {
    label,
    hint,
    values: { free: true, pro: true, scale: true, enterprise: true },
  };
}

function fromPlan(first: PlanId, label: string, hint?: string): ComparisonRow {
  const start = plans.findIndex((plan) => plan.id === first);
  const values = Object.fromEntries(
    plans.map((plan, index) => [plan.id, index >= start]),
  ) as Record<PlanId, boolean>;
  return { label, hint, values };
}

export const comparison: readonly ComparisonGroup[] = [
  {
    title: "Sending",
    rows: [
      limitRow(
        "Connected mailboxes and providers",
        "senders",
        "Gmail, Outlook, IMAP/SMTP, Resend, Amazon SES, SendGrid",
      ),
      {
        label: "Emails you can send",
        hint: "Billed by your provider, at its rate",
        values: {
          free: "Set by your provider",
          pro: "Set by your provider",
          scale: "Set by your provider",
          enterprise: "Set by your provider",
        },
      },
      everyPlan("Newsletters and campaigns"),
      everyPlan("Outreach sequences"),
      everyPlan("Transactional email API"),
      everyPlan("Scheduling and hourly send caps"),
      fromPlan("pro", "A/B tests on campaigns"),
    ],
  },
  {
    title: "Audience",
    rows: [
      {
        label: "Contacts",
        values: {
          free: "Unlimited",
          pro: "Unlimited",
          scale: "Unlimited",
          enterprise: "Unlimited",
        },
      },
      everyPlan("Lists, tags, and custom fields"),
      everyPlan("Segments"),
      everyPlan("One suppression list", "Shared by newsletters and outreach"),
      everyPlan("Consent records, export, and erasure"),
    ],
  },
  {
    title: "Deliverability",
    rows: [
      everyPlan("SPF, DKIM, and DMARC checks"),
      everyPlan("Inbox warm-up", "For every connected mailbox"),
      everyPlan("Health history for each sender"),
      everyPlan("Automatic bounce and complaint suppression"),
      everyPlan("Rate limits for each provider and domain"),
      fromPlan("pro", "Tracking links on your own domain"),
    ],
  },
  {
    title: "Team and security",
    rows: [
      limitRow("Workspaces", "workspaces"),
      limitRow("Team members", "members"),
      everyPlan("Two-factor authentication"),
      fromPlan("pro", "Roles and permissions"),
      fromPlan("scale", "Single sign-on", "Through your OIDC provider"),
      fromPlan("scale", "Audit log"),
    ],
  },
  {
    title: "Support",
    rows: [
      everyPlan("Documentation"),
      fromPlan("pro", "Email support"),
      fromPlan("scale", "Priority support"),
      fromPlan("enterprise", "A named support contact"),
      fromPlan("enterprise", "Help with onboarding"),
    ],
  },
];

export function yearlyTotal(price: PlanPrice): number {
  return price.yearlyPerMonth * 12;
}

export function yearlySavingPercent(): number {
  const savings = plans.map((plan) =>
    plan.price && plan.price.monthly > 0
      ? 1 - plan.price.yearlyPerMonth / plan.price.monthly
      : 0,
  );
  return Math.round(Math.max(...savings) * 100);
}

export function formatPrice(amount: number): string {
  return `${currency.symbol}${amount.toLocaleString("en-US")}`;
}

export function formatLimit(
  key: keyof PlanLimits,
  value: number | "unlimited",
): string {
  const label = limitLabels[key];
  if (value === "unlimited") {
    return `Unlimited ${label.plural}`;
  }
  return `${value} ${value === 1 ? label.singular : label.plural}`;
}
