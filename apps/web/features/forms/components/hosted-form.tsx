import Link from "next/link";
import { FormView } from "@/features/forms/components/form-view";
import {
  NoticeText,
  noticeLinkClass,
  PublicNotice,
} from "@/features/forms/components/public-notice";
import { submitFormAction } from "@/features/forms/lib/actions";
import { copy } from "@/features/forms/lib/copy";
import type { PublicFormResult } from "@/features/forms/lib/public-api";
import type { DoneStatus, FormProblem } from "@/features/forms/lib/public-form";
import {
  embedField,
  formField,
  formIdPrefix,
  hostedFormPath,
} from "@/features/forms/lib/public-paths";

const text = copy.public;

const embedStyle =
  'html,body,div:has(>[data-form-view="embed"]),div:has(>[data-form-embed]){background:transparent!important}';

type HostedFormProps = {
  publicId: string;
  result: PublicFormResult;
  embed: boolean;
  done: DoneStatus | null;
  problem: FormProblem | null;
};

export function HostedForm({
  publicId,
  result,
  embed,
  done,
  problem,
}: HostedFormProps) {
  const style = embed ? <style>{embedStyle}</style> : null;

  if (!result.ok) {
    const missing = result.reason === "missing";
    return (
      <>
        {style}
        <div data-form-embed={embed ? "" : undefined}>
          <PublicNotice
            tone="warning"
            compact={embed}
            title={missing ? text.unavailable.title : text.failed.title}
          >
            <NoticeText>
              {missing
                ? text.unavailable.body
                : result.reason === "busy"
                  ? text.failed.busy
                  : text.failed.offline}
            </NoticeText>
            {missing ? null : (
              <div className="mt-7">
                <Link
                  href={hostedFormPath(publicId, embed, {})}
                  className={noticeLinkClass}
                >
                  {text.failed.retryAction}
                </Link>
              </div>
            )}
          </PublicNotice>
        </div>
      </>
    );
  }

  const { form } = result;

  return (
    <>
      {style}
      <FormView
        mode={embed ? "embed" : "page"}
        idPrefix={formIdPrefix}
        brand={form.brand}
        fields={form.fields}
        settings={form.settings}
        done={done}
        problem={done ? null : problem}
        action={submitFormAction}
        hidden={{
          [formField]: publicId,
          ...(embed ? { [embedField]: "1" } : {}),
          ...form.guard.hidden,
        }}
        honeypot={form.guard.honeypot}
        focusStatus
      />
    </>
  );
}
