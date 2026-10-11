# OpenCadence

**Send newsletters and outreach sequences from your own server, through the
email accounts and providers you already use.**

OpenCadence is open-source email marketing and outreach software that you host
yourself. Build newsletters, run multi-step sequences, and warm up inboxes in
one app, under the MIT license.

> **Status: early development, not production ready.** The features under
> "What works today" are built, but OpenCadence has not yet been run against
> real mailboxes at scale. Expect bugs and breaking changes. Everything under
> "Planned" is not built yet.

## Why OpenCadence

Most email tools charge per contact and send through their own infrastructure.
Your bill grows with your list, and your sender reputation sits on servers you
do not control.

OpenCadence is only the software. You bring the sending and keep the data.

- **Send with what you already have.** Connect a Gmail or Outlook mailbox,
  any mailbox over IMAP/SMTP, or a Resend or Amazon SES account today.
  SendGrid is planned. You pay your provider's rate and your sender
  reputation stays yours.
- **Keep your data on your servers.** Contacts, content, and engagement
  history live in your own PostgreSQL database.
- **Run newsletters and outreach from one contact list.** Someone who
  unsubscribes from a newsletter is suppressed in your sequences too, and one
  set of reports covers both.
- **Grow your list without growing your bill.** The software is free under the
  MIT license at any list size.

## What works today

Each item below has an API and, where it is something you use in the app, a
screen.

### Sending sources

Connect every mailbox and provider you send from on one integrations page.

- Gmail mailboxes over Google OAuth, for sending only (replies are not read)
- Any mailbox over IMAP/SMTP, with sending, reply detection, and warm-up
- Resend accounts, with bounce and complaint events received by webhook
- Per-source daily limits, pause and resume, a connection test, a test email,
  and a default source for API sends
- An activity log of what happened on each source
- Credentials encrypted at rest, with versioned keys so the key can be
  replaced
- A small adapter interface, so a new integration is a single package

### Contacts

- Contacts with custom fields, lists, and tags
- Segments built from filter rules on contact fields, custom fields, lists,
  tags, and suppression status
- CSV import with column mapping and a downloadable error report
- Bulk actions on the contact table

### Templates and content

- Reusable templates built in a visual email editor, with preview and test
  sends
- Merge tags with fallbacks
- Image uploads kept in S3-compatible storage
- Brand settings used by emails and the assistant
- AI writing assistant to draft and rewrite emails, suggest subject lines,
  and review a draft, using your own OpenAI-compatible endpoint and key

### Campaigns

- Send to all contacts, to chosen lists, or to a segment
- Send now or schedule for later, then pause, resume, or cancel
- A pre-send check, test sends, and per-campaign results with a recipient
  list

### Sequences

- Multi-step sequences with a delay before each step, built in a visual step
  builder
- Follow-ups sent as a reply in the same thread or as a new email
- Sending windows by weekday, time of day, and timezone
- Mailbox rotation across connected sources, with a daily limit per mailbox
- Stop on reply for IMAP/SMTP mailboxes, and for Gmail and Outlook mailboxes
  once reply detection is turned on for the mailbox (it asks the provider for
  read access; this path has not been tested against real Google and
  Microsoft accounts yet). The app warns when a mailbox in a sequence cannot
  detect replies
- Enrol contacts from lists or segments, and pause, resume, or remove a
  single contact
- AI drafting of a whole sequence from a short brief, reviewed and edited
  before anything is created


### Transactional email

- API to send one-off emails from your own app, such as receipts and password
  resets, through any connected source
- Idempotency keys, so a retried request does not send twice
- A log of sent emails with their status

### Tracking and compliance

- Open and click tracking, switchable per campaign and per sequence
- One-click `List-Unsubscribe` headers and a public unsubscribe page
- One suppression list for unsubscribes, bounces, complaints, and manual
  blocks, checked on every send path
- Automatic suppression from Resend and Amazon SES bounce and complaint
  events (SES through an SNS topic you subscribe), and from bounce notices
  that arrive in a mailbox whose inbox is read

### Deliverability

- Inbox warm-up for IMAP/SMTP mailboxes, with a gradual volume ramp between
  the mailboxes connected to the same install
- Per-source send rate limits and retries

### Platform

- Workspaces, team members, invitations, and owner, admin, and member roles
- Email and password sign-in, Google sign-in, and two-factor authentication
- REST API with workspace API keys, documented at `/docs`
- Overview dashboard built from real sending data

