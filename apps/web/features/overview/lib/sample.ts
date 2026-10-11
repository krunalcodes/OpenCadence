import type {
  CadenceEventState,
  CadenceLane,
} from "@workspace/ui/blocks/cadence-timeline";
import type { HealthDay } from "@workspace/ui/blocks/health-strip";
import type { BadgeTone } from "@/components/status-badge";

export type OverviewRangeId = "24h" | "7d" | "30d" | "90d";

export type OverviewRange = {
  id: OverviewRangeId;
  label: string;
  comparison: string;
};

export const overviewRanges: OverviewRange[] = [
  { id: "24h", label: "24h", comparison: "vs. previous 24 hours" },
  { id: "7d", label: "7 days", comparison: "vs. previous 7 days" },
  { id: "30d", label: "30 days", comparison: "vs. previous 30 days" },
  { id: "90d", label: "90 days", comparison: "vs. previous 90 days" },
];

export const defaultOverviewRange: OverviewRangeId = "7d";

export const overviewHeader = {
  greeting: "Good morning",
  description: "3 sends are running and 2 are scheduled for today.",
  rangeLabel: "Date range",
};

export const overviewAlert = {
  title: "DKIM is failing on getnorthwind.co.",
  body: "Sends from outreach@getnorthwind.co are paused until the record is fixed.",
  actionLabel: "Fix DNS record",
  actionPath: "deliverability",
};

export type OverviewStat = {
  id: string;
  label: string;
  value: string;
  delta: string;
  deltaTone: "good" | "bad";
  caption?: string;
};

export const overviewStats: OverviewStat[] = [
  {
    id: "sent",
    label: "Emails sent",
    value: "20,752",
    delta: "+12.4%",
    deltaTone: "good",
  },
  {
    id: "open-rate",
    label: "Open rate",
    value: "46.9%",
    delta: "+2.1 pts",
    deltaTone: "good",
    caption: "9,733 unique opens",
  },
  {
    id: "reply-rate",
    label: "Reply rate",
    value: "11.3%",
    delta: "+0.8 pts",
    deltaTone: "good",
    caption: "36 replies across 5 sequences",
  },
  {
    id: "bounce-rate",
    label: "Bounce rate",
    value: "1.9%",
    delta: "+0.6 pts",
    deltaTone: "bad",
    caption: "Keep this under 2%",
  },
];

export const cadenceCard = {
  title: "Today's cadence",
  description: "Everything going out from this workspace, hour by hour",
  startHour: 6,
  endHour: 22,
  now: 10.43,
};

export const cadenceLegend: { state: CadenceEventState; label: string }[] = [
  { state: "sending", label: "Sending" },
  { state: "sent", label: "Sent" },
  { state: "scheduled", label: "Scheduled" },
];

export const cadenceLanes: CadenceLane[] = [
  {
    id: "campaigns",
    label: "Campaigns",
    events: [
      {
        id: "weekly-digest",
        label: "Weekly digest",
        start: 8,
        end: 9.25,
        state: "sent",
      },
      {
        id: "october-product-update",
        label: "October product update",
        start: 9.5,
        end: 12.25,
        state: "sending",
      },
      {
        id: "webinar-invite",
        label: "Webinar invite",
        start: 12.4,
        end: 14,
        state: "scheduled",
      },
      {
        id: "win-back",
        label: "Win-back",
        start: 14.25,
        end: 15.5,
        state: "scheduled",
      },
    ],
  },
  {
    id: "sequences",
    label: "Sequences",
    events: [
      {
        id: "agency-founders-step-2",
        label: "Agency founders, step 2",
        start: 9,
        end: 15,
        state: "sending",
      },
      {
        id: "trial-ending-step-3",
        label: "Trial ending, step 3",
        start: 16,
        end: 18,
        state: "scheduled",
      },
    ],
  },
  {
    id: "transactional",
    label: "Transactional",
    events: [
      {
        id: "api-sends",
        label: "214 sent by API",
        start: 6,
        end: 10.43,
        state: "sent",
      },
    ],
  },
  {
    id: "warm-up",
    label: "Warm-up",
    events: [
      {
        id: "warm-up-mailboxes",
        label: "4 mailboxes, 96 of 160 sent",
        start: 6,
        end: 18,
        state: "warmup",
      },
    ],
  },
];

export type SendStatus = "sending" | "sent" | "scheduled" | "draft";

