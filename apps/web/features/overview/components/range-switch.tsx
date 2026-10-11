"use client";

import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group";
import { copy, rangeLabels } from "@/features/overview/lib/copy";
import {
  type OverviewRangeId,
  overviewRangeIds,
} from "@/features/overview/lib/overview";

type RangeSwitchProps = {
  value: OverviewRangeId;
  onValueChange: (value: OverviewRangeId) => void;
};

export function RangeSwitch({ value, onValueChange }: RangeSwitchProps) {
  return (
    <ToggleGroup
      aria-label={copy.rangeLabel}
      value={[value]}
      onValueChange={(next) => {
        const picked = overviewRangeIds.find((range) => range === next[0]);
        if (picked) {
          onValueChange(picked);
        }
      }}
      className="gap-0 rounded-lg border border-border bg-muted p-0.5"
    >
      {overviewRangeIds.map((range) => (
        <ToggleGroupItem
          key={range}
          value={range}
          className="h-[26px] min-w-0 rounded-[6px] px-2.5 text-[12.5px] font-medium text-muted-foreground tabular-nums hover:bg-transparent hover:text-foreground focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary focus-visible:outline-solid aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-xs"
        >
          {rangeLabels[range]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