## Planned

None of the following is built yet.

### Newsletters and campaigns

- Plain HTML and Markdown editing as an alternative to the visual editor
- Subscription forms, double opt-in, and a preference centre
- A/B tests and send-time throttling controls
- Attachments
- Public archive of sent newsletters, with an RSS feed
- Spintax for outreach copy

### Transactional email

- Stored templates with variables, sent by template id

### Sequences

- Conditions and branching between steps
- Unified inbox for replies

### Deliverability

- SPF, DKIM, and DMARC checks for sending domains
- Custom tracking domains for open, click, and unsubscribe links
- Per-domain rate limits
- Warm-up for mailboxes other than IMAP/SMTP

### Sending integrations

- Email providers: SendGrid and other transactional providers
- Generic SMTP for providers without an inbox
- Custom channel webhooks, so campaigns can also go out over SMS, WhatsApp,
  or any service with an HTTP endpoint

### Compliance

- Consent records per contact
- Data export and erasure requests

### Platform

- Self-hosting with Docker (production images and a compose file)
- Single sign-on (OIDC)
- Multi-language interface, with translations for the app and the public
  subscription pages
- Scoped API keys and outbound webhooks
- Audit log of who changed or sent what
- Deliverability trends and CSV export of reports
- Import from other tools, and export of contacts to CSV
- Customizable public pages for subscribe, unsubscribe, and preferences

### Later

- Inbound integrations: Zapier, n8n, and Make connectors, inbound webhooks,
  and CRM sync

## Self-hosted and hosted

The self-hosted version is the product. It stays MIT-licensed with every
feature included. A hosted version run by the maintainers may follow for teams
that would rather not operate servers, and it will run the same code.

## Responsible sending

You are responsible for what you send with OpenCadence. Follow the laws that
apply to you (CAN-SPAM, GDPR, CASL, and others) and your email provider's
acceptable use policy. Unsubscribe handling and suppression lists are built in
and cannot be turned off.

## Tech stack

