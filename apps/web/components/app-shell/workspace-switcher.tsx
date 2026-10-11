"use client";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@workspace/ui/components/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { ChevronsUpDown, LoaderCircle, Plus } from "lucide-react";
import { useState } from "react";
import { focusRing } from "@/components/app-shell/page-header";
import { notBuilt } from "@/components/app-shell/rail";
import type { SampleWorkspace } from "@/lib/sample-data";

type WorkspaceTileProps = {
  initial: string;
  size?: "sm" | "md";
  className?: string;
};

export function WorkspaceTile({
  initial,
  size = "md",
  className,
}: WorkspaceTileProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center bg-primary font-semibold text-primary-foreground",
        size === "md"
          ? "size-7 rounded-lg text-xs"
          : "size-5 rounded-[6px] text-[10px]",
        className,
      )}
    >
      {initial}
    </span>
  );
}

type WorkspaceSwitcherProps = {
  workspace: SampleWorkspace;
  workspaces: SampleWorkspace[];
  pending: boolean;
  onSwitch: (id: string) => void;
  variant?: "panel" | "compact";
  className?: string;
};

export function WorkspaceSwitcher({
  workspace,
  workspaces,
  pending,
  onSwitch,
  variant = "panel",
  className,
}: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false);
  const label = `Switch workspace. Current workspace: ${workspace.name}, ${workspace.plan} plan`;

  function choose(id: string) {
    setOpen(false);
    onSwitch(id);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {variant === "panel" ? (
        <PopoverTrigger
          aria-label={label}
          aria-busy={pending || undefined}
          className={cn(
            "flex h-11 w-full shrink-0 items-center gap-2.5 rounded-[10px] border border-border bg-card pr-2 pl-[7px] text-left shadow-xs transition-[background-color,opacity] hover:bg-muted data-popup-open:bg-muted",
            focusRing,
            pending && "opacity-70",
            className,
          )}
        >
          <WorkspaceTile initial={workspace.initial} />
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate font-semibold text-foreground">
              {workspace.name}
            </span>
            <span className="truncate text-[11.5px] text-muted-foreground">
              {`${workspace.plan} plan`}
            </span>
          </span>
          {pending ? (
            <LoaderCircle
              className="size-3.5 shrink-0 animate-spin text-ink-tertiary motion-reduce:animate-none"
              strokeWidth={1.6}
              aria-hidden
            />
          ) : (
            <ChevronsUpDown
              className="size-3.5 shrink-0 text-ink-tertiary"
              strokeWidth={1.6}
              aria-hidden
            />
          )}
        </PopoverTrigger>
      ) : (
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverTrigger
                aria-label={label}
                aria-busy={pending || undefined}
              />
            }
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-lg transition-[background-color,opacity] hover:bg-accent data-popup-open:bg-accent",
              focusRing,
              pending && "opacity-70",
              className,
            )}
          >
            <WorkspaceTile
              initial={workspace.initial}
              size="sm"
              className="size-6 rounded-[7px] text-[11px]"
            />
          </TooltipTrigger>
          <TooltipContent side="bottom">{workspace.name}</TooltipContent>
        </Tooltip>
      )}

      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[268px] gap-0 p-0 text-[13px]"
      >
        <Command label="Workspaces" className="rounded-lg!">
          <CommandInput
            placeholder="Find a workspace"
            aria-label="Find a workspace"
            className="text-[13px]"
          />
          <CommandList className="max-h-none overflow-x-visible overflow-y-visible">
            <CommandEmpty className="py-5 text-[13px] text-muted-foreground">
              No workspace matches that search.
            </CommandEmpty>
            <ScrollArea className="**:data-[slot=scroll-area-viewport]:max-h-[min(17rem,45dvh)]">
              <CommandGroup heading="Workspaces">
                {workspaces.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.name}
                    data-checked={item.id === workspace.id}
                    onSelect={() => choose(item.id)}
                    className="gap-2 rounded-lg px-2 py-1.5 text-[13px]"
                  >
                    <WorkspaceTile initial={item.initial} size="sm" />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {item.name}
                    </span>
                    <span className="shrink-0 text-[11.5px] text-ink-tertiary">
                      {item.plan}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </ScrollArea>
            <CommandSeparator alwaysRender className="mx-0" />
            <CommandGroup forceMount>
              <CommandItem
                forceMount
                value="Create workspace"
                onSelect={() => {
                  setOpen(false);
                  notBuilt("Creating a workspace");
                }}
                className="gap-2 rounded-lg px-2 py-1.5 text-[13px]"
              >
                <span
                  aria-hidden
                  className="grid size-5 shrink-0 place-items-center rounded-[6px] border border-border border-dashed text-muted-foreground"
                >
                  <Plus className="size-3" strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  Create workspace
                </span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
