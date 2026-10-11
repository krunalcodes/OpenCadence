import { Skeleton } from "@workspace/ui/components/skeleton";
import { SettingsSectionSkeleton } from "@/features/settings/components/settings-skeleton";
import { TableSkeleton } from "@/features/settings/components/workspace-parts";

function HeaderSkeleton() {
  return (
    <div className="mb-[22px] flex flex-col gap-2">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-4 w-80 max-w-full" />
    </div>
  );
}

function TableSectionSkeleton({
  columns,
  rows,
}: {
  columns: string[];
  rows: number;
}) {
  return (
    <div className="grid gap-x-10 gap-y-4 border-border-subtle border-b py-7 first:pt-0 last:border-b-0 @4xl/settings:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-2 pt-1">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3.5 w-56 max-w-full" />
        <Skeleton className="h-3.5 w-40 max-w-full" />
      </div>
      <div className="min-w-0 self-start overflow-hidden rounded-[12px] border border-border bg-card shadow-xs">
        <TableSkeleton columns={columns} rows={rows} />
      </div>
    </div>
  );
}

export function WorkspaceSettingsSkeleton() {
  return (
    <div role="status" aria-label="Loading workspace settings">
      <HeaderSkeleton />
      <div className="@container/settings flex flex-col">
        <SettingsSectionSkeleton rows={2} />
        <SettingsSectionSkeleton rows={1} />
      </div>
    </div>
  );
}

export function MembersSettingsSkeleton() {
  return (
    <div role="status" aria-label="Loading members">
      <HeaderSkeleton />
      <div className="@container/settings flex flex-col">
        <SettingsSectionSkeleton rows={1} footer={false} />
        <TableSectionSkeleton
          columns={["Name", "Email", "Role", "Joined"]}
          rows={4}
        />
        <TableSectionSkeleton
          columns={["Email", "Role", "Invited by", "Expires"]}
          rows={2}
        />
      </div>
    </div>
  );
}

export function ApiKeysSettingsSkeleton() {
  return (
    <div role="status" aria-label="Loading API keys">
      <HeaderSkeleton />
      <div className="@container/settings flex flex-col">
        <TableSectionSkeleton
          columns={["Name", "Key", "Created", "Last used", "Expires", "Status"]}
          rows={3}
        />
        <SettingsSectionSkeleton rows={1} footer={false} />
      </div>
    </div>
  );
}
