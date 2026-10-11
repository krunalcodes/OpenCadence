"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { BrandForm } from "@/features/settings/components/brand/brand-form";
import { EmailPreview } from "@/features/settings/components/brand/email-preview";
import {
  SettingsSection,
  SettingsStack,
} from "@/features/settings/components/settings-section";
import {
  LoadFailed,
  Notice,
} from "@/features/settings/components/workspace-parts";
import { brandCopy } from "@/features/settings/lib/brand-copy";
import { colorFields, networkLabel } from "@/features/settings/lib/brand-form";
import { type Brand, brandFonts, fontStack } from "@/lib/brand";

type BrandSettingsProps = {
  brand: Brand | null;
  workspaceName: string;
};

export function BrandSettings({ brand, workspaceName }: BrandSettingsProps) {
  if (!brand) {
    return <BrandUnavailable />;
  }
  return brand.canManage ? (
    <BrandForm brand={brand} workspaceName={workspaceName} />
  ) : (
    <BrandReadOnly brand={brand} workspaceName={workspaceName} />
  );
}

function BrandUnavailable() {
  const router = useRouter();
  const [pending, startRetry] = useTransition();

  return (
    <SettingsStack>
      <SettingsSection
        title={brandCopy.identity.title}
        description={brandCopy.identity.description}
      >
        <LoadFailed
          title={brandCopy.loadFailed}
          pending={pending}
          onRetry={() => startRetry(() => router.refresh())}
        />
      </SettingsSection>
    </SettingsStack>
  );
}

const termClass = "font-medium text-muted-foreground";
const valueClass = "mt-1 break-words text-foreground";
const unsetClass = "mt-1 text-ink-tertiary";

function Value({ children }: { children: string | null }) {
  return children ? (
    <dd className={`${valueClass} whitespace-pre-line`}>{children}</dd>
  ) : (
    <dd className={unsetClass}>{brandCopy.readOnly.notSet}</dd>
  );
}

function BrandReadOnly({
  brand,
  workspaceName,
}: {
  brand: Brand;
  workspaceName: string;
}) {
  const identity = brandCopy.identity;
  const look = brandCopy.look;
  const footer = brandCopy.footer;
  const voice = brandCopy.voice;
  const name = brand.brandName.trim() || workspaceName;
  const font = brandFonts.find((item) => item.value === brand.fontFamily);

  return (
    <SettingsStack>
      <SettingsSection
        title={identity.title}
        description={identity.description}
      >
        <Notice title={brandCopy.readOnly.title} className="mb-5">
          {brandCopy.readOnly.body}
        </Notice>
        <dl className="grid max-w-[420px] gap-4 text-[13px]">
          <div>
            <dt className={termClass}>{identity.name}</dt>
            <dd className={valueClass}>
              {brand.brandName.trim() ||
                brandCopy.readOnly.usesWorkspaceName(workspaceName)}
            </dd>
          </div>
          <div>
            <dt className={termClass}>{identity.website}</dt>
            <Value>{brand.websiteUrl}</Value>
          </div>
          <div>
            <dt className={termClass}>{identity.logo}</dt>
            {brand.logo ? (
              <dd className="mt-1.5 grid h-16 w-40 place-items-center overflow-hidden rounded-lg border border-border bg-muted/50 p-2">
                <img
                  src={brand.logo.url}
                  alt={identity.logoAlt(name)}
                  className="max-h-full max-w-full object-contain"
                />
              </dd>
            ) : (
              <dd className={unsetClass}>{identity.logoEmpty}</dd>
            )}
          </div>
        </dl>
      </SettingsSection>

      <SettingsSection title={look.title} description={look.description}>
        <div className="grid gap-6 @5xl/settings:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
          <dl className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(170px,1fr))] content-start gap-4 text-[13px]">
            {colorFields.map((field) => (
              <div key={field}>
                <dt className={termClass}>{look.colors[field]}</dt>
                <dd className="mt-1 flex items-center gap-2 text-foreground">
                  <span
                    aria-hidden
                    className="size-5 shrink-0 rounded-[6px] border border-border"
                    style={{ backgroundColor: brand[field] }}
                  />
                  <span className="font-mono">{brand[field]}</span>
                </dd>
              </div>
            ))}
            <div>
              <dt className={termClass}>{look.font}</dt>
              <dd
                className={valueClass}
                style={{ fontFamily: fontStack(brand.fontFamily) }}
              >
                {font?.label ?? brand.fontFamily}
              </dd>
            </div>
          </dl>
          <EmailPreview
            name={name}
            logo={brand.logo}
            colors={brand}
            fontFamily={brand.fontFamily}
            address={brand.postalAddress ?? ""}
          />
        </div>
      </SettingsSection>

      <SettingsSection title={footer.title} description={footer.description}>
        <dl className="grid max-w-[420px] gap-4 text-[13px]">
          <div>
            <dt className={termClass}>{footer.address}</dt>
            <Value>{brand.postalAddress}</Value>
          </div>
          <div>
            <dt className={termClass}>{footer.social}</dt>
            {brand.socialLinks.length === 0 ? (
              <dd className={unsetClass}>{footer.socialEmpty}</dd>
            ) : (
              <dd className="mt-1">
                <ul className="flex flex-col gap-1">
                  {brand.socialLinks.map((link) => (
                    <li
                      key={`${link.network}-${link.url}`}
                      className="flex min-w-0 gap-2"
                    >
                      <span className="shrink-0 font-medium text-foreground">
                        {networkLabel(link.network)}
                      </span>
                      <span className="min-w-0 truncate text-muted-foreground">
                        {link.url}
                      </span>
                    </li>
                  ))}
                </ul>
              </dd>
            )}
          </div>
        </dl>
      </SettingsSection>

      <SettingsSection title={voice.title} description={voice.description}>
        <dl className="max-w-[60ch] text-[13px]">
          <dt className={termClass}>{voice.label}</dt>
          <Value>{brand.voice}</Value>
        </dl>
      </SettingsSection>
    </SettingsStack>
  );
}
