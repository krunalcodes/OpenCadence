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
  id?: string;
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
    views: [],
  },
  {
    id: "inbox",
    title: "Inbox",
    pages: [{ title: "Inbox", path: "inbox" }],
    views: [],
  },
  {
    id: "send",
    title: "Send",
    pages: [
      { title: "Campaigns", path: "campaigns" },
      { title: "Sequences", path: "sequences" },
      { title: "Transactional", path: "transactional" },
      { title: "Templates", path: "templates" },
    ],
    views: [],
  },
  {
    id: "audience",
    title: "Audience",
    pages: [
      { title: "Contacts", path: "contacts" },
      {
        title: "Lists",
        path: "lists",
        keywords: "newsletter audience subscribers groups",
      },
      { title: "Segments", path: "segments" },
      { title: "Forms", path: "forms" },
      {
        title: "Suppression list",
        path: "suppressions",
        keywords:
          "suppressed blocked blocklist unsubscribes bounces complaints",
      },
    ],
    views: [],
  },
  {
    id: "deliverability",
    title: "Deliverability",
    pages: [
      { title: "Health", path: "deliverability" },
      { title: "Domains", path: "domains" },
      {
        title: "Warm-up",
        path: "warmup",
        keywords: "warmup warm up inbox placement reputation ramp spam",
      },
    ],
    views: [{ id: "warming-up", title: "Warming up", tone: "live" }],
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
        title: "Brand",
        path: "settings/brand",
        keywords: "logo colours colors font voice address social identity",
      },
      {
        title: "AI",
        path: "settings/ai",
        keywords: "assistant model provider api key llm writing",
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

export type ViewCounts = Record<string, number | undefined>;

export function withViewCounts(area: NavArea, counts: ViewCounts): NavArea {
  return {
    ...area,
    views: area.views.map((view) => {
      const count = view.id ? counts[view.id] : undefined;
      return view.id
        ? { ...view, count: count === undefined ? undefined : String(count) }
        : view;
    }),
  };
}

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
