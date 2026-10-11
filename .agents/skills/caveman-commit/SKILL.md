---
name: caveman-commit
description: >
  Write a Conventional Commits message compressed to intent only, then
  stage and commit with it. Use for "write a commit", "commit message",
  "commit this", /commit or /caveman-commit.
---

Write commit messages terse and exact. Conventional Commits format. No fluff. Why over what.

## Rules

**Subject line:**
- `<type>(<scope>): <imperative summary>` — `<scope>` optional
- Types: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `build`, `ci`, `style`, `revert`
- Imperative mood: "add", "fix", "remove" — not "added", "adds", "adding"
- ≤50 chars when possible, hard cap 72
- No trailing period
- Match project convention for capitalization after the colon

**Body (only if needed):**
- Skip entirely when subject is self-explanatory
- Add body only for: non-obvious *why*, breaking changes, migration notes, linked issues
- Wrap at 72 chars
- Bullets `-` not `*`
- Reference issues/PRs at end: `Closes #42`, `Refs #17`

**What NEVER goes in:**
- "This commit does X", "I", "we", "now", "currently" — the diff says what
- "As requested by..." — use Co-authored-by trailer
- "Generated with Claude Code" or any AI attribution — unless the user's own rule requires an `Assisted-by`/AI-attribution trailer, then add it as a trailer
- Emoji (unless project convention requires)
- Restating the file name when scope already says it

## Examples

Diff: new endpoint for user profile with body explaining the why
- ❌ "feat: add a new endpoint to get user profile information from the database"
- ✅
  ```
  feat(api): add GET /users/:id/profile

  Mobile client needs profile data without the full user payload
  to reduce LTE bandwidth on cold-launch screens.

  Closes #128
  ```

Diff: breaking API change
- ✅
  ```
  feat(api)!: rename /v1/orders to /v1/checkout

  BREAKING CHANGE: clients on /v1/orders must migrate to /v1/checkout
  before 2026-06-01. Old route returns 410 after that date.
  ```

## Auto-Clarity

Always include body for: breaking changes, security fixes, data migrations, anything reverting a prior commit. Never compress these into subject-only — future debuggers need the context.

## Commit

After writing the message, make the commit:

1. `git status --short` and `git diff --staged --stat`. If nothing is staged, stage the changes the message describes (`git add -A` when the whole tree is one change; otherwise add paths explicitly). Never stage secrets (`.env`, keys, credentials).
2. Show the message as a code block, then run `git commit` with it. Pass subject and body as separate `-m` flags or via heredoc so wrapping survives.
3. Report the resulting short hash and subject.

## Boundaries

Writes the message and commits. Does not push, does not amend, does not rebase, does not skip hooks (`--no-verify`) unless the user asks. If a hook fails, fix the cause and create a new commit. "message only": output the message without committing. "stop caveman-commit" or "normal mode": revert to verbose commit style.
