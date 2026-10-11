import { ChevronDown } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { PageHero } from "@/features/marketing/components/section";
import { links } from "@/features/marketing/lib/links";

type LegalSection = {
  id: string;
  title: string;
  body: React.ReactNode;
};

type LegalPageProps = {
  title: string;
  updated: string;
  summary: string;
  intro?: React.ReactNode;
  sections: LegalSection[];
  related: { href: string; label: string };
};

const focusRing =
  "rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const prose =
  "[&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:decoration-2 [&_a:focus-visible]:rounded-sm [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-offset-2 [&_a:focus-visible]:outline-ring [&_h3]:mt-9 [&_h3]:font-semibold [&_h3]:text-[1.0625rem] [&_h3]:text-foreground [&_h3]:tracking-[-0.01em] [&_li]:mt-2 [&_li]:pl-1 [&_p]:mt-4 [&_strong]:font-semibold [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:marker:text-muted-foreground";

function sectionNumber(index: number) {
  return String(index + 1).padStart(2, "0");
}

function ContactLink({ children }: { children?: React.ReactNode }) {
  return <Link href={links.contact}>{children ?? "the contact page"}</Link>;
}

function ContentsList({ sections }: { sections: LegalSection[] }) {
  return (
    <ol className="space-y-0.5">
      {sections.map((section, index) => (
        <li key={section.id}>
          <a
            href={`#${section.id}`}
            className={`flex gap-3 py-1.5 text-muted-foreground text-sm leading-snug transition-colors hover:text-foreground ${focusRing}`}
          >
            <span
              aria-hidden="true"
              className="w-5 shrink-0 pt-px font-mono text-primary text-xs tabular-nums"
            >
              {sectionNumber(index)}
            </span>
            <span className="min-w-0">{section.title}</span>
          </a>
        </li>
      ))}
    </ol>
  );
}

function LegalPage({
  title,
  updated,
  summary,
  intro,
  sections,
  related,
}: LegalPageProps) {
  return (
    <>
      <PageHero
        label="Legal"
        title={title}
        lead={`Last updated ${updated}. ${summary}`}
      />
      <section className="px-0 sm:px-4">
        <div className="mk-rails">
          <div className="mk-row grid grid-cols-1 lg:grid-cols-[18rem_minmax(0,1fr)]">
            <aside className="min-w-0 border-border border-b lg:border-r lg:border-b-0">
              <details className="group lg:hidden">
                <summary
                  className={`flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-4 font-mono text-foreground text-xs md:px-10 [&::-webkit-details-marker]:hidden ${focusRing}`}
                >
                  <span>Contents, {sections.length} sections</span>
                  <ChevronDown
                    aria-hidden="true"
                    className="size-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
                  />
                </summary>
                <nav
                  aria-label="Contents"
                  className="border-border border-t px-6 py-4 md:px-10"
                >
                  <ContentsList sections={sections} />
                </nav>
              </details>
              <nav
                aria-label="Contents"
                className="sticky top-28 hidden max-h-[calc(100vh-8rem)] overflow-y-auto px-8 py-12 lg:block"
              >
                <p className="mb-4 font-mono text-foreground text-xs">
                  Contents
                </p>
                <ContentsList sections={sections} />
              </nav>
            </aside>
            <article className="min-w-0 px-6 py-12 md:px-10 md:py-16 lg:px-14">
              <div className="max-w-[56ch] text-[17px] text-foreground leading-[1.7]">
                {intro ? (
                  <div
                    className={`mb-12 text-muted-foreground [&>p:first-child]:mt-0 ${prose}`}
                  >
                    {intro}
                  </div>
                ) : null}
                <div>
                  {sections.map((section, index) => (
                    <section
                      key={section.id}
                      aria-labelledby={section.id}
                      className="mt-12 border-border border-t pt-12 first:mt-0 first:border-t-0 first:pt-0"
                    >
                      <h2
                        id={section.id}
                        className="flex scroll-mt-28 items-baseline gap-4 text-balance font-semibold text-2xl leading-tight tracking-[-0.02em] md:text-[1.75rem]"
                      >
                        <span
                          aria-hidden="true"
                          className="shrink-0 font-mono font-normal text-primary text-sm tabular-nums tracking-normal"
                        >
                          {sectionNumber(index)}
                        </span>
                        <span className="min-w-0">{section.title}</span>
                      </h2>
                      <div className={`text-pretty ${prose}`}>
                        {section.body}
                      </div>
                    </section>
                  ))}
                </div>
                <div className="mt-14 grid grid-cols-1 border border-border sm:grid-cols-2 sm:divide-x sm:divide-border">
                  <Link
                    href={related.href}
                    className={`min-w-0 border-border border-b px-5 py-4 transition-colors hover:bg-accent sm:border-b-0 ${focusRing}`}
                  >
                    <span className="block font-mono text-muted-foreground text-xs">
                      Also read
                    </span>
                    <span className="mt-1 block font-medium text-base">
                      {related.label}
                    </span>
                  </Link>
                  <Link
                    href={links.contact}
                    className={`min-w-0 px-5 py-4 transition-colors hover:bg-accent ${focusRing}`}
                  >
                    <span className="block font-mono text-muted-foreground text-xs">
                      Questions
                    </span>
                    <span className="mt-1 block font-medium text-base">
                      Contact us
                    </span>
                  </Link>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>
    </>
  );
}

export type { LegalSection };
export { ContactLink, LegalPage };
