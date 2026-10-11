# Architecture and folder structure

This is the target layout of the OpenCadence repository: where code lives
today and where each planned feature will go. It is a map to build towards,
not a set of empty folders. Create a folder when the first file for it is
written.

Entries marked `(exists)` are in the repository now. Everything else is
planned.

## Principles

1. **Apps deploy, packages are imported.** Anything that runs as a process
   lives in `apps/`. Anything shared lives in `packages/` or `integrations/`.
   Packages never import from apps.
2. **Organise by domain, not by file type.** The API has one module per
   domain (contacts, campaigns, sequences). The web app has one feature
   folder per domain with the same names. A change to "segments" touches
   `modules/segments` and `features/segments`, not ten type-based folders.
3. **Same names everywhere.** A domain has one name across the API module,
   the web feature, the route, the queue, and the i18n namespace.
4. **One integration, one package.** Every mailbox type and email provider is
   its own package behind a single interface, so adding a provider never
   touches feature code.
5. **Scale by process, not by repository.** The API and the queue workers are
   the same codebase started with different entrypoints. They scale
   independently without duplicating domain code.
6. **Flat until it hurts.** No folder exists to hold a single file. No
   nesting beyond what is shown here without a reason written in this
   document.

## Top level

```text
OpenCadence/
├── apps/                    deployable applications
│   ├── api/                 NestJS: HTTP API and queue workers        (exists)
│   └── web/                 Next.js: the product and public pages     (exists)
├── packages/                shared libraries
│   ├── ui/                  shadcn/ui components on Base UI           (exists)
│   ├── typescript-config/   shared tsconfig presets                   (exists)
│   ├── db/                  database schema, migrations, client
│   ├── contracts/           request and response schemas shared by API and web
│   ├── api-client/          typed client generated from the OpenAPI document
│   ├── email-renderer/      merge tags, spintax, template to HTML and text
│   ├── i18n/                locale catalogs for the app, public pages, emails
│   └── env/                 environment variable schema and loader
├── integrations/            one package per mailbox type or provider
│   ├── core/                the adapter interface and shared test kit
│   ├── resend/
│   ├── ses/
│   ├── smtp/
│   ├── imap/
│   ├── gmail/
│   ├── outlook/
│   └── sendgrid/
├── deploy/                  production packaging
│   ├── docker/              Dockerfiles for api and web
│   └── compose/             production compose file and env template
├── docs/                    self-hosting, configuration, and contributor guides
├── scripts/                 one-off and maintenance scripts
├── .github/                 issue templates and CI workflows          (exists)
├── .agents/                 agent skills                              (exists)
├── docker-compose.yml       local development services                (exists)
├── AGENTS.md  DESIGN.md  PRODUCT.md  README.md                        (exists)
└── biome.json  turbo.json  lefthook.yml  package.json                 (exists)
```

`integrations/` sits at the top level, beside `packages/`, because it is the
main place outside contributors add code. It becomes a third workspace glob
(`integrations/*`) when the first integration is written.

## apps/api

One NestJS application with two entrypoints. `main.ts` serves HTTP.
`worker.ts` starts the same modules without the HTTP server and runs the
BullMQ processors. In production these run as separate containers from the
same image, so sending capacity scales without scaling the API.