| Area                       | Choice                                                                 |
| -------------------------- | ---------------------------------------------------------------------- |
| Backend API                | [NestJS](https://nestjs.com), API docs with Scalar                     |
| Database                   | [PostgreSQL](https://www.postgresql.org) with Drizzle ORM              |
| Object storage             | S3-compatible (MinIO in local development)                             |
| Queues and background jobs | [BullMQ](https://bullmq.io) on Redis                                   |
| Web app                    | [Next.js](https://nextjs.org) and React                                |
| Styling                    | [Tailwind CSS](https://tailwindcss.com)                                |
| Components                 | shadcn/ui on Base UI primitives                                        |
| Data fetching              | [TanStack Query](https://tanstack.com/query)                           |
| Data tables                | [TanStack Table](https://tanstack.com/table)                           |
| Email editor               | `@react-email/editor`                                                  |
| Sequence builder           | React Flow (`@xyflow/react`)                                           |
| AI features                | [Vercel AI SDK](https://ai-sdk.dev) with an OpenAI-compatible provider |
| Authentication             | Better Auth                                                            |
| System email               | React Email, sent through Resend or printed to the console             |
| Sending integrations       | Gmail, IMAP/SMTP, and Resend today, behind one adapter interface       |
| Tooling                    | Turborepo, Bun, TypeScript, Biome                                      |

The web app, the API, the queue worker, and the database schema exist. See
"What works today" for what they do.

## Development

Requirements: [Bun](https://bun.sh) 1.3+ and Node.js 24+.

```sh
bun install
cp .env.example .env
docker compose up -d
cd packages/db && bun run db:migrate && cd ../..
bun run dev
```

The API does not start without a root `.env`. Copy `.env.example` and replace
two placeholders, each with its own output of `openssl rand -base64 32`:

- `BETTER_AUTH_SECRET` signs sessions.
- `CREDENTIALS_ENCRYPTION_KEY` encrypts the provider keys and mailbox
  passwords you connect. Keep it safe: connected sources cannot be read
  without it.

`docker compose up -d` starts the local services: PostgreSQL 18 on port 5432,
Redis 8 on 6379, and MinIO (S3-compatible storage) on 9000 with its console on
9001. Default credentials are `opencadence` / `opencadence`. Ports and
credentials come from `.env`.

`bun run db:migrate` in `packages/db` applies the SQL migrations. Run it
again after pulling changes that add a migration.

The web app runs at http://localhost:3000 and the API at
http://localhost:3001/v1, with API docs at http://localhost:3001/docs.

Sign-up asks you to verify your email. With `EMAIL_PROVIDER=console` (the
default) no system email is sent: the message, including the verification
link, is printed in the API log. Set `EMAIL_PROVIDER=resend` and
`RESEND_API_KEY` to send it for real.

Background jobs (sends, sequence steps, warm-up, imports) run in a separate
queue worker process built from the same code as the API. `bun run dev`
starts it next to the API; in production run both `node dist/main.js` and
`node dist/worker.js` from `apps/api`.

To connect Gmail mailboxes, create a Google OAuth client, set
`GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET` (or leave both empty to reuse the
Google sign-in client in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`), and
register the redirect URL
`http://localhost:3000/api/v1/sending-sources/gmail/callback`. Keep the
Google consent screen out of "Testing" mode, or connections expire after
seven days.

Gmail and Outlook mailboxes connect for sending only. A user can turn on
reply detection per mailbox, which asks the provider for read access.
`GMAIL_READ_SCOPE_ENABLED` (default `false`) allows asking Google for the
`gmail.readonly` scope: turn it on only when your Google OAuth client may
request it. While it is off, use an IMAP/SMTP connection with an app password
for Gmail mailboxes that need reply detection.

To connect Outlook and Microsoft 365 mailboxes, register an app in Microsoft
Entra with the delegated permissions `User.Read` and `Mail.Send` (and
`Mail.Read` for reply detection), set `OUTLOOK_CLIENT_ID`,
`OUTLOOK_CLIENT_SECRET`, and optionally `OUTLOOK_TENANT` (default `common`),
and register the redirect URL
`http://localhost:3000/api/v1/sending-sources/outlook/callback` as a Web
platform. `OUTLOOK_READ_SCOPE_ENABLED` (default `true`) controls whether
`Mail.Read` is ever requested.

Amazon SES accounts connect with the access key of an IAM user and a region.
The source's setup panel on the Integrations page shows the minimal IAM
policy and the steps to receive bounce and complaint events through an SNS
topic.

Some settings need an address that the outside world can reach:

- `WEBHOOK_BASE_URL`: a public https origin, needed to receive bounce and
  complaint events from Resend and Amazon SES.
- `TRACKING_BASE_URL` and `MEDIA_BASE_URL`: where open, click, and
  unsubscribe links and uploaded images are served from. Both default to
  `BETTER_AUTH_URL` plus `/api/v1`, which only works on your own machine.

The writing assistant calls the OpenAI-compatible endpoint that a workspace
saves under Settings, AI. Set `AI_ALLOW_PRIVATE_ENDPOINTS=true` only to use a
model server on your own network.

Set `BULL_BOARD_USERNAME` and `BULL_BOARD_PASSWORD` to turn on the queue
dashboard at http://localhost:3001/queues.

| Command               | What it does                               |
| --------------------- | ------------------------------------------ |
| `bun run dev`         | Start every app in development mode        |
| `bun run build`       | Build every app and package                |
| `bun run lint`        | Lint and check formatting with Biome       |
| `bun run format`      | Fix formatting, lint, and import order     |
| `bun run check-types` | Type-check every app and package           |
| `bun run test`        | Run unit tests                             |
| `bun run test:e2e`    | Run end-to-end tests                       |

### Repository layout

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full target structure and the
rules for where new code goes.

This is a [Turborepo](https://turborepo.dev) monorepo using Bun workspaces.

- `apps/web`: the [Next.js](https://nextjs.org) application
- `apps/api`: the [NestJS](https://nestjs.com) API and the queue worker
- `packages/ui`: shared shadcn/ui components on Base UI (`@workspace/ui`)
- `packages/db`: Drizzle schema, client, and migrations (`@workspace/db`)
- `packages/auth`: Better Auth server and client (`@workspace/auth`)
- `packages/email`: system email templates and providers (`@workspace/email`)
- `packages/email-renderer`: merge tags, tracking links, and template
  rendering
- `packages/typescript-config`: shared `tsconfig.json` presets
- `integrations/*`: one package per sending integration (`gmail`,
  `imap-smtp`, `resend`), plus the shared adapter interface in
  `integrations/core`

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before
opening a pull request, and the [Code of Conduct](CODE_OF_CONDUCT.md) before
joining the discussion. To report a vulnerability, see
[SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
