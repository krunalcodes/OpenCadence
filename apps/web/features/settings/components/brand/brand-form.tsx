"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import { cn } from "@workspace/ui/lib/utils";
import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/spinner";
import { ColorField } from "@/features/settings/components/brand/color-field";
import { EmailPreview } from "@/features/settings/components/brand/email-preview";
import { FontCombobox } from "@/features/settings/components/brand/font-combobox";
import { LogoField } from "@/features/settings/components/brand/logo-field";
import {
  SocialLinksField,
  socialNetworkId,
  socialUrlId,
} from "@/features/settings/components/brand/social-links-field";
import {
  SettingsSection,
  SettingsStack,
} from "@/features/settings/components/settings-section";
import {
  errorClass,
  hintClass,
  inputClass,
  labelClass,
  Notice,
  primaryButtonClass,
} from "@/features/settings/components/workspace-parts";
import {
  brandCopy,
  describeBrandError,
} from "@/features/settings/lib/brand-copy";
import {
  type BrandFormErrors,
  type BrandFormValues,
  type ColorField as ColorFieldName,
  colorFields,
  contrastRatio,
  findIssues,
  formatRatio,
  maxBrandNameLength,
  maxPostalAddressLength,
  maxVoiceLength,
  minimumContrast,
  normalizeHex,
  resolveColors,
  toFormValues,
  toPayload,
} from "@/features/settings/lib/brand-form";
import { type ApiError, request } from "@/lib/api";
import { type Brand, parseBrand } from "@/lib/brand";

function colorId(field: ColorFieldName) {
  return `brand-color-${field}`;
}

function isColorField(field: string): field is ColorFieldName {
  return colorFields.some((name) => name === field);
}

function validate(values: BrandFormValues): BrandFormErrors {
  const issues = findIssues(values);
  const errors: BrandFormErrors = {};
  if (issues.brandName) {
    errors.brandName = brandCopy.identity.nameTooLong(maxBrandNameLength);
  }
  if (issues.websiteUrl) {
    errors.websiteUrl = brandCopy.identity.websiteInvalid;
  }
  for (const field of issues.colors) {
    errors[field] = brandCopy.look.hexInvalid;
  }
  if (issues.postalAddress) {
    errors.postalAddress = brandCopy.footer.addressTooLong(
      maxPostalAddressLength,
    );
  }
  if (issues.voice) {
    errors.voice = brandCopy.voice.tooLong(maxVoiceLength);
  }
  if (Object.keys(issues.social).length > 0) {
    errors.social = issues.social;
  }
  return errors;
}

