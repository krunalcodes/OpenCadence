export const contactTopics = [
  { value: "demo", label: "Book a demo" },
  { value: "sales", label: "Sales question" },
  { value: "support", label: "Support" },
  { value: "partnership", label: "Partnership" },
  { value: "other", label: "Something else" },
] as const;

export const contactVolumes = [
  { value: "under-10k", label: "Under 10,000" },
  { value: "10k-100k", label: "10,000 to 100,000" },
  { value: "100k-1m", label: "100,000 to 1 million" },
  { value: "over-1m", label: "Over 1 million" },
] as const;

export type ContactTopic = (typeof contactTopics)[number]["value"];
export type ContactVolume = (typeof contactVolumes)[number]["value"];

export type ContactField =
  | "name"
  | "email"
  | "company"
  | "topic"
  | "volume"
  | "message"
  | "consent";

export type ContactErrors = Partial<Record<ContactField, string>>;

export type ContactSubmission = {
  name: string;
  email: string;
  company: string;
  topic: ContactTopic;
  volume: ContactVolume | null;
  message: string;
  consent: true;
};

export type ContactValidation =
  | { ok: true; data: ContactSubmission }
  | { ok: false; errors: ContactErrors };

export const contactLimits = {
  name: 100,
  email: 254,
  company: 120,
  messageMin: 10,
  messageMax: 5000,
} as const;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function topicNeedsVolume(topic: string | null | undefined): boolean {
  return topic === "demo" || topic === "sales";
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function validateContact(input: unknown): ContactValidation {
  const record =
    typeof input === "object" && input !== null && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const errors: ContactErrors = {};

  const name = text(record.name);
  if (name.length === 0) {
    errors.name = "Enter your full name.";
  } else if (name.length < 2) {
    errors.name = "Enter at least 2 characters for your name.";
  } else if (name.length > contactLimits.name) {
    errors.name = `Shorten your name to ${contactLimits.name} characters or fewer.`;
  }

  const email = text(record.email);
  if (email.length === 0) {
    errors.email = "Enter your work email so we can reply.";
  } else if (email.length > contactLimits.email || !emailPattern.test(email)) {
    errors.email = "Enter an email address in the form name@company.com.";
  }

  const company = text(record.company);
  if (company.length > contactLimits.company) {
    errors.company = `Shorten the company name to ${contactLimits.company} characters or fewer.`;
  }

  const topic = contactTopics.find((item) => item.value === record.topic);
  if (!topic) {
    errors.topic = "Choose what you need from the list.";
  }

  const needsVolume = topicNeedsVolume(topic?.value);
  const volume = contactVolumes.find((item) => item.value === record.volume);
  if (needsVolume && !volume) {
    errors.volume =
      "Choose the range closest to how many emails you send each month.";
  }

  const message = text(record.message);
  if (message.length === 0) {
    errors.message = "Write a message so we know how to help.";
  } else if (message.length < contactLimits.messageMin) {
    errors.message = `Add a little more detail, at least ${contactLimits.messageMin} characters.`;
  } else if (message.length > contactLimits.messageMax) {
    errors.message = `Shorten your message to ${contactLimits.messageMax.toLocaleString("en-US")} characters or fewer.`;
  }

  if (record.consent !== true) {
    errors.consent = "Tick the box to agree before sending.";
  }

  if (!topic || Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      name,
      email,
      company,
      topic: topic.value,
      volume: needsVolume && volume ? volume.value : null,
      message,
      consent: true,
    },
  };
}
