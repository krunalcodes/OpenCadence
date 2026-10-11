"use client";

import { Button } from "@workspace/ui/components/button";
import { ImageIcon, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/spinner";
import {
  errorClass,
  secondaryButtonClass,
} from "@/features/settings/components/workspace-parts";
import {
  brandCopy,
  describeBrandError,
} from "@/features/settings/lib/brand-copy";
import type { BrandLogo } from "@/lib/brand";
import { acceptedImageTypes, uploadImage } from "@/lib/media";

type LogoFieldProps = {
  logo: BrandLogo | null;
  savedLogoId: string | null;
  name: string;
  error?: string;
  disabled?: boolean;
  onChange: (logo: BrandLogo | null) => void;
  onBusyChange: (busy: boolean) => void;
};

export function LogoField({
  logo,
  savedLogoId,
  name,
  error,
  disabled,
  onChange,
  onBusyChange,
}: LogoFieldProps) {
  const text = brandCopy.identity;
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file || uploading) {
      return;
    }
    setProblem(null);
    setUploading(true);
    onBusyChange(true);
    const result = await uploadImage(file);
    setUploading(false);
    onBusyChange(false);
    if (!result.ok) {
      const message = describeBrandError(result.error);
      setProblem(message);
      toast.error(brandCopy.toasts.uploadFailed, { description: message });
      return;
    }
    onChange({
      id: result.data.id,
      url: result.data.url,
      width: result.data.width,
      height: result.data.height,
    });
  }

  const currentId = logo?.id ?? null;
  const pendingNote =
    currentId === savedLogoId
      ? null
      : logo
        ? text.logoPending
        : text.logoRemoved;
  const shownError = problem ?? error;

  return (
    <div className="flex flex-col gap-2">
      <span id="brand-logo-label" className="font-medium text-[13px]">
        {text.logo}
      </span>
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid h-16 w-40 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-muted/50 p-2">
          {logo ? (
            <img
              src={logo.url}
              alt={text.logoAlt(name)}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className="flex items-center gap-1.5 text-ink-tertiary text-xs">
              <ImageIcon aria-hidden strokeWidth={1.6} className="size-4" />
              {text.logoEmpty}
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap gap-2">
            <input
              ref={inputRef}
              type="file"
              accept={acceptedImageTypes.join(",")}
              tabIndex={-1}
              aria-hidden
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void handleFile(file);
              }}
            />
            <Button
              id="brand-logo-upload"
              type="button"
              variant="outline"
              disabled={disabled || uploading}
              aria-busy={uploading || undefined}
              aria-describedby="brand-logo-label brand-logo-hint"
              onClick={() => inputRef.current?.click()}
              className={secondaryButtonClass}
            >
              {uploading ? (
                <Spinner />
              ) : (
                <Upload aria-hidden strokeWidth={1.6} />
              )}
              {uploading ? text.uploading : logo ? text.replace : text.upload}
            </Button>
            {logo ? (
              <Button
                type="button"
                variant="outline"
                disabled={disabled || uploading}
                onClick={() => {
                  setProblem(null);
                  onChange(null);
                }}
                className={secondaryButtonClass}
              >
                <Trash2 aria-hidden strokeWidth={1.6} />
                {text.remove}
              </Button>
            ) : null}
          </div>
          {logo?.width && logo.height ? (
            <span className="text-ink-tertiary text-xs tabular-nums">
              {text.logoSize(logo.width, logo.height)}
            </span>
          ) : null}
        </div>
      </div>
      {shownError ? (
        <p role="alert" className={errorClass}>
          {shownError}
        </p>
      ) : (
        <p id="brand-logo-hint" className="text-[13px] text-muted-foreground">
          {pendingNote ?? text.logoHint}
        </p>
      )}
    </div>
  );
}
