# OpenCadence

Open-source, self-hostable email marketing and outreach. Build newsletters, run
automated sequences, warm up inboxes, and send through the email provider you
already pay for.

Think listmonk or Mailchimp for newsletters and Smartlead for sequences and
warm-up, in one MIT-licensed app you run yourself.

> **Status: early development.** The repository is a fresh scaffold. Nothing
> below is usable yet; the feature list describes what is being built, not what
> ships today. Star or watch the repo to follow along.

## Why

Email tools tend to bundle three things: the software, the sending
infrastructure, and a per-contact price. OpenCadence only wants to be the
software.

- **Bring your own provider.** Connect Amazon SES, Resend, or any SMTP server.
  You keep your sending reputation, your provider pricing, and the option to
  switch.
- **Own your data.** Contacts, content, and engagement history live in your
  database, on your infrastructure.
- **One tool for both jobs.** Opt-in newsletters and one-to-one sequences
  share contacts, suppression lists, and analytics instead of living in two
  products.

## Planned features

### Newsletters and campaigns

- Email builder with reusable templates and a plain HTML/Markdown escape hatch
- Lists, tags, and segments
- Subscription forms, double opt-in, and a preference centre
- Scheduling, send-time throttling, and A/B tests
- Open, click, bounce, complaint, and unsubscribe tracking

### Sequences

- Multi-step sequences with delays, conditions, and branching
- Stop on reply, per-mailbox sending limits, and sending windows
- Mailbox rotation across connected inboxes
- Unified inbox for replies

### Deliverability

- Inbox warm-up with gradual volume ramp
- SPF, DKIM, and DMARC checks for sending domains
- Bounce and complaint handling, with automatic suppression
- Per-provider and per-domain rate limits

### Providers

- Amazon SES
- Resend
- Generic SMTP
- A small adapter interface so new providers are a single package

### Platform

- Self-host with Docker
- Workspaces, team members, and roles
- REST API and webhooks
- Import from CSV and from other tools

## Self-hosted and hosted

The self-hosted version is the product, and stays MIT-licensed with every
feature included. A hosted version run by the maintainers may follow for teams
that would rather not operate it themselves. It will run the same code.

## Responsible sending

OpenCadence is a sending tool, and you are responsible for how you use it.
Follow the laws that apply to you (CAN-SPAM, GDPR, CASL, and others) and your
email provider's acceptable use policy. Unsubscribe handling and suppression
lists are built in and cannot be turned off.

## Development

Requirements: [Bun](https://bun.sh) 1.3+ and Node.js 24+.

```sh
bun install
bun run dev
```

The web app runs at http://localhost:3000.

| Command               | What it does                               |
| --------------------- | ------------------------------------------ |
| `bun run dev`         | Start every app in development mode        |
| `bun run build`       | Build every app and package                |
| `bun run lint`        | Lint and check formatting with Biome       |
| `bun run format`      | Fix formatting, lint, and import order     |
| `bun run check-types` | Type-check every app and package           |

### Repository layout

This is a [Turborepo](https://turborepo.dev) monorepo using Bun workspaces.

- `apps/web`: the [Next.js](https://nextjs.org) application
- `packages/ui`: shared React components
- `packages/typescript-config`: shared `tsconfig.json` presets

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before
opening a pull request, and the [Code of Conduct](CODE_OF_CONDUCT.md) before
joining the discussion. To report a vulnerability, see
[SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
