# Contributing to OpenCadence

Thanks for taking the time to contribute. The project is at an early stage, so
the most useful contributions right now are design feedback, provider
adapters, and bug reports.

## Before you start

- For anything larger than a small fix, open an issue first so the approach
  can be agreed before you write code.
- Check existing issues and pull requests to avoid duplicate work.
- Security issues do not go in public issues. See [SECURITY.md](SECURITY.md).

## Setup

Requirements: [Bun](https://bun.sh) 1.3+ and Node.js 24+.

```sh
bun install
bun run dev
```

## Making changes

1. Fork the repository and create a branch from `main`.
2. Make your change. Keep pull requests focused on one thing.
3. Run the checks:

   ```sh
   bun run format
   bun run lint
   bun run check-types
   bun run build
   ```

4. Commit using [Conventional Commits](https://www.conventionalcommits.org),
   for example `feat(sequences): stop on reply` or `fix(ses): retry throttled
   sends`.
5. Open a pull request describing what changed and why.

## Code style

[Biome](https://biomejs.dev) handles formatting, linting, and import order.
`bun run format` fixes most issues. There is no ESLint or Prettier config.

## Licensing

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
