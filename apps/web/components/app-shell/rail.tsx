"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { areaIcons } from "@/components/app-shell/page-header";
import { BrandIcon } from "@/components/brand-icon";
import { Spinner } from "@/components/spinner";
import { type AreaId, appHref, areas, defaultPagePath } from "@/lib/navigation";

const railFocus =
  "focus-visible:outline-2 focus-visible:outline-rail-foreground";

const areaTile =
  "relative grid size-10 place-items-center rounded-[10px] transition-colors hover:bg-rail-active hover:text-primary-foreground focus-visible:outline-offset-2";

export function notBuilt(action: string) {
  toast(`${action} is not built yet`, {
    description: "This control is part of the shell preview.",
  });
}

export type ShellUser = {
  name: string;
  email: string;
  initials: string;
};

type RailProps = {
  activeAreaId: AreaId;
  user: ShellUser;
  signingOut: boolean;
  onSignOut: () => void;
};

export function Rail({ activeAreaId, user, signingOut, onSignOut }: RailProps) {
  const mainAreas = areas.filter((area) => area.id !== "settings");
  const settingsActive = activeAreaId === "settings";

  return (
    <nav
      aria-label="Areas"
      className="hidden w-[60px] shrink-0 flex-col items-center gap-3 overflow-y-auto bg-rail py-3 text-rail-foreground md:flex"
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <Link href={appHref(defaultPagePath)} aria-label="OpenCadence" />
          }
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-live ring-1 ring-rail-foreground/25 transition-colors hover:bg-brand-hover focus-visible:outline-offset-2",
            railFocus,
          )}
        >
          <BrandIcon className="size-[18px]" />
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={10}>
          OpenCadence
        </TooltipContent>
      </Tooltip>

      <div aria-hidden className="h-px w-6 shrink-0 bg-rail-border" />

      <ul className="flex flex-col items-center gap-1">
        {mainAreas.map((area) => {
          const Icon = areaIcons[area.id];
          const active = area.id === activeAreaId;
          const first = area.pages[0];
          return (
            <li key={area.id}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Link
                      href={appHref(first?.path ?? defaultPagePath)}
                      aria-label={
                        area.attention
                          ? `${area.title}, needs attention`
                          : area.title
                      }
                      aria-current={active ? "true" : undefined}
                    />
                  }
                  className={cn(
                    areaTile,
                    railFocus,
                    active && "bg-rail-active text-live hover:text-live",
                  )}
                >
                  <Icon className="size-[18px]" strokeWidth={1.6} aria-hidden />
                  {area.attention ? (
                    <span
                      aria-hidden
                      className="absolute top-1.5 right-1.5 size-2 rounded-full bg-danger ring-2 ring-rail"
                    />
                  ) : null}
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={10}>
                  {area.attention
                    ? `${area.title}, needs attention`
                    : area.title}
                </TooltipContent>
              </Tooltip>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto flex flex-col items-center gap-2 pt-3">
        <Tooltip>
          <TooltipTrigger
            render={
              <Link
                href={appHref("settings")}
                aria-label="Settings"
                aria-current={settingsActive ? "true" : undefined}
              />
            }
            className={cn(
              areaTile,
              railFocus,
              settingsActive && "bg-rail-active text-live hover:text-live",
            )}
          >
            <Settings className="size-[18px]" strokeWidth={1.6} aria-hidden />
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={10}>
            Settings
          </TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger
              render={
                <DropdownMenuTrigger
                  render={
                    <button
                      type="button"
                      aria-label={`Account menu for ${user.name}`}
                    />
                  }
                />
              }
              className={cn(
                "grid size-8 place-items-center rounded-full bg-live font-semibold text-[11px] text-live-foreground focus-visible:outline-offset-2",
                railFocus,
              )}
            >
              {user.initials}
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>
              {user.name}
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent
            side="right"
            align="end"
            sideOffset={10}
            className="w-52"
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex flex-col px-2 py-1.5">
                <span className="truncate font-medium text-[13px] text-foreground">
                  {user.name}
                </span>
                <span className="truncate font-normal text-muted-foreground text-xs">
                  {user.email}
                </span>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 px-2 py-1.5 text-[13px]"
              render={<Link href={appHref("settings")} />}
            >
              <Settings strokeWidth={1.6} aria-hidden />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2 px-2 py-1.5 text-[13px]"
              closeOnClick={false}
              disabled={signingOut}
              aria-busy={signingOut || undefined}
              onClick={onSignOut}
            >
              {signingOut ? (
                <Spinner />
              ) : (
                <LogOut strokeWidth={1.6} aria-hidden />
              )}
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
