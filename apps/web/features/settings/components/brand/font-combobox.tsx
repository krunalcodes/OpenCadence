"use client";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@workspace/ui/components/combobox";
import { brandCopy } from "@/features/settings/lib/brand-copy";
import { type BrandFontFamily, brandFonts, fontStack } from "@/lib/brand";

type FontOption = (typeof brandFonts)[number];

function sameFont(a: FontOption, b: FontOption) {
  return a.value === b.value;
}

type FontComboboxProps = {
  id: string;
  value: BrandFontFamily;
  disabled?: boolean;
  describedBy?: string;
  onChange: (value: BrandFontFamily) => void;
};

export function FontCombobox({
  id,
  value,
  disabled,
  describedBy,
  onChange,
}: FontComboboxProps) {
  const text = brandCopy.look;
  const selected = brandFonts.find((font) => font.value === value) ?? null;

  return (
    <Combobox
      items={brandFonts}
      value={selected}
      disabled={disabled}
      isItemEqualToValue={sameFont}
      onValueChange={(next: FontOption | null) => {
        if (next) {
          onChange(next.value);
        }
      }}
    >
      <ComboboxInput
        id={id}
        aria-describedby={describedBy}
        placeholder={text.fontPlaceholder}
        disabled={disabled}
        className="h-8 bg-card text-[13px] shadow-xs"
        style={{ fontFamily: fontStack(value) }}
      />
      <ComboboxContent>
        <ComboboxEmpty className="px-3 text-[13px]">
          {text.fontEmpty}
        </ComboboxEmpty>
        <ComboboxList>
          {(item: FontOption) => (
            <ComboboxItem key={item.value} value={item} className="text-sm">
              <span
                className="truncate"
                style={{ fontFamily: fontStack(item.value) }}
              >
                {item.label}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
