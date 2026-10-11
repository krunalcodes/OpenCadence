import {
  type CadenceEventState,
  CadenceTimeline,
} from "@workspace/ui/blocks/cadence-timeline";
import { cn } from "@workspace/ui/lib/utils";
import { DeliverabilityAlert } from "@/features/overview/components/deliverability-alert";
import { MailboxList } from "@/features/overview/components/mailbox-list";
import {
  CardLink,
  OverviewCard,
} from "@/features/overview/components/overview-card";
import { OverviewSummary } from "@/features/overview/components/overview-summary";
import { SendsTable } from "@/features/overview/components/sends-table";
import {
  cadenceCard,
  cadenceLanes,
  cadenceLegend,
  mailboxesCard,
  mailboxRows,
  sampleNotice,
  sendsCard,
  todaySends,
} from "@/features/overview/lib/sample";
import { appHref } from "@/lib/navigation";

const legendSwatches: Record<CadenceEventState, string> = {
  sending: "bg-live",
  sent: "bg-sent-surface",
  scheduled: "bg-card outline outline-dashed outline-ink-tertiary",
  warmup: "bg-warmup-surface",
};

type OverviewScreenProps = {
  firstName: string;
};

export function OverviewScreen({ firstName }: OverviewScreenProps) {
  return (
    <div className="@container flex min-w-0 flex-col gap-[18px] text-[13px] leading-normal">
      <OverviewSummary firstName={firstName}>
        <DeliverabilityAlert />
      </OverviewSummary>

      <OverviewCard
        id="overview-cadence"
        title={cadenceCard.title}
        description={cadenceCard.description}
        action={
          <ul className="flex flex-wrap gap-x-3.5 gap-y-1 text-[12.5px] text-muted-foreground">
            {cadenceLegend.map((item) => (
              <li key={item.state} className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-2 rounded-[2px]",
                    legendSwatches[item.state],
                  )}
                />
                {item.label}
              </li>
            ))}
          </ul>
        }
      >
        <CadenceTimeline
          startHour={cadenceCard.startHour}
          endHour={cadenceCard.endHour}
          now={cadenceCard.now}
          lanes={cadenceLanes}
        />
      </OverviewCard>

      <div className="grid grid-cols-1 items-start gap-[18px] @5xl:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)] @[87.5rem]:grid-cols-[minmax(0,1fr)_400px]">
        <OverviewCard
          id="overview-sends"
          title={sendsCard.title}
          description={sendsCard.description}
          action={
            <CardLink href={appHref(sendsCard.actionPath)}>
              {sendsCard.actionLabel}
            </CardLink>
          }
        >
          <SendsTable sends={todaySends} />
        </OverviewCard>

        <OverviewCard
          id="overview-mailboxes"
          title={mailboxesCard.title}
          description={mailboxesCard.description}
          action={
            <CardLink href={appHref(mailboxesCard.actionPath)}>
              {mailboxesCard.actionLabel}
            </CardLink>
          }
        >
          <MailboxList rows={mailboxRows} />
        </OverviewCard>
      </div>

      <p className="text-xs text-ink-tertiary">{sampleNotice}</p>
    </div>
  );
}
