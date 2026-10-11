"use client";

import { useState } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { RangeSwitch } from "@/features/overview/components/range-switch";
import { StatRow } from "@/features/overview/components/stat-row";
import {
  defaultOverviewRange,
  type OverviewRangeId,
  overviewHeader,
  overviewRanges,
  overviewStats,
} from "@/features/overview/lib/sample";

type OverviewSummaryProps = {
  firstName: string;
  children?: React.ReactNode;
};

export function OverviewSummary({ firstName, children }: OverviewSummaryProps) {
  const [rangeId, setRangeId] = useState<OverviewRangeId>(defaultOverviewRange);
  const range =
    overviewRanges.find((item) => item.id === rangeId) ?? overviewRanges[0];

  return (
    <>
      <PageHeader
        title={`${overviewHeader.greeting}, ${firstName}`}
        description={overviewHeader.description}
        actions={<RangeSwitch value={rangeId} onValueChange={setRangeId} />}
      />
      {children}
      <StatRow stats={overviewStats} comparison={range?.comparison ?? ""} />
    </>
  );
}
