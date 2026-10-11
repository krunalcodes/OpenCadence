import {
  Activity,
  Ban,
  Building2,
  ClipboardList,
  Code,
  File,
  Flame,
  Funnel,
  GitBranch,
  Globe,
  HeartPulse,
  Inbox,
  KeyRound,
  LayoutDashboard,
  LayoutTemplate,
  ListChecks,
  type LucideIcon,
  Mail,
  Palette,
  Plug,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  UsersRound,
} from "lucide-react";
import type { AreaId } from "@/lib/navigation";

export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export const buttonFocusRing =
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export const areaIcons: Record<AreaId, LucideIcon> = {
  home: LayoutDashboard,
  inbox: Inbox,
  send: Mail,
  audience: Users,
  deliverability: Activity,
  integrations: Plug,
  settings: Settings,
};

const pageIcons: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  inbox: Inbox,
  campaigns: Mail,
  sequences: GitBranch,
  transactional: Code,
  templates: LayoutTemplate,
  contacts: Users,
  lists: ListChecks,
  segments: Funnel,
  forms: ClipboardList,
  suppressions: Ban,
  deliverability: HeartPulse,
  domains: Globe,
  warmup: Flame,
  integrations: Plug,
  "integrations/activity": ScrollText,
  settings: Settings,
  "settings/account": UserRound,
  "settings/security": ShieldCheck,
  "settings/workspace": Building2,
  "settings/members": UsersRound,
  "settings/brand": Palette,
  "settings/ai": Sparkles,
  "settings/api-keys": KeyRound,
};

export function pageIcon(path: string): LucideIcon {
  return pageIcons[path] ?? File;
}

type PageHeaderProps = {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
};

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-[22px] flex flex-wrap items-end gap-x-3 gap-y-4">
      <div className="min-w-0 flex-1 basis-64">
        <h1 className="text-balance font-semibold text-2xl text-foreground leading-[1.2] tracking-[-0.025em]">
          {title}
        </h1>
        {description ? (
          <div className="mt-0.5 text-[13.5px] text-muted-foreground leading-normal">
            {description}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
