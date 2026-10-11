import Link from "next/link";
import { NoticeSubmitButton } from "@/features/forms/components/notice-submit-button";
import {
  NoticeAlert,
  NoticeText,
  noticeLinkClass,
  PublicNotice,
} from "@/features/forms/components/public-notice";
import { confirmAction } from "@/features/forms/lib/actions";
import { copy } from "@/features/forms/lib/copy";
import type {
  ConfirmFailure,
  ConfirmResult,
} from "@/features/forms/lib/public-api";
import { confirmPath } from "@/features/forms/lib/public-paths";

const text = copy.confirm;

type ConfirmViewProps = {
  token: string;
  result: ConfirmResult;
  justConfirmed: boolean;
  failed: ConfirmFailure | null;
};

export function ConfirmView({
  token,
  result,
  justConfirmed,
  failed,
}: ConfirmViewProps) {
  if (!result.ok && result.reason === "invalid") {
    return (
      <PublicNotice tone="warning" title={text.invalid.title}>
        <NoticeText>{text.invalid.body}</NoticeText>
      </PublicNotice>
    );
  }

  if (!result.ok) {
    return (
      <PublicNotice tone="warning" title={text.failed.title}>
        <NoticeText>
          {result.reason === "busy" ? text.failed.busy : text.failed.offline}
        </NoticeText>
        <div className="mt-7">
          <Link href={confirmPath(token, {})} className={noticeLinkClass}>
            {text.failed.retryAction}
          </Link>
        </div>
      </PublicNotice>
    );
  }

  const { status, brandName, email } = result.confirmation;
  const sender = brandName || text.fallbackSender;

  if (status === "expired") {
    return (
      <PublicNotice
        brandName={brandName}
        tone="warning"
        title={text.expired.title}
      >
        <NoticeText>{text.expired.body}</NoticeText>
      </PublicNotice>
    );
  }

  if (status === "confirmed" || status === "already") {
    const done = justConfirmed || status === "confirmed";
    return (
      <PublicNotice
        brandName={brandName}
        tone="success"
        title={done ? text.confirmed.title : text.already.title}
      >
        <NoticeText>
          {done ? text.confirmed.body(sender) : text.already.body(sender)}
        </NoticeText>
      </PublicNotice>
    );
  }

  return (
    <PublicNotice brandName={brandName} title={text.ask.title}>
      {failed && failed !== "invalid" ? (
        <div className="mt-5 -mb-3">
          <NoticeAlert>
            <span className="font-medium">{text.failed.title}. </span>
            {failed === "busy" ? text.failed.busy : text.failed.offline}
          </NoticeAlert>
        </div>
      ) : null}
      <NoticeText>
        {text.ask.body(sender)}
        {email ? ` ${text.ask.address(email)}` : null}
      </NoticeText>
      <form action={confirmAction} className="mt-7">
        <input type="hidden" name="token" value={token} />
        <NoticeSubmitButton>{text.ask.action}</NoticeSubmitButton>
      </form>
      <NoticeText className="mt-5 text-[13px]">{text.ask.note}</NoticeText>
    </PublicNotice>
  );
}