```text
apps/api/
├── src/
│   ├── main.ts                    HTTP entrypoint                     (exists)
│   ├── worker.ts                  queue worker entrypoint
│   ├── app/                       root module                         (exists)
│   ├── config/                    typed configuration per concern
│   ├── common/                    cross-cutting code with no domain knowledge
│   │   ├── decorators/
│   │   ├── filters/
│   │   ├── guards/
│   │   ├── interceptors/
│   │   ├── pipes/
│   │   └── pagination/
│   ├── infra/                     adapters to things outside the process
│   │   ├── database/
│   │   ├── redis/
│   │   ├── queue/
│   │   ├── storage/
│   │   ├── crypto/
│   │   ├── i18n/
│   │   └── logger/
│   └── modules/                   one folder per domain
│       ├── auth/                  sign-in, sessions, SSO, two-factor
│       ├── users/
│       ├── workspaces/            workspaces, members, roles
│       ├── api-keys/
│       ├── audit-log/
│       ├── contacts/              contacts and custom fields
│       ├── lists/
│       ├── tags/
│       ├── segments/
│       ├── imports/               CSV and tool imports, contact export
│       ├── forms/                 subscription forms and public pages
│       ├── consent/               consent records, export and erasure requests
│       ├── suppression/           unsubscribes, bounces, complaints, blocklist
│       ├── templates/
│       ├── media/
│       ├── ai/                    writing assistant
│       ├── campaigns/
│       ├── sequences/
│       ├── transactional/
│       ├── inbox/                 unified reply inbox
│       ├── integrations/          connected mailboxes and providers
│       ├── domains/               sending and tracking domains, DNS checks
│       ├── warmup/
│       ├── dispatch/              the send pipeline: limits, rotation, retries
│       ├── tracking/              open, click, and unsubscribe endpoints
│       ├── provider-events/       inbound bounce and complaint webhooks
│       ├── analytics/             dashboards and reports
│       ├── webhooks/              outbound webhooks
│       └── archive/               public newsletter archive and RSS
└── test/                          end-to-end tests                    (exists)
```

Modules stay flat under `modules/`. Thirty folders in one list is easier to
scan and to search than a tree of groups, and a module never has to move when
a grouping changes.

### Inside a module

Every module follows the same shape. Only create the parts it needs.

```text
modules/campaigns/
├── campaigns.module.ts
├── campaigns.controller.ts        HTTP routes, versioned under /v1
├── campaigns.service.ts           use cases
├── campaigns.repository.ts        all database access for this module
├── campaigns.service.spec.ts      unit tests sit beside the code
├── dto/                           request and response classes
├── jobs/                          BullMQ processors and job payloads
├── events/                        events this module emits and handles
└── policies/                      permission checks
```

Rules:

- A module talks to another module only through that module's exported
  service or through events. Never import another module's repository, DTOs,
  or jobs.
- Only `*.repository.ts` files touch the database.
- Only `dispatch` sends email, and it sends only through an integration
  adapter. `campaigns`, `sequences`, `transactional`, and `warmup` hand
  messages to `dispatch`. This is what guarantees suppression and limits
  apply to every send path.
- Every table and every query is scoped to a workspace.
- `common/` knows nothing about domains. `infra/` knows nothing about
  domains. If code needs a domain concept it belongs in a module.

## apps/web

One Next.js application for the signed-in product and the public pages. The
`app/` directory holds routes only. Each route file is thin and renders a
feature.

```text
apps/web/
├── app/                           routes                              (exists)
│   ├── layout.tsx                                                     (exists)
│   ├── (auth)/                    signed-out pages
│   │   ├── sign-in/
│   │   ├── sign-up/
│   │   └── sso/
│   ├── (app)/                     the product, behind sign-in
│   │   └── [workspace]/           every product URL carries the workspace
│   │       ├── page.tsx           overview
│   │       ├── inbox/
│   │       ├── campaigns/
│   │       ├── sequences/
│   │       ├── transactional/
│   │       ├── templates/
│   │       ├── contacts/
│   │       ├── segments/
│   │       ├── forms/
│   │       ├── deliverability/
│   │       ├── integrations/
│   │       ├── domains/
│   │       └── settings/
│   └── (public)/                  pages for subscribers, no sign-in
│       ├── subscribe/
│       ├── unsubscribe/
│       ├── preferences/
│       └── archive/
├── features/                      one folder per domain, named like the API
│   ├── overview/
│   ├── inbox/
│   ├── campaigns/
│   │   ├── components/            screens and parts used only by campaigns
│   │   ├── hooks/
│   │   ├── queries/               TanStack Query options and mutations
│   │   └── lib/                   pure helpers
│   ├── sequences/
│   ├── contacts/
│   └── ...                        the same shape for every domain
├── components/                    composed UI shared across features  (exists)
│   ├── app-shell/                 sidebar, top bar, workspace switcher
│   ├── command-palette/
│   └── data-table/                TanStack Table wrapper, filters, bulk bar
├── hooks/                         hooks shared across features        (exists)
├── lib/                           API client setup, query client, auth, i18n (exists)
└── public/                        static assets                       (exists)
```

Rules:

