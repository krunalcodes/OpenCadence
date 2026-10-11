"use client";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command";
import { useRouter } from "next/navigation";
import { pageIcon } from "@/components/app-shell/page-header";
import { WorkspaceTile } from "@/components/app-shell/workspace-switcher";
import { initialOf } from "@/lib/initials";
import { appHref, areas } from "@/lib/navigation";
import type { Workspace } from "@/lib/session";

type CommandPaletteProps = {
  workspace: Workspace;
  workspaces: Workspace[];
  onSwitchWorkspace: (id: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CommandPalette({
  workspace,
  workspaces,
  onSwitchWorkspace,
  open,
  onOpenChange,
}: CommandPaletteProps) {
  const router = useRouter();

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search or jump to"
      description="Find a page or switch workspace."
      className="sm:max-w-lg"
    >
      <Command>
        <CommandInput
          placeholder="Search pages and workspaces"
          className="text-[13px]"
        />
        <CommandList className="max-h-[min(22rem,60dvh)]">
          <CommandEmpty className="text-[13px] text-muted-foreground">
            No page or workspace matches that search.
          </CommandEmpty>
          {areas.map((area) => (
            <CommandGroup key={area.id} heading={area.title}>
              {area.pages.map((page) => {
                const Icon = pageIcon(page.path);
                return (
                  <CommandItem
                    key={page.path}
                    value={`page ${area.title} ${page.title}`}
                    onSelect={() => go(appHref(page.path))}
                    className="text-[13px]"
                  >
                    <Icon
                      className="text-muted-foreground"
                      strokeWidth={1.6}
                      aria-hidden
                    />
                    <span className="min-w-0 truncate">{page.title}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))}
          <CommandGroup heading="Switch workspace">
            {workspaces.map((item) => (
              <CommandItem
                key={item.id}
                value={`workspace ${item.name}`}
                data-checked={item.id === workspace.id}
                onSelect={() => {
                  onOpenChange(false);
                  onSwitchWorkspace(item.id);
                }}
                className="text-[13px]"
              >
                <WorkspaceTile initial={initialOf(item.name)} size="sm" />
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
