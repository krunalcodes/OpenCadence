---
name: OpenCadence
description: A calm, precise working interface for email, with evergreen and lime as its own colours and a cadence timeline as its signature.
colors:
  background: "#FBFCFA"
  panel: "#FFFFFF"
  sidebar: "#F4F6F2"
  hover: "#E9EDE6"
  border: "#E3E7E0"
  border-subtle: "#EEF1EB"
  ink: "#14201B"
  ink-secondary: "#56635C"
  ink-tertiary: "#85918A"
  brand: "#0F5C4D"
  brand-hover: "#0B4A3E"
  live: "#C8F169"
  live-ink: "#1F3B08"
  success: "#218358"
  success-surface: "#E6F6EB"
  warning: "#AB6400"
  warning-surface: "#FFF7C2"
  danger: "#CE2C31"
  danger-surface: "#FEEBEC"
  info: "#0D74CE"
  info-surface: "#E6F4FE"
  sent-surface: "#E7ECE4"
  warmup-surface: "#DCEFEA"
typography:
  page-title:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  section-title:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.005em"
  metric:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "18px"
  page: "28px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.panel}"
    rounded: "{rounded.md}"
    height: "32px"
    padding: "0 12px"
  button-primary-hover:
    backgroundColor: "{colors.brand-hover}"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "32px"
    padding: "0 12px"
  button-secondary-hover:
    backgroundColor: "{colors.sidebar}"
  nav-item:
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.md}"
    padding: "6px 8px"
  nav-item-active:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
  card:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.lg}"
  badge:
    rounded: "{rounded.sm}"
    height: "22px"
    padding: "0 8px"
  badge-live:
    backgroundColor: "{colors.live}"
    textColor: "{colors.live-ink}"
---

# Design System: OpenCadence

## Overview

OpenCadence looks like a modern, well-made SaaS product: light, quiet, dense
enough to work in all day, with familiar navigation and controls. It is built
from shadcn/ui components on Base UI primitives, restyled so it does not read
as a stock component-library dashboard.

Three things make it its own:

1. An evergreen and lime palette. Evergreen is the brand and the primary
   action. Lime means one thing only: this is sending right now.
2. The cadence timeline. Sends are shown on an hour-by-hour timeline with a
   marker for the current time, so the product's name is visible in how it
   presents work.
3. Small data marks in place of generic charts: tick progress for sends and
   limits, and 14-day health strips for mailboxes and providers.

Status: this direction was approved from a static mock of the Overview screen
(`apps/web/.impeccable/mocks/standard-v2.html`). It has not been built into
the app yet. Treat the tokens here as the starting point and refine them when
the first real screens are built.

The interface is light by default. People use it at a desk, in daylight, for
long sessions of reading tables and writing email. A dark theme is not
designed yet.

## Colors

### Primary

Evergreen (`brand`) is used for primary buttons, the active navigation icon,
the current-time marker, and filled progress. Use `brand-hover` for hover and
pressed states. It never fills large surfaces.

### Secondary

Lime (`live`) with its dark ink (`live-ink`) is reserved for things that are
sending at this moment: the Sending badge, live blocks on the cadence
timeline, and the brand mark. It is the brightest colour in the product and
must stay rare.

### Neutral

All neutrals carry a slight green tint so they sit with the brand: the page
is `background`, cards and inputs are `panel`, the sidebar is `sidebar`, and
borders are `border` and `border-subtle`. Text uses `ink`, `ink-secondary`,
and `ink-tertiary`. Do not introduce pure greys.

### Status

Status colours always appear as a pair, a tinted surface with a darker text
colour, and always with a text label: `success` for healthy and sent,
`warning` for scheduled and near a limit, `danger` for failing and paused,
`info` for neutral notices. Draft uses `border-subtle` with `ink-secondary`.

### Named Rules

- **Lime means live.** Never use lime for decoration, hover states, or
  emphasis.
- **Brand is not success.** Evergreen is an action colour. Healthy states use
  `success`, even though both are green.
- **Colour never carries meaning alone.** Every status has a label or icon.

## Typography

Inter is the only typeface. It is self-hosted as a variable font
(`apps/web/app/fonts/InterVariable.woff2`), loaded with `next/font/local` at
weights 100 to 900, with the `salt` feature enabled globally.

### Hierarchy

- `page-title`: one per screen.
- `section-title`: card and panel headings.
- `metric`: headline numbers in the stats row.
- `body`: default text, table cells, form values.
- `label`: table headers, secondary lines, badges, navigation group labels.

Weights in use are 400, 500, and 600. Do not go heavier.

### Named Rules

- **Numbers line up.** Any number in a table, stat, counter, or time uses
  tabular numerals.
- **No serif, no second sans.** Hierarchy comes from size, weight, and colour.
- **Monospace is for data only.** Use the system monospace stack for time
  axes, code, API keys, and DNS records. Never for labels or headings.
- **Sentence case everywhere.** No all-caps labels.

## Layout

- App shell: a fixed 244px sidebar on the left, a 52px sticky top bar, and a
  scrolling content area with 28px side padding and a 1240px maximum width.
- Sidebar order: workspace switcher, search (opens the command palette),
  then navigation grouped as Send, Audience, and Sending, with counts on the
  right of each item.
- Top bar: breadcrumb on the left; secondary action, primary action, and the
  user menu on the right. One primary action per screen.
- Content rhythm: 18px between cards, 16px inside cards, more space above a
  heading than below it.
- Tables are the default way to show collections. Cards are for grouping a
  section, never for wrapping each item in a list, and never nested.
- Desktop-first. Narrow and mobile layouts are not designed yet.

## Elevation & Depth

