import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { features } from "@/features/marketing/lib/features";
import { links } from "@/features/marketing/lib/links";

type FooterItem = { label: string; href: string; external?: boolean };

const columns: { title: string; items: FooterItem[] }[] = [
  {
    title: "Product",
    items: features.map((feature) => ({
      label: feature.title,
      href: feature.href,
    })),
  },
  {
    title: "Company",
    items: [
      { label: "Pricing", href: links.pricing },
      { label: "Blog", href: "/blog" },
      { label: "Contact", href: links.contact },
      { label: "Open source", href: links.github, external: true },
    ],
  },
  {
    title: "Legal",
    items: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },
];

const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const linkClass = `inline-flex items-center gap-1 rounded-sm text-muted-foreground transition-colors hover:text-foreground ${focusRing}`;

function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative z-[2] overflow-hidden border-border border-t bg-background text-foreground">
      <div className="mx-auto w-full max-w-[1240px] px-6 pt-16 md:px-10 md:pt-20">
        <div className="grid gap-x-10 gap-y-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="min-w-0">
            <Link
              href={links.home}
              className={`inline-flex items-center gap-2.5 rounded-md font-semibold text-foreground text-base tracking-[-0.01em] ${focusRing}`}
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--mk-brand)] text-live">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="size-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 12h3l3-8 4 16 3-8h5" />
                </svg>
              </span>
              OpenCadence
            </Link>
            <p className="mt-4 max-w-xs text-pretty text-muted-foreground text-sm leading-relaxed">
              Email marketing and outreach on your own providers.
            </p>
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3">
            {columns.map((column) => (
              <nav
                key={column.title}
                aria-label={column.title}
                className="min-w-0"
              >
                <h2 className="font-medium text-foreground text-sm">
                  {column.title}
                </h2>
                <ul className="mt-4 flex flex-col gap-3 text-sm">
                  {column.items.map((item) => (
                    <li key={item.label}>
                      {item.external ? (
                        <a
                          href={item.href}
                          target="_blank"
                          rel="noreferrer"
                          className={linkClass}
                        >
                          {item.label}
                          <ArrowUpRight
                            aria-hidden="true"
                            size={14}
                            strokeWidth={1.75}
                          />
                          <span className="sr-only">(opens in a new tab)</span>
                        </a>
                      ) : (
                        <Link href={item.href} className={linkClass}>
                          {item.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>
        <div className="mt-14 border-border border-t pt-6 text-muted-foreground text-sm">
          <p className="tabular-nums">&copy; {year} OpenCadence</p>
        </div>
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none mt-10 flex justify-center md:mt-14"
      >
        <span className="mk-wordmark">OpenCadence</span>
      </div>
    </footer>
  );
}

export { SiteFooter };
