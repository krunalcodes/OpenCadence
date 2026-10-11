"use client";

import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@workspace/ui/components/input-otp";

export const codeLength = 6;

const slots = Array.from({ length: codeLength }, (_, index) => index);

export function cleanCode(value: string) {
  return value.replace(/\D/g, "").slice(0, codeLength);
}

type CodeInputProps = {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  invalid: boolean;
  describedBy?: string;
  autoFocus?: boolean;
  className?: string;
};

export function CodeInput({
  id,
  value,
  onValueChange,
  invalid,
  describedBy,
  autoFocus,
  className,
}: CodeInputProps) {
  return (
    <InputOTP
      id={id}
      name="code"
      maxLength={codeLength}
      inputMode="numeric"
      pattern="^[0-9]*$"
      autoComplete="one-time-code"
      required
      autoFocus={autoFocus}
      value={value}
      onChange={(next) => onValueChange(cleanCode(next))}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      containerClassName={className}
    >
      <InputOTPGroup className="rounded-lg bg-card shadow-xs">
        {slots.map((index) => (
          <InputOTPSlot
            key={index}
            index={index}
            aria-invalid={invalid || undefined}
            className="size-10 font-medium text-[17px] text-foreground tabular-nums data-[active=true]:border-ring data-[active=true]:ring-2 data-[active=true]:ring-ring data-[active=true]:ring-offset-0 [&_.animate-caret-blink]:bg-primary"
          />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}
