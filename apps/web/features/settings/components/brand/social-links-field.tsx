"use client";

import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { cn } from "@workspace/ui/lib/utils";
import { Plus, X } from "lucide-react";
import { buttonFocusRing } from "@/components/app-shell/page-header";
import { OptionCombobox } from "@/components/product/option-combobox";
import {
  errorClass,
  inputClass,
  secondaryButtonClass,
} from "@/features/settings/components/workspace-parts";
import { brandCopy } from "@/features/settings/lib/brand-copy";
import {
  type BrandFormErrors,
  networkOptions,
  type SocialRow,
} from "@/features/settings/lib/brand-form";
import { maxSocialLinks } from "@/lib/brand";

type SocialLinksFieldProps = {
  rows: SocialRow[];
  issues: NonNullable<BrandFormErrors["social"]>;
  error?: string;
  disabled?: boolean;
  onChange: (rows: SocialRow[]) => void;
};

export function socialUrlId(key: string) {
  return `brand-social-url-${key}`;
}

export function socialNetworkId(key: string) {
  return `brand-social-network-${key}`;
}

export function SocialLinksField({
  rows,
  issues,
  error,
  disabled,
  onChange,
}: SocialLinksFieldProps) {
  const text = brandCopy.footer;
  const full = rows.length >= maxSocialLinks;

  function update(key: string, patch: Partial<SocialRow>) {
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="font-medium text-[13px]">
        {text.social}{" "}
        <span className="font-normal text-ink-tertiary">
          {brandCopy.optional}
        </span>
      </span>
      {rows.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{text.socialEmpty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row, index) => {
            const issue = issues[row.key];
            const position = index + 1;
            return (
              <li key={row.key} className="flex flex-col gap-1">
                <div className="flex flex-wrap items-start gap-2">
                  <div className="w-44 shrink-0">
                    <OptionCombobox
                      id={socialNetworkId(row.key)}
                      options={networkOptions(row.network)}
                      value={row.network || null}
                      label={text.networkFor(position)}
                      placeholder={text.networkPlaceholder}
                      empty={text.networkEmpty}
                      clearable={false}
                      disabled={disabled}
                      invalid={issue?.network}
                      onChange={(network) =>
                        update(row.key, { network: network ?? "" })
                      }
                    />
                  </div>
                  <Input
                    id={socialUrlId(row.key)}
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder={text.urlPlaceholder}
                    value={row.url}
                    disabled={disabled}
                    aria-label={text.urlFor(position)}
                    aria-invalid={issue?.url || undefined}
                    onChange={(event) =>
                      update(row.key, { url: event.target.value })
                    }
                    className={cn(
                      inputClass,
                      "min-w-40 flex-1 basis-48 md:text-[13px]",
                    )}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={disabled}
                    aria-label={text.removeLink(position)}
                    onClick={() =>
                      onChange(rows.filter((item) => item.key !== row.key))
                    }
                    className={cn(
                      "mt-0.5 text-muted-foreground hover:bg-accent",
                      buttonFocusRing,
                    )}
                  >
                    <X aria-hidden strokeWidth={1.6} />
                  </Button>
                </div>
                {issue?.network || issue?.url ? (
                  <p role="alert" className={errorClass}>
                    {issue.network ? text.networkMissing : text.urlInvalid}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {error ? (
        <p role="alert" className={errorClass}>
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={disabled || full}
          onClick={() =>
            onChange([
              ...rows,
              {
                key: `new-${Date.now()}-${rows.length}`,
                network: "",
                url: "",
              },
            ])
          }
          className={secondaryButtonClass}
        >
          <Plus aria-hidden strokeWidth={1.8} />
          {text.addLink}
        </Button>
        {full ? (
          <span className="text-ink-tertiary text-xs">
            {text.limit(maxSocialLinks)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
