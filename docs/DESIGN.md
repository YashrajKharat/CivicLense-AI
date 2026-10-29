# CivicLense — design system

## Two rules that fix most of it

**A 4px spacing grid.** Every margin and padding is one of `--s-1` … `--s-10`.
Hand-picked values are what made the earlier build feel loose in some places and
cramped in others — the fix is not "more space", it is *consistent* space.

**A 1.25 type ratio with fixed steps.** `--t-2xs` … `--t-3xl`. The previous scale used
overlapping `clamp()` ranges, so at some viewport widths a heading rendered nearly the
same size as the paragraph under it. Nothing sits between the steps now.

## Colour

Near-black surfaces for the landing and sidebar, a cool light grey for the app, one
orange accent reserved for actions and live data.

| Role | Token | Value |
|---|---|---|
| App background | `--bg` | `#F6F7F9` |
| Cards | `--surface` | `#FFFFFF` |
| Sidebar, hero | `--ink-900` | `#0E1014` |
| Primary text | `--text` | `#10131A` |
| **Accent** | `--accent` | `#F05A28` |
| Resolved | `--ok` | `#0F7A52` |
| In progress | `--info` | `#1B5FD4` |
| Overdue | `--warn` | `#A15C09` |
| Breached | `--danger` | `#B32D25` |

Status colours ship as a triple — text, background, border — so a badge never relies on
fill alone and stays legible for colour-blind readers.

## Depth

Four layered shadows rather than one blur. A card should read as *sitting on* the page,
not floating above it, so `--sh-1` is a 1px hairline shadow and only modals reach `--sh-4`.

## Type

- **Archivo 800 uppercase** — page titles only.
- **Inter** — section headings in sentence case, all body copy, buttons, tables.
- **JetBrains Mono** — references, coordinates, confidences, counts, timestamps.

Section headings moved from the condensed uppercase face to Inter. Reserving the loud
face for page titles is what keeps a dense dashboard calm.

## Components that removed the most noise

**`PageHead`** — every screen's title block, so no two pages start at a different height.

**`Segment`** — one visual group instead of a row of identical pill buttons. Filter bars
were the single worst offender for clutter.

**`Thumb`** — a photo or a labelled placeholder, never an empty grey box.

**`SkeletonRows` / `SkeletonStats`** — shaped placeholders instead of a spinner, so the
layout does not jump when data lands.

## Signature: the Responsibility Spine

City → Zone → Ward → Asset → Department → Agency → Contract. Rendered identically for
residents and administrators, so a resident sees exactly the accountability chain an
administrator sees. It carries the product's whole argument, so it gets the accent and
everything around it stays quiet.

## Rules the AI surfaces follow

1. Authenticity is a percentage plus a hedge, never REAL/FAKE.
2. Severity always shows its factor breakdown, not just a number.
3. No model output resolves a complaint. The resident does.
4. Anything probabilistic is monospaced, so it reads as a measurement not a claim.
