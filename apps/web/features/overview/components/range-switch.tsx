"use client";

import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group";
import {
  type OverviewRangeId,
  overviewHeader,
  overviewRanges,
} from "@/features/overview/lib/sample";

type RangeSwitchProps = {
  value: OverviewRangeId;
  onValueChange: (value: OverviewRangeId) => void;
};

export function RangeSwitch({ value, onValueChange }: RangeSwitchProps) {
  return (
    <ToggleGroup
      aria-label={overviewHeader.rangeLabel}
      value={[value]}
      onValueChange={(next) => {
        const picked = overviewRanges.find((range) => range.id === next[0]);
        if (picked) {
          onValueChange(picked.id);
        }
      }}
      className="gap-0 rounded-lg border border-border bg-muted p-0.5"
    >
      {overviewRanges.map((range) => (
        <ToggleGroupItem
          key={range.id}
          value={range.id}
          className="h-[26px] min-w-0 rounded-[6px] px-2.5 text-[12.5px] font-medium text-muted-foreground tabular-nums hover:bg-transparent hover:text-foreground focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary focus-visible:outline-solid aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-xs"
        >
          {range.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