- Files under `app/` contain routing, layouts, metadata, and data loading.
  Screens and logic live in `features/`.
- A feature never imports from another feature. Shared code moves up to
  `components/`, `hooks/`, or `lib/`, or to `packages/ui` if it has no
  product knowledge.
- The web app never imports `@workspace/db`. It reaches data only through
  the API client.

## packages/ui

```text
packages/ui/
└── src/
    ├── components/                shadcn/ui primitives, restyled      (exists)
    ├── blocks/                    OpenCadence components built from primitives
    │   ├── cadence-timeline/
    │   ├── tick-progress/
    │   └── health-strip/
    ├── hooks/                                                         (exists)
    ├── lib/                                                           (exists)
    └── styles/                    globals.css and design tokens       (exists)
```

`components/` is owned by the shadcn CLI. `blocks/` holds the signature
components from `DESIGN.md`. Nothing in this package knows about the API,
routes, or workspaces.

## Other packages

```text
packages/db/
├── src/
│   ├── schema/                    one file per domain, named like the modules
│   ├── client.ts
│   └── seed/                      development and test data
└── migrations/

packages/contracts/
└── src/                           one file per domain: schemas and inferred types

packages/api-client/
└── src/
    ├── generated/                 produced from the OpenAPI document, never edited
    └── index.ts

packages/email-renderer/
└── src/
    ├── merge-tags/
    ├── spintax/
    ├── render/                    template to HTML and plain text
    └── tracking/                  link rewriting and open pixel insertion

packages/i18n/
└── src/
    ├── locales/
    │   └── en/                    one file per domain namespace
    └── index.ts

packages/env/
└── src/                           server.ts, web.ts
```

## integrations

```text
integrations/core/
└── src/
    ├── adapter.ts                 the interface every integration implements
    ├── capabilities.ts            send, receive, webhooks, warm-up, limits
    ├── errors.ts                  shared error types (rate limit, auth, bounce)
    └── testing/                   contract tests every adapter must pass

integrations/resend/
├── src/
│   ├── index.ts                   exports the adapter
│   ├── send.ts
│   ├── webhooks.ts                signature check and event mapping
│   └── config.ts                  credential schema shown on the integrations page
└── test/
```

Every integration has this shape. An adapter declares its capabilities, so
the product knows a provider can send but not receive, or that a mailbox
supports reply detection and warm-up. An integration imports only
`integrations/core`. The API loads adapters in the `integrations` module and
uses them only from `dispatch`, `provider-events`, `inbox`, and `warmup`.

## Dependency direction

```text
apps/web  ──▶  packages/ui, api-client, contracts, i18n, env
apps/api  ──▶  packages/db, contracts, email-renderer, i18n, env
          ──▶  integrations/*
integrations/*  ──▶  integrations/core
packages/*  never import from apps/ or from integrations/
```

## Where does new code go?

| You are adding | Put it in |
| --- | --- |
| A new product area | `apps/api/src/modules/<name>` and `apps/web/features/<name>`, same name |
| A new page | `apps/web/app/...` for the route, the screen in the matching feature |
| A background job | `jobs/` inside the module that owns the data |
| A new email provider or mailbox type | a new package in `integrations/` |
| A generic UI primitive | `packages/ui/src/components` through the shadcn CLI |
| A product-specific reusable component | `packages/ui/src/blocks` if it has no data access, otherwise `apps/web/components` |
| A database table | `packages/db/src/schema/<domain>` plus a migration |
| A type both the API and web need | `packages/contracts` |
| User-facing text | `packages/i18n/src/locales/<locale>/<domain>` |
| A new environment variable | `packages/env` and `.env.example` |

## Open decisions

These choices are built into the layout above and should be confirmed before
the first code depends on them.

1. **Workers share the API codebase** through a second entrypoint, in place
   of a separate `apps/worker`.
2. **Integrations are a top-level workspace group**, in place of living under
   `packages/`.
3. **API modules are flat**, in place of being grouped into areas such as
   audience and sending.
4. **The workspace is part of every product URL** (`/[workspace]/campaigns`).
5. **A marketing site and a documentation site are not planned here.** If
   they are wanted later they become `apps/www` and `apps/docs`.
6. The contents of `packages/db` depend on the ORM, which is still undecided.
