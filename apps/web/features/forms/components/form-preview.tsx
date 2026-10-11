"use client";

import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group";
import { cn } from "@workspace/ui/lib/utils";
import Link from "next/link";
import { useState } from "react";
import { focusRing } from "@/components/app-shell/page-header";
import { SectionCard } from "@/components/product/section-card";
import {
  segmentedGroupClass,
  segmentedItemClass,
} from "@/components/product/styles";
import { FormView } from "@/features/forms/components/form-view";
import { copy } from "@/features/forms/lib/copy";
import type {
  FormBrand,
  FormField,
  FormSettings,
} from "@/features/forms/lib/forms";
import { appHref } from "@/lib/navigation";

const text = copy.editor.preview;

const views = ["form", "done"] as const;

type PreviewView = (typeof views)[number];

type FormPreviewProps = {
  brand: FormBrand;
  fields: FormField[];
  settings: FormSettings;
};

function ignoreSubmit() {}

export function FormPreview({ brand, fields, settings }: FormPreviewProps) {
  const [view, setView] = useState<PreviewView>("form");

  return (
    <SectionCard
      id="form-preview-title"
      title={text.title}
      description={text.description}
      action={
        <ToggleGroup
          aria-label={text.viewLabel}
          value={[view]}
          onValueChange={(next) => {
            const picked = views.find((item) => item === next[0]);
            if (picked) {
              setView(picked);
            }
          }}
          className={segmentedGroupClass}
        >
          {views.map((item) => (
            <ToggleGroupItem
              key={item}
              value={item}
              className={segmentedItemClass}
            >
              {text[item]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      }
    >
      <div className="max-h-[calc(100svh-220px)] min-h-[320px] overflow-y-auto">
        <FormView
          mode="preview"
          idPrefix="form-preview"
          brand={brand}
          fields={fields}
          settings={settings}
          done={view === "done" ? "subscribed" : null}
          action={ignoreSubmit}
        />
      </div>
      <div className="flex flex-col gap-0.5 border-t border-border-subtle px-4 py-3 text-[12.5px] text-ink-tertiary">
        <p>{text.note}</p>
        <Link
          href={appHref("settings/brand")}
          className={cn(
            "w-fit rounded-[4px] font-medium text-primary underline underline-offset-2",
            focusRing,
          )}
        >
          {text.brandLink}
        </Link>
      </div>
    </SectionCard>
  );
}