function serverErrors(error: ApiError): BrandFormErrors | null {
  if (error.code !== "validation" || !error.field) {
    return null;
  }
  const field = error.field.split(/[.[]/)[0] ?? "";
  if (isColorField(field)) {
    return { [field]: brandCopy.look.hexInvalid };
  }
  switch (field) {
    case "brandName":
      return {
        brandName: brandCopy.identity.nameTooLong(maxBrandNameLength),
      };
    case "websiteUrl":
      return { websiteUrl: brandCopy.identity.websiteInvalid };
    case "logoMediaId":
      return { logo: brandCopy.errors.logoMissing };
    case "postalAddress":
      return {
        postalAddress: brandCopy.footer.addressTooLong(maxPostalAddressLength),
      };
    case "voice":
      return { voice: brandCopy.voice.tooLong(maxVoiceLength) };
    case "socialLinks":
      return { socialLinks: brandCopy.footer.socialInvalid };
    default:
      return null;
  }
}

function firstInvalidId(errors: BrandFormErrors, values: BrandFormValues) {
  if (errors.brandName) {
    return "brand-name";
  }
  if (errors.websiteUrl) {
    return "brand-website";
  }
  if (errors.logo) {
    return "brand-logo-upload";
  }
  const color = colorFields.find((field) => errors[field]);
  if (color) {
    return colorId(color);
  }
  if (errors.postalAddress) {
    return "brand-address";
  }
  const row = values.socialLinks.find((item) => errors.social?.[item.key]);
  if (row) {
    return errors.social?.[row.key]?.network
      ? socialNetworkId(row.key)
      : socialUrlId(row.key);
  }
  if (errors.socialLinks) {
    const first = values.socialLinks[0];
    return first ? socialUrlId(first.key) : null;
  }
  if (errors.voice) {
    return "brand-voice";
  }
  return null;
}

type BrandFormProps = {
  brand: Brand;
  workspaceName: string;
};

export function BrandForm({ brand, workspaceName }: BrandFormProps) {
  const router = useRouter();
  const [saved, setSaved] = useState(brand);
  const [values, setValues] = useState(() => toFormValues(brand));
  const [errors, setErrors] = useState<BrandFormErrors>({});
  const [uploading, setUploading] = useState(false);
  const [pending, startSave] = useTransition();

  const colors = resolveColors(values, saved);
  const changed =
    JSON.stringify(toPayload(values)) !==
    JSON.stringify(toPayload(toFormValues(saved)));
  const name = values.brandName.trim() || workspaceName;
  const textContrast = contrastRatio(colors.textColor, colors.contentColor);
  const buttonContrast = contrastRatio("#ffffff", colors.primaryColor);
  const voiceLength = values.voice.trim().length;

  function set<K extends keyof BrandFormValues>(
    field: K,
    value: BrandFormValues[K],
  ) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function clear(field: keyof BrandFormErrors) {
    if (errors[field]) {
      setErrors((current) => ({ ...current, [field]: undefined }));
    }
  }

  function showErrors(next: BrandFormErrors) {
    setErrors(next);
    const id = firstInvalidId(next, values);
    if (id) {
      document.getElementById(id)?.focus();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || uploading) {
      return;
    }
    const next = validate(values);
    if (Object.keys(next).length > 0) {
      showErrors(next);
      return;
    }
    setErrors({});
    if (!changed) {
      return;
    }

    startSave(async () => {
      const result = await request("PUT", "/brand", toPayload(values));
      if (!result.ok) {
        const fieldErrors = serverErrors(result.error);
        if (fieldErrors) {
          showErrors(fieldErrors);
          return;
        }
        toast.error(brandCopy.toasts.saveFailed, {
          description: describeBrandError(result.error),
        });
        return;
      }
      const next = parseBrand(result.data);
      if (next) {
        setSaved(next);
        setValues(toFormValues(next));
      }
      toast.success(brandCopy.toasts.saved);
      startSave(() => router.refresh());
    });
  }

  const identity = brandCopy.identity;
  const look = brandCopy.look;
  const footer = brandCopy.footer;
  const voice = brandCopy.voice;

  return (
    <form noValidate onSubmit={handleSubmit}>
      <SettingsStack>
        <SettingsSection
          title={identity.title}
          description={identity.description}
        >
          <FieldGroup className="max-w-[420px] gap-4">
            <Field data-invalid={errors.brandName ? true : undefined}>
              <FieldLabel htmlFor="brand-name" className={labelClass}>
                {identity.name}
              </FieldLabel>
              <Input
                id="brand-name"
                name="brandName"
                type="text"
                autoComplete="organization"
                placeholder={workspaceName}
                value={values.brandName}
                disabled={pending}
                onChange={(event) => {
                  set("brandName", event.target.value);
                  clear("brandName");
                }}
                aria-invalid={errors.brandName ? true : undefined}
                aria-describedby={
                  errors.brandName ? "brand-name-error" : "brand-name-hint"
                }
                className={cn(inputClass, "md:text-[13px]")}
              />
              {errors.brandName ? (
                <FieldError id="brand-name-error" className={errorClass}>
                  {errors.brandName}
                </FieldError>
              ) : (
                <FieldDescription id="brand-name-hint" className={hintClass}>
                  {identity.nameHint(workspaceName)}
                </FieldDescription>
              )}
            </Field>

            <Field data-invalid={errors.websiteUrl ? true : undefined}>
              <FieldLabel htmlFor="brand-website" className={labelClass}>
                {identity.website}
                <span className="font-normal text-ink-tertiary">
                  {brandCopy.optional}
                </span>
              </FieldLabel>
              <Input
                id="brand-website"
                name="websiteUrl"
                type="url"
                inputMode="url"
                autoComplete="url"
                autoCapitalize="none"
                spellCheck={false}
                placeholder={identity.websitePlaceholder}
                value={values.websiteUrl}
                disabled={pending}
                onChange={(event) => {
                  set("websiteUrl", event.target.value);
                  clear("websiteUrl");
                }}
                aria-invalid={errors.websiteUrl ? true : undefined}
                aria-describedby={
                  errors.websiteUrl ? "brand-website-error" : undefined
                }
                className={cn(inputClass, "md:text-[13px]")}
              />
              {errors.websiteUrl ? (
                <FieldError id="brand-website-error" className={errorClass}>
                  {errors.websiteUrl}
                </FieldError>
              ) : null}
            </Field>

            <LogoField
              logo={values.logo}
              savedLogoId={saved.logo?.id ?? null}
              name={name}
              error={errors.logo}
              disabled={pending}
              onBusyChange={setUploading}
              onChange={(logo) => {
                set("logo", logo);
                clear("logo");
              }}
            />
          </FieldGroup>
        </SettingsSection>

        <SettingsSection title={look.title} description={look.description}>
          <div className="grid gap-6 @5xl/settings:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
            <div className="flex min-w-0 flex-col gap-5">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-4">
                {colorFields.map((field) => (
                  <ColorField
                    key={field}
                    id={colorId(field)}
                    label={look.colors[field]}
                    hint={look.colorHints[field]}
                    value={values[field]}
                    fallback={saved[field]}
                    error={errors[field]}
                    disabled={pending}
                    onChange={(value) => {
                      set(field, value);
                      clear(field);
                    }}
                    onBlur={() => {
                      const hex = normalizeHex(values[field]);
                      if (hex && hex !== values[field]) {
                        set(field, hex);
                      }
                    }}
                  />
                ))}
              </div>

              <Field className="max-w-[420px]">
                <FieldLabel htmlFor="brand-font" className={labelClass}>
                  {look.font}
                </FieldLabel>
                <FontCombobox
                  id="brand-font"
                  value={values.fontFamily}
                  disabled={pending}
                  describedBy="brand-font-hint"
                  onChange={(fontFamily) => set("fontFamily", fontFamily)}
                />
                <FieldDescription id="brand-font-hint" className={hintClass}>
                  {look.fontHint}
                </FieldDescription>
              </Field>

              <div
                aria-live="polite"
                className="flex flex-col gap-2 empty:hidden"
              >
                {textContrast < minimumContrast ? (
                  <Notice tone="warning" title={look.contrastTitle}>
                    {look.contrastText(formatRatio(textContrast))}
                  </Notice>
                ) : null}
                {buttonContrast < minimumContrast ? (
                  <Notice tone="warning" title={look.contrastTitle}>
                    {look.contrastButton(formatRatio(buttonContrast))}
                  </Notice>
                ) : null}
              </div>
            </div>

            <EmailPreview
              name={name}
              logo={values.logo}
              colors={colors}
              fontFamily={values.fontFamily}
              address={values.postalAddress.trim()}
            />
          </div>
        </SettingsSection>

        <SettingsSection title={footer.title} description={footer.description}>
          <div className="flex flex-col gap-5">
            <Field
              data-invalid={errors.postalAddress ? true : undefined}
              className="max-w-[420px]"
            >
              <FieldLabel htmlFor="brand-address" className={labelClass}>
                {footer.address}
              </FieldLabel>
              <Textarea
                id="brand-address"
                name="postalAddress"
                rows={3}
                autoComplete="street-address"
                placeholder={footer.addressPlaceholder}
                value={values.postalAddress}
                disabled={pending}
                onChange={(event) => {
                  set("postalAddress", event.target.value);
                  clear("postalAddress");
                }}
                aria-invalid={errors.postalAddress ? true : undefined}
                aria-describedby={
                  errors.postalAddress
                    ? "brand-address-error"
                    : "brand-address-hint"
                }
                className={cn(inputClass, "min-h-[72px] md:text-[13px]")}
              />
              {errors.postalAddress ? (
                <FieldError id="brand-address-error" className={errorClass}>
                  {errors.postalAddress}
                </FieldError>
              ) : (
                <FieldDescription id="brand-address-hint" className={hintClass}>
                  {footer.addressHint}
                </FieldDescription>
              )}
            </Field>

            <SocialLinksField
              rows={values.socialLinks}
              issues={errors.social ?? {}}
              error={errors.socialLinks}
              disabled={pending}
              onChange={(rows) => {
                set("socialLinks", rows);
                if (errors.social || errors.socialLinks) {
                  setErrors((current) => ({
                    ...current,
                    social: undefined,
                    socialLinks: undefined,
                  }));
                }
              }}
            />
          </div>
        </SettingsSection>

        <SettingsSection
          title={voice.title}
          description={voice.description}
          footer={
            <>
              <span className="min-w-0 flex-1 basis-48">
                {changed ? brandCopy.unsaved : brandCopy.saveNote}
              </span>
              <Button
                type="submit"
                disabled={pending || uploading || !changed}
                aria-busy={pending || undefined}
                className={primaryButtonClass}
              >
                {pending ? <Spinner /> : null}
                {brandCopy.save}
              </Button>
            </>
          }
        >
          <Field data-invalid={errors.voice ? true : undefined}>
            <FieldLabel htmlFor="brand-voice" className={labelClass}>
              {voice.label}
              <span className="font-normal text-ink-tertiary">
                {brandCopy.optional}
              </span>
            </FieldLabel>
            <Textarea
              id="brand-voice"
              name="voice"
              rows={4}
              placeholder={voice.placeholder}
              value={values.voice}
              disabled={pending}
              onChange={(event) => {
                set("voice", event.target.value);
                clear("voice");
              }}
              aria-invalid={errors.voice ? true : undefined}
              aria-describedby={
                errors.voice ? "brand-voice-error" : "brand-voice-count"
              }
              className={cn(inputClass, "min-h-[96px] md:text-[13px]")}
            />
            {errors.voice ? (
              <FieldError id="brand-voice-error" className={errorClass}>
                {errors.voice}
              </FieldError>
            ) : (
              <p
                id="brand-voice-count"
                className={cn(
                  "text-xs tabular-nums",
                  voiceLength > maxVoiceLength
                    ? "text-danger"
                    : "text-ink-tertiary",
                )}
              >
                {voice.count(voiceLength, maxVoiceLength)}
              </p>
            )}
          </Field>
        </SettingsSection>
      </SettingsStack>
    </form>
  );
}
