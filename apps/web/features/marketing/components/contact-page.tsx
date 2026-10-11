import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { links } from "@/features/marketing/lib/links";

import { ContactForm } from "./contact-form";
import { PageHero } from "./section";

const steps = [
  {
    title: "You send the form",
    body: "Tell us what you need. For a demo or a sales question, add roughly how much you send each month.",
  },
  {
    title: "A person reads it",
    body: "Your message goes to someone on the team who can answer it.",
  },
  {
    title: "You get a reply by email",
    body: "We write back to the work email you entered. For a demo, that reply is where we agree a time.",
  },
];

const linkRow =
  "group flex items-start justify-between gap-4 px-6 py-5 outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset md:px-10 lg:px-8";

function ContactPage() {
  return (
    <div className="overflow-x-clip">
      <PageHero
        label="Contact"
        title="Talk to the team"
        lead="Book a demo, or ask about pricing, sending, or your account. Fill in the form and a person on the team replies by email."
      />
      <section className="px-0 sm:px-4">
        <div className="mk-rails">
          <div className="mk-row grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="min-w-0 px-6 py-12 md:px-10 md:py-16">
              <h2 className="font-semibold text-2xl tracking-[-0.02em]">
                Send us a message
              </h2>
              <p className="mt-2 max-w-xl text-muted-foreground">
                The same form covers demo requests and general questions. Pick
                what you need and the form asks for the rest.
              </p>
              <div className="mt-8 max-w-xl">
                <ContactForm />
              </div>
            </div>
            <aside className="min-w-0 border-border border-t lg:border-t-0 lg:border-l">
              <div className="px-6 pt-12 pb-6 md:px-10 md:pt-16 lg:px-8">
                <h2 className="font-semibold text-xl tracking-[-0.02em]">
                  What happens next
                </h2>
              </div>
              <ol className="border-border border-t">
                {steps.map((step, index) => (
                  <li
                    key={step.title}
                    className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 border-border border-b px-6 py-5 md:px-10 lg:px-8"
                  >
                    <span
                      aria-hidden="true"
                      className="pt-0.5 font-mono text-primary text-xs"
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-medium text-[15px]">{step.title}</h3>
                      <p className="mt-1 text-muted-foreground text-sm">
                        {step.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mk-hatch px-6 pt-10 pb-6 md:px-10 lg:px-8">
                <h2 className="font-semibold text-xl tracking-[-0.02em]">
                  Skip the conversation
                </h2>
                <p className="mt-2 text-muted-foreground text-sm">
                  You can try the product or report a problem without talking to
                  anyone.
                </p>
              </div>
              <ul className="divide-y divide-border border-border border-t">
                <li>
                  <Link href={links.signUp} className={linkRow}>
                    <span className="min-w-0">
                      <span className="block font-medium text-[15px]">
                        Start for free
                      </span>
                      <span className="mt-1 block text-muted-foreground text-sm">
                        Create a workspace and connect a mailbox.
                      </span>
                    </span>
                    <ArrowRight
                      aria-hidden="true"
                      strokeWidth={1.75}
                      className="mt-0.5 size-4 shrink-0 text-primary transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                    />
                  </Link>
                </li>
                <li>
                  <a
                    href={links.github}
                    target="_blank"
                    rel="noreferrer"
                    className={linkRow}
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-[15px]">
                        Report a bug on GitHub
                        <span className="sr-only"> (opens in a new tab)</span>
                      </span>
                      <span className="mt-1 block text-muted-foreground text-sm">
                        Open an issue in the public repository.
                      </span>
                    </span>
                    <ArrowUpRight
                      aria-hidden="true"
                      strokeWidth={1.75}
                      className="mt-0.5 size-4 shrink-0 text-primary"
                    />
                  </a>
                </li>
              </ul>
            </aside>
          </div>
        </div>
      </section>
    </div>
  );
}

export { ContactPage };
