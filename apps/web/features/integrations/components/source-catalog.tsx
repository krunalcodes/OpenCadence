import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { SourceMark } from "@/components/product/source-mark";
import { secondaryButtonClass } from "@/components/product/styles";
import { comingSoonClass } from "@/features/integrations/components/integration-parts";
import {
  formatFeatures,
  type IntegrationId,
  integrations,
} from "@/features/integrations/lib/catalog";
import { copy } from "@/features/integrations/lib/copy";

type SourceCatalogProps = {
  onConnect: (id: IntegrationId) => void;
};

export function SourceCatalog({ onConnect }: SourceCatalogProps) {
  return (
    <ul className="divide-y divide-border-subtle">
      {integrations.map((item) => (
        <li
          key={item.id}
          className="flex items-center gap-x-4 gap-y-1 px-4 py-[11px]"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2.5 @3xl:flex-[1.4]">
            <SourceMark integration={item} />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium text-foreground">
                {item.name}
              </div>
              <div className="truncate text-xs text-ink-tertiary">
                {item.summary}
              </div>
            </div>
          </div>
          <div className="hidden min-w-0 flex-1 truncate text-[13px] text-muted-foreground @3xl:block">
            <span className="sr-only">{copy.catalog.features}: </span>
            {formatFeatures(item.features)}
          </div>
          <div className="flex w-[104px] shrink-0 justify-end">
            {item.available ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={copy.catalog.connectName(item.name)}
                onClick={() => onConnect(item.id)}
                className={cn(secondaryButtonClass, "px-[9px] text-[12.5px]")}
              >
                {copy.catalog.connect}
              </Button>
            ) : (
              <span className={comingSoonClass}>{copy.catalog.comingSoon}</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
