"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet";
import { cn } from "@workspace/ui/lib/utils";
import { Check, LogOut, Plus, Search } from "lucide-react";
import Link from "next/link";
import { PageLinks } from "@/components/app-shell/area-panel";
import { areaIcons, focusRing } from "@/components/app-shell/page-header";
import type { ShellUser } from "@/components/app-shell/rail";
import { WorkspaceTile } from "@/components/app-shell/workspace-switcher";
import { Spinner } from "@/components/spinner";
import { initialOf } from "@/lib/initials";
import {
  appHref,
  areas,
  defaultPagePath,
  type NavArea,
  type ViewCounts,
  withViewCounts,
} from "@/lib/navigation";
import type { Workspace } from "@/lib/session";

const groupLabel = "px-2 py-1 font-medium text-[11.5px] text-muted-foreground";

const row =
  "flex min-h-9 items-center gap-[9px] rounded-lg px-2 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

const rowActive =
  "bg-card text-foreground shadow-xs ring-1 ring-border hover:bg-card";

type MobileNavProps = {
  workspace: Workspace;
  workspaces: Workspace[];
  switching: boolean;
  onSwitchWorkspace: (id: string) => void;
  onCreateWorkspace: () => void;
  user: ShellUser;
  signingOut: boolean;
  onSignOut: () => void;
  area: NavArea;
  counts: ViewCounts;
  activePath: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSearch: () => void;
};

export function MobileNav({
  workspace,
  workspaces,
  switching,
  onSwitchWorkspace,
  onCreateWorkspace,
  user,
  signingOut,
  onSignOut,
  area,
  counts,
  activePath,
  open,
  onOpenChange,
  onSearch,
}: MobileNavProps) {
  const close = () => onOpenChange(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-[min(20rem,calc(100vw-3rem))] gap-0 bg-sidebar text-[13px] data-[side=left]:w-[min(20rem,calc(100vw-3rem))]"
      >
        <SheetHeader className="border-border border-b pr-12">
          <SheetTitle className="truncate font-semibold text-[15px]">
            {workspace.name}
          </SheetTitle>
          <SheetDescription className="text-xs">Workspace</SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-2.5">
          <button
            type="button"
            onClick={() => {
              close();
              onSearch();
            }}
            className={cn(
              "flex h-9 w-full shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-[9px] text-left text-muted-foreground shadow-xs",
              focusRing,
            )}
          >
            <Search className="size-4 shrink-0" strokeWidth={1.6} aria-hidden />
            Search or jump to
          </button>

          <nav aria-labelledby="mobile-nav-workspaces">
            <h3 id="mobile-nav-workspaces" className={groupLabel}>
              Workspaces
            </h3>
            <ul
              aria-busy={switching || undefined}
              className={cn(
                "flex max-h-[13.75rem] flex-col gap-px overflow-y-auto rounded-lg p-px transition-opacity",
                switching && "opacity-70",
              )}
            >
              {workspaces.map((item) => {
                const current = item.id === workspace.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-current={current ? "true" : undefined}
                      onClick={() => {
                        close();
                        onSwitchWorkspace(item.id);
                      }}
                      className={cn(
                        row,
                        focusRing,
                        "w-full text-left",
                        current && rowActive,
                      )}
                    >
                      <WorkspaceTile initial={initialOf(item.name)} size="sm" />
                      <span className="min-w-0 flex-1 truncate">
                        {item.name}
                      </span>
                      {current ? (
                        <Check
                          className="size-4 shrink-0 text-primary"
                          strokeWidth={1.6}
                          aria-hidden
                        />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              onClick={() => {
                close();
                onCreateWorkspace();
              }}
              className={cn(row, focusRing, "mt-px w-full text-left")}
            >
              <span
                aria-hidden
                className="grid size-5 shrink-0 place-items-center rounded-[6px] border border-border border-dashed"
              >
                <Plus className="size-3" strokeWidth={1.8} />
              </span>
              Create workspace
            </button>
          </nav>

          <nav aria-labelledby="mobile-nav-areas">
            <h3 id="mobile-nav-areas" className={groupLabel}>
              Areas
            </h3>
            <ul className="flex flex-col gap-px">
              {areas.map((plain) => {
                const item = withViewCounts(plain, counts);
                const Icon = areaIcons[item.id];
                const active = item.id === area.id;
                return (
                  <li key={item.id}>
                    <Link
                      href={appHref(item.pages[0]?.path ?? defaultPagePath)}
                      aria-current={active ? "true" : undefined}
                      onClick={close}
                      className={cn(row, focusRing, active && rowActive)}
                    >
                      <Icon
                        className={cn(
                          "size-4 shrink-0",
                          active && "text-primary",
                        )}
                        strokeWidth={1.6}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {item.title}
                      </span>
                      {item.count ? (
                        <span className="font-normal text-[11.5px] text-ink-tertiary tabular-nums">
                          <span aria-hidden>{item.count}</span>
                          <span className="sr-only">
                            {`${item.count} ${item.countNoun ?? ""}`}
                          </span>
                        </span>
                      ) : null}
                      {item.attention ? (
                        <span className="flex items-center gap-1.5 font-normal text-danger text-xs">
                          <span
                            aria-hidden
                            className="size-[7px] rounded-full bg-danger"
                          />
                          Needs attention
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <nav aria-labelledby="mobile-nav-pages">
            <h3 id="mobile-nav-pages" className={groupLabel}>
              {`${area.title} pages`}
            </h3>
            <PageLinks
              pages={area.pages}
              activePath={activePath}
              onNavigate={close}
            />
          </nav>
        </div>

        <div className="flex items-center gap-2.5 border-border border-t p-2.5 pl-4">
          <span
            aria-hidden
            className="grid size-7 shrink-0 place-items-center rounded-full bg-live font-semibold text-[11px] text-live-foreground"
          >
            {user.initials}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate font-medium text-foreground">{user.name}</p>
            <p className="truncate text-muted-foreground text-xs">
              {user.email}
            </p>
          </div>
          <button
            type="button"
            disabled={signingOut}
            aria-busy={signingOut || undefined}
            onClick={onSignOut}
            className={cn(row, focusRing, "shrink-0 disabled:opacity-60")}
          >
            {signingOut ? (
              <Spinner />
            ) : (
              <LogOut className="size-4" strokeWidth={1.6} aria-hidden />
            )}
            Sign out
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
