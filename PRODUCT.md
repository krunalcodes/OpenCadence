# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

OpenCadence serves four groups, and the interface must work for all of them
without a separate mode for each.

- Founders and solo operators who run their own newsletter and outreach, are
  technical enough to self-host, and want to send and get out.
- Small marketing and sales teams who share contacts, campaigns, and inboxes
  and work in the product for hours a day.
- Agencies that manage many client workspaces, mailboxes, and domains at once,
  where density and switching speed matter.
- Developers who self-host it and integrate mostly through the API, using the
  interface as a control panel.

## Product Purpose

OpenCadence is open-source email marketing and outreach software that people
host themselves. It lets one team build newsletters, run multi-step outreach
sequences, send transactional email, and warm up inboxes from a single app.
Success means a user can run all of their email from OpenCadence, on their own
infrastructure, through the mailboxes and providers they already have.

## Positioning

OpenCadence is only the software. Users bring the sending (Gmail, Outlook,
IMAP/SMTP mailboxes, Resend, Amazon SES, and other providers) and keep the
data in their own database. Newsletters and outreach share one contact list
and one suppression list. The software is free under the MIT license at any
list size.

## Operating Context

- Desktop-first working tool used in long sessions: building emails, managing
  contact lists and segments, configuring sequences, triaging replies in a
  unified inbox, and watching deliverability.
- Data-heavy screens: contact tables with many custom fields, campaign and
  sequence reports, per-mailbox and per-domain health.
- Setup work that is technical and error-prone: connecting mailboxes and
  providers on an integrations page, DNS records for SPF, DKIM, and DMARC,
  custom tracking domains.
- Self-hosted with Docker. A hosted version run by the maintainers may follow
  and will run the same code.

## Capabilities and Constraints

- Planned capabilities are listed in `README.md`. The product itself is not
  built yet. Do not present a planned feature as shipped in the README, docs,
  or product UI. The marketing site is the exception by the owner's decision:
  it describes every feature as available and sells the hosted version.
- Stack: Next.js and React, Tailwind CSS, shadcn/ui components on Base UI
  primitives, TanStack Query, TanStack Table. API in NestJS.
- The interface ships in multiple languages. No user-facing string is
  hard-coded.
- Workspaces scope all data. Agencies switch between many of them.
- Unsubscribe handling and suppression apply to every send path and cannot be
  turned off.
- Undecided: authentication library, i18n library, email builder/editor.

## Brand Commitments

- The name is OpenCadence. No logo exists yet.
- Inter is the only typeface.
- The approved visual direction is recorded in `DESIGN.md`: a standard, polished
  SaaS interface with an evergreen and lime palette and a cadence timeline as
  its signature.
- Never name or compare against competing email products in any copy.
- No em dashes in any copy.
- Built with shadcn/ui components, but the product must not look like a stock
  shadcn dashboard or landing page. It needs its own identity.
- Prefer the richer control over the basic one wherever it improves the task,
  for example a searchable combobox in place of a plain select.

## Evidence on Hand

No customers, testimonials, benchmarks, screenshots, or usage numbers exist.
Future work must not invent them. Demonstration data in the interface must be
labeled as sample data.

## Product Principles

1. The user owns the sending and the data. The interface always shows which
   mailbox or provider a message goes through and where data lives.
2. Speed for people who live in it. Frequent actions are reachable from the
   keyboard and never more than a step or two away.
3. Deliverability is visible, not hidden. Health, limits, and risks surface
   where sending decisions are made.
4. Technical setup is guided. DNS, mailbox, and provider configuration explain
   what to do, verify it, and say plainly what is wrong.
5. One product for newsletters and outreach. Shared contacts, suppression, and
   reporting, with no seams between the two.

## Accessibility & Inclusion

Best effort. Follow the accessible behavior that Base UI primitives provide
(keyboard operation, focus management, ARIA) and do not regress it. No named
standard is committed.
