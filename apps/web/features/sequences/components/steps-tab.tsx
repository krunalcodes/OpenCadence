"use client";

import dynamic from "next/dynamic";
import type { SequenceBuilderProps } from "@/features/sequences/components/builder/sequence-builder";
import { BuilderSkeleton } from "@/features/sequences/components/sequence-skeleton";
import { copy } from "@/features/sequences/lib/copy";

const SequenceBuilder = dynamic(
  () =>
    import("@/features/sequences/components/builder/sequence-builder").then(
      (module) => module.SequenceBuilder,
    ),
  {
    ssr: false,
    loading: () => <BuilderSkeleton label={copy.builder.loading} />,
  },
);

export function StepsTab(props: SequenceBuilderProps) {
  return <SequenceBuilder {...props} />;
}
