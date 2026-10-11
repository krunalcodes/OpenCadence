# OpenCadence

Open-source (MIT), self-hostable email marketing and outreach platform. In
scope: newsletters and campaigns, transactional email, multi-step sequences,
inbox warm-up, and deliverability tooling.

Status: fresh scaffold. No product features exist yet. `README.md` lists what
is planned; do not describe planned features as shipped.

## Product principles

- **Bring your own provider.** Users connect sending sources on one
  integrations page: mailboxes (Gmail, Outlook, IMAP/SMTP) and providers
  (Resend and Amazon SES first, then SendGrid and other transactional
  providers). Every source sits behind the same adapter interface. Never
  hard-code a provider into feature code; add or extend an adapter.
- **Self-hosted first.** Every feature must work in a self-hosted install with
  no dependency on a maintainer-run service. A hosted version may come later
  and will run the same code, so avoid single-tenant assumptions: scope data
  to a workspace.
- **Compliance is not optional.** Unsubscribe handling, suppression lists, and
  bounce/complaint processing apply to every send path, including sequences.
  Do not add ways to bypass them.
- **Credentials are secrets.** Provider keys and mailbox passwords are
  encrypted at rest and never logged or returned by an API.

- **Built for translation.** The interface ships in multiple languages. Never
  hard-code user-facing strings; route them through the i18n layer.

## Design

Read `PRODUCT.md` (who the product is for and what it must respect) and
`DESIGN.md` (colours, type, layout, components) before any UI work, and use
the `impeccable` skill for it.

- UI is built from shadcn/ui components on Base UI, in `packages/ui`
  (`@workspace/ui`). Add components by running the shadcn CLI from `apps/web`.
- Restyle to the `DESIGN.md` tokens. Never ship the default shadcn look.
- Follow the control rules in `DESIGN.md` under "Choosing the right control",
  for example a searchable combobox in place of a plain select.
- Inter is the only typeface.
- The design is approved from a mock only. Do not build screens from it
  until asked.

## Tech stack

Decided. Use these; do not introduce alternatives without asking.

| Area | Choice |
| --- | --- |
| Backend API | NestJS (`apps/api`), API docs with Scalar at `/docs` |
| Database | PostgreSQL |
| Object storage | S3-compatible (MinIO in local development) |
| Queues and background jobs | BullMQ on Redis (sends, sequence steps, warm-up, webhooks) |
| Web app | Next.js with React (`apps/web`) |
| Styling | Tailwind CSS v4 |
| Components | shadcn/ui on Base UI primitives (`@workspace/ui`) |
| Typeface | Inter variable, self-hosted |
| Data fetching and server state | TanStack Query |
| Data tables | TanStack Table (React Table) |
| AI features | Vercel AI SDK |
| Sending integrations | Resend and Amazon SES first; then Gmail, Outlook, IMAP/SMTP mailboxes and SendGrid-style providers, all behind the adapter interface |
| Tooling | Turborepo, Bun, TypeScript, Biome |

Not decided yet, so ask before picking: ORM or query layer and migration
tool, authentication (must support OIDC single sign-on), the i18n library,
the email builder/editor, and deployment packaging.

## Repository

Turborepo monorepo on Bun workspaces (Bun 1.3+, Node 24+).

- `apps/web`: Next.js app (port 3000)
- `apps/api`: NestJS API on Fastify (port 3001), compiled with SWC. Routes are
  URI-versioned (`/v1/...`). Root module lives in `src/app/`; tests run on
  Vitest
- `packages/ui`: shared shadcn/ui components on Base UI (`@workspace/ui`)
- `packages/typescript-config`: shared tsconfig presets
- `.agents/skills`: project agent skills (symlinked into `.claude/skills`)

## Commands

- `bun run dev`: start all apps
- `bun run build`: build everything
- `bun run lint`: Biome check (lint, format, import order)
- `bun run format`: Biome check with fixes applied
- `bun run check-types`: type-check everything
- `bun run test` / `bun run test:e2e`: unit and end-to-end tests

Local services run from `docker-compose.yml` (`docker compose up -d`):
PostgreSQL 18, Redis 8, and MinIO for S3-compatible storage. Containers are
named `opencadence-<service>` and share the `opencadence` network. Ports and
credentials come from `.env` (see `.env.example`).

A lefthook pre-commit hook runs Biome on staged files and re-stages fixes.

## Conventions

- Never name or compare against competing email products in the README,
  docs, UI copy, or commit messages. Describe OpenCadence on its own terms.
  Sending integrations (Resend, Amazon SES, and so on) are fine to name.
- No em dashes anywhere: code, docs, commit messages, UI copy, or chat
  replies. Use a comma, colon, period, or parentheses instead.
- No code comments unless the user asks for one. Do not add explanatory
  comments, section headers, or TODOs; make the code and names clear instead.
- Biome only: 2-space indent, unused imports are errors, imports are sorted.
  No ESLint or Prettier. Run `bun run format` before finishing.
- Conventional Commits. Use the `caveman-commit` skill to commit.
- Use `bun`, not `npm` or `npx` (the repo pins Bun via `devEngines`).

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