Depth is quiet. Cards, inputs, and secondary buttons use a hairline border
with one very small shadow (`0 1px 2px` at about 5% ink). Popovers, menus,
and dialogs use a larger soft shadow. The top bar is slightly translucent
with a light blur so content scrolls under it. There are no glows, no
coloured shadows, and no hard offset shadows.

## Shapes

- 6px (`sm`): badges, segmented control items, small chips.
- 8px (`md`): buttons, inputs, navigation items, timeline blocks.
- 12px (`lg`): cards and panels.
- Fully round is only for avatars and status dots.
- Icons are Lucide, 16px, 1.6px stroke, in the text colour.

## Components

Build with shadcn/ui components from `@workspace/ui`, on Base UI primitives.
Add components from `apps/web` with the shadcn CLI so they land in
`packages/ui`. Restyle them to these tokens; never ship the default theme.

### Choosing the right control

Prefer the richer control whenever it makes the task faster. These are rules,
not suggestions.

| Need | Use | Not |
| --- | --- | --- |
| Pick one from a list | Combobox with search | Plain select |
| Pick several | Multi-select combobox with chips | A list of checkboxes in a dropdown |
| Pick one of 2 to 4 short options | Segmented control | Select or radio list |
| Turn a setting on or off | Switch, saved immediately | Checkbox plus a Save button |
| Pick a date or range | Date picker with presets (Today, Last 7 days) | Three selects or free text |
| Pick a time or schedule | Time picker with timezone shown | Free text |
| Filter a table | Filter bar with removable chips | A hidden filter modal |
| Act on a row | Inline actions on hover, plus a row menu | Opening a detail page for every action |
| Act on many rows | Checkbox selection with a bulk action bar | One at a time |
| Jump anywhere | Command palette on Cmd/Ctrl+K | Navigation only |
| Edit a record | Side sheet that keeps the list visible | A modal or a full page change |
| Confirm a destructive action | Dialog that names the item | A generic "Are you sure?" |
| Confirm a reversible action | Toast with Undo | A confirmation dialog |
| Enter emails, tags, or domains | Token input that accepts paste | Comma-separated text field |
| Copy a key, DNS record, or ID | Read-only field with a copy button | Plain selectable text |
| Wait for content | Skeleton that matches the layout | A centred spinner |

A plain select is acceptable only for a short fixed list of five or fewer
options that will never grow. Lists that can grow (contacts, lists, segments,
mailboxes, providers, templates, timezones, countries) always use a combobox.

### Buttons

Primary is evergreen with white text. Secondary is white with a hairline
border. Both are 32px tall with 8px corners and medium-weight labels; the
small size is 28px. Labels name the action ("New campaign", "Fix DNS
record"). Icons sit to the left of the label.

### Badges

22px tall, 6px corners, a tinted surface, and a 6px dot before the label. The
Sending badge is lime and its dot pulses slowly; the pulse stops when the
user prefers reduced motion.

### Cards

White, 12px corners, hairline border, one small shadow. A card header holds a
title, an optional one-line description, and actions on the right, separated
from the body by a subtle border.

### Inputs

White, hairline border, 8px corners, 32px tall. Focus shows a 2px evergreen
ring with a 2px offset. Errors show the problem and how to fix it beneath the
field.

### Navigation

Sidebar items are 13px medium with a 16px icon. Hover uses `hover`. The
active item becomes a white pill with a hairline border and an evergreen
icon. Counts sit on the right in `ink-tertiary`. A red dot marks a section
that needs attention.

### Tables

Header row in `label` style on a faintly tinted background. Rows have a
primary line in medium weight and an optional secondary line in
`ink-tertiary`. Numbers are right-aligned with tabular numerals. Rows
highlight on hover. Text does not wrap in name columns; it truncates.

### Cadence timeline (signature)

An hour-by-hour view of sends. A labelled lane per type (Campaigns,
Sequences, Transactional, Warm-up), with each send drawn as a block whose
position and width match its real start and duration.

- Sending: lime block with a dark dot.
- Sent: `sent-surface` block.
- Scheduled: white block with a dashed border.
- Warm-up: `warmup-surface` block.
- The current time is an evergreen vertical line with a time label.

Use it wherever time is the point: the Overview, a campaign schedule, a
sequence's steps. A block and its row in a table are the same object, so
selecting one highlights the other.

### Tick progress

Progress for sends and daily limits is a row of thin vertical ticks, filled
from the left in evergreen (or `success` when complete), with the numbers
beside it. Use it in place of a plain progress bar for sending-related
progress.

### Health strip

Fourteen small vertical bars, one per day, coloured by that day's status
(healthy, warning, failing, no data). Shown beside every mailbox, provider,
and sending domain, always next to a status badge.

## Do's and Don'ts

### Do:

- Show which mailbox or provider every send goes through.
- Surface deliverability problems where the user is about to send, with a
  button that fixes them.
- Design the empty, loading, error, and no-permission states for every
  screen.
- Make frequent actions reachable from the keyboard.
- Label sample or demonstration data as sample data.
- Route every user-facing string through the i18n layer.

### Don't:

- Don't ship the default shadcn theme, the default neutral palette, or Geist.
- Don't use a plain select where a combobox belongs.
- Don't use lime for anything that is not sending right now.
- Don't use gradients on text, glass effects as decoration, or large coloured
  side borders on cards.
- Don't nest cards or build a page out of identical icon-plus-text cards.
- Don't add a small label above a heading. The heading stands on its own.
- Don't use modals for editing; use a side sheet.
- Don't use em dashes in any copy.
- Don't name or compare against other email products in any copy.
- Don't invent customers, testimonials, or statistics.
