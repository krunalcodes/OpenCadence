import { Button } from "@workspace/ui/components/button";
import { secondaryButtonClass } from "@/components/product/styles";
import { Spinner } from "@/components/spinner";

type LoadFailedProps = {
  title: string;
  body: string;
  retryLabel: string;
  pending: boolean;
  onRetry: () => void;
};

export function LoadFailed({
  title,
  body,
  retryLabel,
  pending,
  onRetry,
}: LoadFailedProps) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 px-4 py-4"
    >
      <p className="min-w-0 text-[13px] text-muted-foreground">
        <span className="font-medium text-foreground">{title}</span> {body}
      </p>
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={onRetry}
        className={secondaryButtonClass}
      >
        {pending ? <Spinner /> : null}
        {retryLabel}
      </Button>
    </div>
  );
}
