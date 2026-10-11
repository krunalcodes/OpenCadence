# OpenCadence

Open-source (MIT), self-hostable email marketing and outreach platform. In
scope: newsletters and campaigns, multi-step sequences, inbox warm-up, and
deliverability tooling. Comparable to listmonk and Mailchimp for newsletters
and Smartlead for sequences and warm-up.

Status: fresh scaffold. No product features exist yet. `README.md` lists what
is planned; do not describe planned features as shipped.

## Product principles

- **Bring your own provider.** Sending goes through a provider adapter
  (Amazon SES, Resend, generic SMTP, more later). Never hard-code a provider
  into feature code; add or extend an adapter.
- **Self-hosted first.** Every feature must work in a self-hosted install with
  no dependency on a maintainer-run service. A hosted version may come later
  and will run the same code, so avoid single-tenant assumptions: scope data
  to a workspace.
- **Compliance is not optional.** Unsubscribe handling, suppression lists, and
  bounce/complaint processing apply to every send path, including sequences.
  Do not add ways to bypass them.
- **Credentials are secrets.** Provider keys and mailbox passwords are
  encrypted at rest and never logged or returned by an API.

## Repository

Turborepo monorepo on Bun workspaces (Bun 1.3+, Node 24+).

- `apps/web`: Next.js app
- `packages/ui`: shared React components
- `packages/typescript-config`: shared tsconfig presets
- `.agents/skills`: project agent skills (symlinked into `.claude/skills`)

## Commands

- `bun run dev`: start all apps
- `bun run build`: build everything
- `bun run lint`: Biome check (lint, format, import order)
- `bun run format`: Biome check with fixes applied
- `bun run check-types`: type-check everything

## Conventions

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
