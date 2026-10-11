"use client";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@workspace/ui/components/input-group";
import { cn } from "@workspace/ui/lib/utils";
import { Eye, EyeOff, Info } from "lucide-react";
import { useState } from "react";

const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const inputClass = cn("bg-card shadow-xs", focusRing);

const inputGroupClass =
  "bg-card shadow-xs has-[[data-slot=input-group-control]:focus-visible]:ring-2 has-[[data-slot=input-group-control]:focus-visible]:ring-ring has-[[data-slot=input-group-control]:focus-visible]:ring-offset-2 has-[[data-slot=input-group-control]:focus-visible]:ring-offset-background";

const primaryButtonClass = cn("w-full hover:bg-brand-hover", focusRing);

const secondaryButtonClass = cn(
  "w-full bg-card shadow-xs hover:bg-muted",
  focusRing,
);

const linkClass = cn(
  "rounded-sm font-medium text-primary underline-offset-4 hover:underline",
  focusRing,
);

const labelClass = "text-[13px]";

const errorClass = "text-[13px] text-danger";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isEmail(value: string) {
  return emailPattern.test(value.trim());
}

function PasswordInput({
  id,
  name,
  value,
  onValueChange,
  autoComplete,
  invalid,
  describedBy,
}: {
  id: string;
  name: string;
  value: string;
  onValueChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  invalid: boolean;
  describedBy?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <InputGroup className={inputGroupClass}>
      <InputGroupInput
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        autoComplete={autoComplete}
        autoCapitalize="none"
        spellCheck={false}
        required
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-xs"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          aria-controls={id}
          onClick={() => setVisible((current) => !current)}
          className={focusRing}
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}

function FormNotice({
  title,
  detail,
}: {
  title: string | null;
  detail?: string;
}) {
  return (
    <div role="status" aria-live="polite">
      {title ? (
        <div className="mt-5 flex gap-2 rounded-lg bg-info-surface px-3 py-2.5 text-[13px] leading-normal">
          <Info
            aria-hidden="true"
            strokeWidth={1.6}
            className="mt-0.5 size-4 shrink-0 text-info"
          />
          <p className="min-w-0">
            <span className="font-medium text-info">{title}</span>
            {detail ? <span className="text-foreground"> {detail}</span> : null}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export {
  errorClass,
  FormNotice,
  inputClass,
  isEmail,
  labelClass,
  linkClass,
  PasswordInput,
  primaryButtonClass,
  secondaryButtonClass,
};
