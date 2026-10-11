"use client";

import { createContext, useContext } from "react";
import type { DraftStep } from "@/features/sequences/lib/steps";

export type BuilderContextValue = {
  steps: DraftStep[];
  selectedKey: string | null;
  problemKeys: ReadonlySet<string>;
  canAdd: boolean;
  onInsert: (index: number) => void;
  onDelayChange: (key: string, minutes: number) => void;
};

const BuilderContext = createContext<BuilderContextValue | null>(null);

export const BuilderProvider = BuilderContext.Provider;

export function useBuilder() {
  const value = useContext(BuilderContext);
  if (!value) {
    throw new Error("useBuilder must be used inside the sequence builder.");
  }
  return value;
}

export function useBuilderStep(key: string | null) {
  const { steps } = useBuilder();
  const index = key === null ? -1 : steps.findIndex((step) => step.key === key);
  const step = steps[index];
  return step ? { step, index } : null;
}
