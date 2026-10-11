# OpenCadence

Open-source (MIT), self-hostable email marketing and outreach platform. In
scope: newsletters and campaigns, transactional email, multi-step sequences,
inbox warm-up, and deliverability tooling.

Status: early. The API and the product app are scaffolds; the marketing site
is built. `README.md` lists what is planned. In the README, docs, and product
UI, do not describe planned features as shipped. The marketing site is the
one exception: by the owner's decision it describes every feature as
available and sells the hosted version (see `DESIGN.md`, Marketing site). It
still must not invent customers, testimonials, numbers, or prices beyond the
placeholders in `apps/web/features/marketing/lib/pricing.ts`.

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
- The product design is approved from a mock only. Do not build product
  screens from it until asked. The marketing site is built and uses the Island
  treatment described in `DESIGN.md`.

## Tech stack

Decided. Use these; do not introduce alternatives without asking.

| Area | Choice |
| --- | --- |
| Backend API | NestJS (`apps/api`), API docs with Scalar at `/docs` |
| Database | PostgreSQL, Drizzle ORM on node-postgres (`@workspace/db`), drizzle-kit SQL migrations |
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
| Authentication | Better Auth (`@workspace/auth`), served by the API at `/api/auth` and proxied by Next; email and password, Google, and the organization (workspaces), two-factor, API key (workspace-owned), Have I Been Pwned and last login method plugins |
| System email | React Email with Tailwind (`@workspace/email`); Resend and console providers |
| Package builds | tsdown |
| API configuration | `@nestjs/config`, one root `.env` |
| Tooling | Turborepo, Bun, TypeScript, Biome |

Not decided yet, so ask before picking: the i18n library, the email
builder/editor, and deployment packaging.

The owner makes every technical decision. Before choosing a library, a
driver, a package layout, a schema convention, or anything else with more
than one reasonable answer, ask with a recommendation. Do not add a
dependency that was not asked for.

## Repository

`ARCHITECTURE.md` is the target folder structure and the rules for where new
code goes. Read it before adding a module, feature, package, or integration,
and follow its naming. Do not create folders ahead of the first file.

Turborepo monorepo on Bun workspaces (Bun 1.3+, Node 24+).

- `apps/web`: Next.js app (port 3000)
- `apps/api`: NestJS API on Fastify (port 3001), compiled with SWC. Routes are
  URI-versioned (`/v1/...`). Root module lives in `src/app/`; tests run on
  Vitest
- `packages/ui`: shared shadcn/ui components on Base UI (`@workspace/ui`)
- `packages/db`: Drizzle schema, client, and migrations (`@workspace/db`)
- `packages/auth`: Better Auth server factory and client (`@workspace/auth`)
- `packages/email`: system email templates and providers (`@workspace/email`)
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
- Product URLs live under `/app` and never contain a workspace identifier.
- Database: plural snake_case table names, snake_case columns, `uuid` ids
  with `defaultRandom()`, `text` for strings (no `varchar`). Better Auth
  tables are generated with its CLI first, then edited to these rules. The
  organization plugin's tables are named for workspaces (`workspaces`,
  `workspace_members`, `workspace_invitations`).
- No file extensions in relative imports (`./auth.module`, not
  `./auth.module.js`). tsdown bundles the packages; the API's `.swcrc` adds
  the extensions at compile time.
- Every API route requires a session by default (global auth guard). Mark
  public routes with `@AllowAnonymous()`.
- API routes that accept a workspace API key use `@WorkspaceAuth("session",
  "apiKey")` and read the workspace from `@CurrentWorkspace()`. Keys are
  sent in the `x-api-key` header.
- Settings pages are built from `SettingsStack` and `SettingsSection` in
  `apps/web/features/settings/components`.
- Emails link to web pages (`/verify-email`, `/reset-password`), never to
  `/api/auth` URLs.
- Show a spinner inside any button that is waiting on a request, and a
  skeleton shaped like the real layout wherever data is loading.
- Packages take configuration as arguments and never read `process.env`.
  The API reads the environment and passes values in.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
