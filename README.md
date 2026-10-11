# OpenCadence

**Send newsletters and outreach sequences from your own server, through the
email accounts and providers you already use.**

OpenCadence is open-source email marketing and outreach software that you host
yourself. Build newsletters, run multi-step sequences, and warm up inboxes in
one app, under the MIT license.

> **Status: early development.** The repository is a fresh scaffold. Nothing
> below is usable yet. The feature list describes what is being built, so star
> or watch the repo to follow along.

## Why OpenCadence

Most email tools charge per contact and send through their own infrastructure.
Your bill grows with your list, and your sender reputation sits on servers you
do not control.

OpenCadence is only the software. You bring the sending and keep the data.

- **Send with what you already have.** Connect Gmail, Outlook, or IMAP/SMTP
  mailboxes, or providers such as Resend, Amazon SES, and SendGrid. You pay
  your provider's rate and your sender reputation stays yours.
- **Keep your data on your servers.** Contacts, content, and engagement
  history live in your own PostgreSQL database.
- **Run newsletters and outreach from one contact list.** Someone who
  unsubscribes from a newsletter is suppressed in your sequences too, and one
  set of reports covers both.
- **Grow your list without growing your bill.** The software is free under the
  MIT license at any list size.

## Planned features

### Newsletters and campaigns

- Email builder with reusable templates and a plain HTML/Markdown escape hatch
- AI writing assistant to draft, rewrite, and personalize emails and subject
  lines, using your own model key
- Media library for images and attachments, kept in S3-compatible storage
- Lists, tags, and segments, including advanced segments built from query
  expressions on any contact field
- Custom contact fields and merge tags with fallbacks, plus spintax for
  outreach copy
- Subscription forms, double opt-in, and a preference centre
- Scheduling, send-time throttling, and A/B tests
- Campaign attachments
- Public archive of sent newsletters, with an RSS feed
- Open, click, bounce, complaint, and unsubscribe tracking

### Transactional email

- API to send one-off emails from your own app, such as receipts and password
  resets
- Stored templates with variables, sent through any connected integration

### Sequences

- Multi-step sequences with delays, conditions, and branching
- Stop on reply, per-mailbox sending limits, and sending windows
- Mailbox rotation across connected inboxes
- Unified inbox for replies

### Deliverability

- Inbox warm-up with gradual volume ramp
- SPF, DKIM, and DMARC checks for sending domains
- Bounce and complaint handling, with automatic suppression
- Custom tracking domains for open, click, and unsubscribe links
- Per-provider and per-domain rate limits

### Sending integrations

Connect every mailbox and provider you send from on one integrations page,
then use any mix of them across campaigns and sequences.

- Mailboxes: Gmail, Outlook, and any IMAP/SMTP account (needed for sequences,
  warm-up, and reply detection)
- Email providers: Resend and Amazon SES first, then SendGrid and other
  transactional providers
- Generic SMTP for anything else
- A small adapter interface so a new integration is a single package
- Custom channel webhooks, so campaigns can also go out over SMS, WhatsApp,
  or any service with an HTTP endpoint

### Compliance

- Consent records per contact
- Data export and erasure requests
- One-click `List-Unsubscribe` headers

### Platform

- Self-host with Docker
- Workspaces, team members, and roles
- Single sign-on (OIDC) and two-factor authentication
- Multi-language interface, with translations for the app and the public
  subscription pages
- REST API with scoped API keys per workspace, and webhooks
- Audit log of who changed or sent what
- Overview dashboard, per-campaign and per-sequence reports, deliverability
  trends, and CSV export
- Import from CSV and from other tools, and export contacts to CSV
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

| Area                       | Choice                                         |
| -------------------------- | ---------------------------------------------- |
| Backend API                | [NestJS](https://nestjs.com)                   |
| Database                   | [PostgreSQL](https://www.postgresql.org)       |
| Queues and background jobs | [BullMQ](https://bullmq.io) on Redis           |
| Web app                    | [Next.js](https://nextjs.org) and React        |
| Styling                    | [Tailwind CSS](https://tailwindcss.com)        |
| Data fetching              | [TanStack Query](https://tanstack.com/query)   |
| Data tables                | [TanStack Table](https://tanstack.com/table)   |
| AI features                | [Vercel AI SDK](https://ai-sdk.dev)            |
| Sending integrations       | Resend and Amazon SES first, then mailboxes    |
| Tooling                    | Turborepo, Bun, TypeScript, Biome              |

The web app, the API, the database, and the queue layer exist. The first
feature being built is connecting sending sources (Gmail and Resend).

## Development

Requirements: [Bun](https://bun.sh) 1.3+ and Node.js 24+.

```sh
bun install
docker compose up -d
bun run dev
```

`docker compose up -d` starts the local services: PostgreSQL 18 on port 5432,
Redis 8 on 6379, and MinIO (S3-compatible storage) on 9000 with its console on
9001. Default credentials are `opencadence` / `opencadence`. To change ports or
credentials, copy `.env.example` to `.env` and edit it.

The web app runs at http://localhost:3000 and the API at
http://localhost:3001/v1, with API docs at http://localhost:3001/docs.

Background jobs run in a separate queue worker process built from the same
code as the API. `bun run dev` starts it next to the API; in production run
both `node dist/main.js` and `node dist/worker.js` from `apps/api`.

The API needs `CREDENTIALS_ENCRYPTION_KEY` in `.env` before it starts. It
encrypts the provider keys and mailbox tokens you connect. Generate one with
`openssl rand -base64 32` and keep it safe: connected sources cannot be read
without it.

To connect Gmail mailboxes, create a Google OAuth client, set
`GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET` (or reuse the Google sign-in
client), and register the redirect URL
`http://localhost:3000/api/v1/sending-sources/gmail/callback`. Keep the
Google consent screen out of "Testing" mode, or connections expire after
seven days.

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
- `apps/api`: the [NestJS](https://nestjs.com) API
- `packages/ui`: shared shadcn/ui components on Base UI (`@workspace/ui`)
- `packages/typescript-config`: shared `tsconfig.json` presets
- `integrations/*`: one package per sending integration, plus the shared
  adapter interface in `integrations/core`

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before
opening a pull request, and the [Code of Conduct](CODE_OF_CONDUCT.md) before
joining the discussion. To report a vulnerability, see
[SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