export type TodaySend = {
  id: string;
  name: string;
  detail: string;
  path: "campaigns" | "sequences";
  via: { mark: string; label: string } | null;
  status: SendStatus;
  statusLabel: string;
  sent: number;
  total: number;
  openRate: number | null;
  clickRate: number | null;
};

export const sendsCard = {
  title: "Today's sends",
  description: "Campaigns and sequence steps going out today",
  actionLabel: "View all",
  actionPath: "campaigns",
  viaFallback: "Not chosen",
  emptyValue: "n/a",
  columns: {
    name: "Name",
    via: "Sending via",
    status: "Status",
    progress: "Progress",
    opens: "Opens",
    clicks: "Clicks",
  },
};

export const todaySends: TodaySend[] = [
  {
    id: "october-product-update",
    name: "October product update",
    detail: "Segment: Active customers",
    path: "campaigns",
    via: { mark: "R", label: "Resend" },
    status: "sending",
    statusLabel: "Sending",
    sent: 8112,
    total: 21900,
    openRate: 41.2,
    clickRate: 6.8,
  },
  {
    id: "agency-founders-step-2",
    name: "Agency founders, step 2",
    detail: "Follow-up, day 3",
    path: "sequences",
    via: { mark: "3", label: "3 mailboxes" },
    status: "sending",
    statusLabel: "Sending",
    sent: 64,
    total: 240,
    openRate: 58,
    clickRate: 9.4,
  },
  {
    id: "weekly-digest",
    name: "Weekly digest",
    detail: "List: Newsletter",
    path: "campaigns",
    via: { mark: "S", label: "Amazon SES" },
    status: "sent",
    statusLabel: "Sent",
    sent: 12480,
    total: 12480,
    openRate: 52.6,
    clickRate: 9.1,
  },
  {
    id: "webinar-invite",
    name: "Webinar invite",
    detail: "Segment: Trial users",
    path: "campaigns",
    via: { mark: "R", label: "Resend" },
    status: "scheduled",
    statusLabel: "Scheduled 12:24",
    sent: 0,
    total: 5300,
    openRate: null,
    clickRate: null,
  },
  {
    id: "pricing-change-notice",
    name: "Pricing change notice",
    detail: "All contacts",
    path: "campaigns",
    via: null,
    status: "draft",
    statusLabel: "Draft",
    sent: 0,
    total: 48210,
    openRate: null,
    clickRate: null,
  },
];

export type MailboxRow = {
  id: string;
  kind: "mailbox" | "provider";
  name: string;
  detail: string;
  days: HealthDay[];
  statusTone: BadgeTone;
  statusLabel: string;
};

export const mailboxesCard = {
  title: "Mailboxes and providers",
  description: "6 connected",
  actionLabel: "Manage",
  actionPath: "integrations",
  healthLabel: "Health over the last 14 days",
};

const healthyDays: HealthDay[] = Array.from({ length: 14 }, () => "healthy");

function daysWith(overrides: Record<number, HealthDay>): HealthDay[] {
  return healthyDays.map((day, index) => overrides[index] ?? day);
}

export const mailboxRows: MailboxRow[] = [
  {
    id: "maya",
    kind: "mailbox",
    name: "maya@northwind.studio",
    detail: "Gmail · 38 of 80 today",
    days: healthyDays,
    statusTone: "success",
    statusLabel: "Healthy",
  },
  {
    id: "sam",
    kind: "mailbox",
    name: "sam@northwind.studio",
    detail: "Outlook · 71 of 80 today",
    days: daysWith({ 8: "warning", 13: "warning" }),
    statusTone: "warning",
    statusLabel: "Near limit",
  },
  {
    id: "resend",
    kind: "provider",
    name: "Resend",
    detail: "API · 8,112 sent today",
    days: healthyDays,
    statusTone: "success",
    statusLabel: "Healthy",
  },
  {
    id: "amazon-ses",
    kind: "provider",
    name: "Amazon SES",
    detail: "us-east-1 · 12,480 sent today",
    days: daysWith({ 4: "warning" }),
    statusTone: "success",
    statusLabel: "Healthy",
  },
  {
    id: "outreach",
    kind: "mailbox",
    name: "outreach@getnorthwind.co",
    detail: "IMAP/SMTP · paused",
    days: daysWith({
      0: "none",
      1: "none",
      2: "none",
      3: "none",
      10: "warning",
      11: "failing",
      12: "failing",
      13: "failing",
    }),
    statusTone: "danger",
    statusLabel: "DKIM failing",
  },
];

export const sampleNotice = "All figures on this screen are sample data.";
