export type AreaId =
  | "home"
  | "inbox"
  | "send"
  | "audience"
  | "deliverability"
  | "integrations"
  | "settings";

export type NavPage = {
  title: string;
  path: string;
  count?: string;
  keywords?: string;
};

export type NavView = {
  title: string;
  tone: "live" | "warning" | "neutral" | "danger";
  count?: string;
};

export type NavArea = {
  id: AreaId;
  title: string;
  attention?: boolean;
  pages: NavPage[];
  views: NavView[];
};

export const areas: NavArea[] = [
  {
    id: "home",
    title: "Home",
    pages: [{ title: "Overview", path: "dashboard" }],
    views: [
      { title: "Sending now", tone: "live", count: "3" },
      { title: "Scheduled this week", tone: "warning", count: "7" },
    ],
  },
  {
    id: "inbox",
    title: "Inbox",
    pages: [{ title: "Inbox", path: "inbox", count: "18" }],
    views: [
      { title: "Interested", tone: "live", count: "6" },
      { title: "Out of office", tone: "warning", count: "4" },
      { title: "Not now", tone: "neutral", count: "8" },
    ],
  },
  {
    id: "send",
    title: "Send",
    pages: [
      { title: "Campaigns", path: "campaigns", count: "12" },
      { title: "Sequences", path: "sequences", count: "5" },
      { title: "Transactional", path: "transactional" },
      { title: "Templates", path: "templates" },
    ],
    views: [
      { title: "Sending now", tone: "live", count: "3" },
      { title: "Scheduled this week", tone: "warning", count: "7" },
      { title: "Drafts", tone: "neutral", count: "4" },
    ],
  },
  {
    id: "audience",
    title: "Audience",
    pages: [
      { title: "Contacts", path: "contacts", count: "48,210" },
      { title: "Segments", path: "segments" },
      { title: "Forms", path: "forms" },
    ],
    views: [
      { title: "Active customers", tone: "live", count: "3,482" },
      { title: "Unsubscribed", tone: "neutral", count: "1,932" },
    ],
  },
  {
    id: "deliverability",
    title: "Deliverability",
    attention: true,
    pages: [
      { title: "Health", path: "deliverability" },
      { title: "Domains", path: "domains" },
    ],
    views: [
      { title: "Failing checks", tone: "danger", count: "1" },
      { title: "Warming up", tone: "live", count: "4" },
    ],
  },
  {
    id: "integrations",
    title: "Integrations",
    pages: [
      {
        title: "Sources",
        path: "integrations",
        keywords: "mailboxes providers gmail outlook smtp resend ses connect",
      },
      {
        title: "Activity log",
        path: "integrations/activity",
        keywords: "logs events errors history",
      },
    ],
    views: [],
  },
  {
    id: "settings",
    title: "Settings",
    pages: [
      {
        title: "Account",
        path: "settings/account",
        keywords: "profile name email connected accounts google",
      },
      {
        title: "Security",
        path: "settings/security",
        keywords: "password two-factor 2fa authenticator sessions devices",
      },
      {
        title: "Workspace",
        path: "settings/workspace",
        keywords: "general name rename delete",
      },
      {
        title: "Members",
        path: "settings/members",
        keywords: "team people invitations invite roles",
      },
      {
        title: "API keys",
        path: "settings/api-keys",
        keywords: "tokens developers",
      },
    ],
    views: [],
  },
];

export function findPage(path: string) {
  for (const area of areas) {
    const page = area.pages.find((item) => item.path === path);
    if (page) {
      return { area, page };
    }
  }
  return null;
}

export function findActivePage(path: string) {
  const segments = path.split("/").filter(Boolean);
  for (let length = segments.length; length > 0; length -= 1) {
    const found = findPage(segments.slice(0, length).join("/"));
    if (found) {
      return found;
    }
  }
  const area = areas.find((item) =>
    item.pages.some((page) => page.path.startsWith(`${segments[0]}/`)),
  );
  const first = area?.pages[0];
  return area && first && segments.length === 1 ? { area, page: first } : null;
}

export function areaHref(id: AreaId) {
  const first = areas.find((area) => area.id === id)?.pages[0];
  return appHref(first?.path ?? defaultPagePath);
}

export function isNestedPage(page: NavPage) {
  return page.path.includes("/");
}

export const defaultPagePath = "dashboard";

export function appHref(path: string) {
  return `/app/${path}`;
}

export function appPathFromPathname(pathname: string) {
  return pathname.split("/").filter(Boolean).slice(1).join("/");
}
