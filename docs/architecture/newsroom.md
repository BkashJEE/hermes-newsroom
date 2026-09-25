# Hermes Newsroom — architecture

> Current integration: see [Hermes control](../hermes-control.md) for the implemented live sources, agent requests and desktop controls.

The Hermes Newsroom is a top-level tab of the Command Center. It turns signals from communities, code hosts, research and official sources into ranked, evidence-scored intelligence, and tells you what to do about each story.

This document describes the first version: the **Front Page** is fully implemented on **synthetic fixture data**. The other seven sections are working previews built from the same feed (see [Section previews](#section-previews)). No live source is connected.

## Goals and non-goals

| Goals (v1)                                                           | Not in v1                                  |
| -------------------------------------------------------------------- | ------------------------------------------ |
| Front Page: lead story, flashcards, live list, decision rail         | Live Reddit / HN / X / Facebook / GitHub   |
| Search, source, time, type and sort filters that persist in the URL  | Server-side persistence of saved/dismissed |
| A provider boundary that live adapters can implement later           | Posting, replying or any outbound action   |
| Every failure state (loading, empty, error, partial, offline, stale) | Hermes Daily / Weekly Chronicle generation |

## Layers

```
┌──────────────────────── Browser ─────────────────────────┐
│ src/app/newsroom/…            routes (Front Page, sections)│
│ src/newsroom/components/…     presentation — only knows    │
│                               the normalized Story model   │
│ src/newsroom/state/…          client store: filters (URL), │
│                               saved / dismissed / tracked, │
│                               drawer + modal state         │
│ src/newsroom/model/…          pure functions: filter, sort,│
│                               search, derive widgets       │
└───────────────▲──────────────────────────────────────────┘
                │ GET /api/newsroom  (FeedResult JSON)
┌───────────────┴──────────── Server ──────────────────────┐
│ src/app/api/newsroom/route.ts  aggregates providers       │
│ src/newsroom/providers/        NewsProvider interface,    │
│                                aggregator, fixture provider│
│ src/newsroom/fixtures/         synthetic stories           │
│ config/newsroom.*.json         watchlists + ranking rules  │
└───────────────────────────────────────────────────────────┘
```

**Why a server route even for fixtures?** Future providers need credentials. Keeping every provider behind `/api/newsroom` (modules marked `server-only`) means secrets never enter the client bundle. The fixture provider already uses the same path, so switching to live data does not touch presentation code.

## Story model

`src/newsroom/model/story.ts` is the only shape presentation components see. Adapters translate provider responses into it; no component knows what a Reddit or GitHub payload looks like.

| Field                                | Meaning                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `id`                                 | Stable id, unique across providers (`<provider>:<native id>`)                                                       |
| `type`                               | `breaking · verified · developing · community · build · research · pain-point · opportunity · correction`           |
| `title`, `summary`                   | Headline and one- or two-sentence summary                                                                           |
| `source`, `sourceLabel`, `sourceUrl` | Source family (e.g. `reddit`), display label (e.g. a subreddit), original link                                      |
| `publishedAt`, `detectedAt`          | ISO timestamps: when the source published it, when we first saw it                                                  |
| `sourceCount`                        | Number of **independent** sources corroborating the story                                                           |
| `relevanceScore`                     | 0–100, how relevant the story is to Hermes work                                                                     |
| `evidenceScore`                      | 0–100, strength of the evidence                                                                                     |
| `momentum`                           | `{ score 0–100, direction rising/steady/falling, changePct }`                                                       |
| `actionability`                      | 0–100, how clearly there is something to do                                                                         |
| `topics`, `signals`                  | Topic tags; signal areas (`hermes · ai-models · community · security`)                                              |
| `status`                             | Editorial status: `confirmed · unconfirmed · disputed · corrected`                                                  |
| `recommendedAction`                  | `post · reply · test · build · track · ignore`                                                                      |
| `saved`, `dismissed`                 | Defaults from the provider; the client overlays the viewer's own choices                                            |
| `image`                              | Optional `{ src, alt }` supporting visual (local, openly licensed assets only)                                      |
| `file`                               | Intelligence file: full summary, why it matters, evidence, conflicting evidence, relevance explanation, next action |

## Provider boundary

`src/newsroom/providers/types.ts`

```ts
interface NewsProvider {
  id: string; // "fixture:social", later "reddit", "hackernews", …
  label: string;
  kind: "fixture" | "live";
  sources: SourceId[]; // source families it can return
  fetchStories(query: ProviderQuery, signal: AbortSignal): Promise<Story[]>;
}
```

`aggregateProviders()` runs every enabled provider with `Promise.allSettled` and a per-provider timeout, merges and de-duplicates by `id`, and returns a `FeedResult`:

```ts
interface FeedResult {
  stories: Story[];
  providers: ProviderStatus[]; // ok | error | timeout, with story count and message
  generatedAt: string;
  mode: "fixture" | "live" | "mixed";
  watchlists: Watchlist[];
}
```

**One failing provider never breaks the Newsroom.** A rejected or timed-out provider becomes an `error`/`timeout` status. The UI shows a partial-failure banner naming it, and renders every story that did arrive. Only when _all_ providers fail does the page show the provider-error state.

See [providers.md](../providers.md) for how to write an adapter.

## Filters and URL state

Filter state lives in the URL query string so views are shareable and survive reloads:

| Param        | Values                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------- |
| `q`          | free-text search over title, summary, topics, source label                                        |
| `source`     | `all · reddit · hackernews · x · facebook · github · official-blog · research · hermes-community` |
| `range`      | `live (15 min) · hour · today · 24h (default) · week · custom`                                    |
| `from`, `to` | ISO dates, only with `range=custom`                                                               |
| `type`       | `all` or any story type                                                                           |
| `sort`       | `relevance (default) · importance · rising · newest · evidence · actionable · least-covered`      |
| `watch`      | a watchlist id; keeps stories whose topics overlap the watchlist                                  |

Filtering, searching and sorting are pure functions in `src/newsroom/model/filters.ts`, unit-tested against the fixtures.

Sort definitions:

- **Most Important** — `0.45·relevance + 0.35·evidence + 0.20·momentum`
- **Fastest Rising** — momentum `changePct`, rising first
- **Least Covered** — fewest independent sources first, ties broken by relevance

## Front Page composition

All widgets derive from the _filtered_ story list (`src/newsroom/model/derive.ts`):

- **Lead Intelligence** — the most important `verified` story (falls back to the most important story).
- **Flashcards** — the top `developing`, `community` and `build` stories; an empty slot says so.
- **Live Intelligence** — the rest of the filtered feed as a table. Selecting a row opens its intelligence file.
- **What Should I Do?** — acts on the focused story (last opened, else the lead).
- **Signal Meter** — per signal area, average relevance weighted by momentum.
- **Trending Now** — top five topics by summed momentum, with distinct-source counts.
- **Content Opportunity** — the top `opportunity` story (else the highest-actionability story).
- **Breaking ticker** — `breaking` stories. It changes item every 8 s, pauses on hover/focus or via its button, and never auto-advances under `prefers-reduced-motion`.

## Section previews

Each non-Front-Page section already works from the current feed and local Desk data, and lists what its full version adds:

| Section           | Preview                                                                        |
| ----------------- | ------------------------------------------------------------------------------ |
| Live Wire         | Every story in the current filters, newest first                               |
| Hermes Daily      | Today's top-five brief via the Hermes bridge, with Copy                        |
| Weekly Chronicle  | Last seven days, grouped by story type, with weekly stats                      |
| Built With Hermes | New Build cards plus Hermes community stories                                  |
| Trend Radar       | Top ten topics with momentum bars, plus the Signal Meter                       |
| Content Desk      | The Desk queue (drafts, testing tasks, build ideas) and top actionable stories |
| Archive           | Saved stories, plus dismissed stories with Restore                             |

## Local actions (no outbound effects)

Every "What Should I Do?" action is local and visible. Nothing is posted or sent.

| Action | Effect                                                                  |
| ------ | ----------------------------------------------------------------------- |
| Post   | Opens an editable, prefilled post draft; "Save draft" stores it locally |
| Reply  | Opens an editable reply draft addressed to the story's source           |
| Test   | Adds a testing task to the Desk queue                                   |
| Build  | Saves a build idea to the Desk queue                                    |
| Track  | Toggles tracking; the story shows a Tracking badge                      |
| Ignore | Dismisses the story, with Undo                                          |

Saved, dismissed, tracked and Desk-queue items persist in `localStorage` for the current viewer, and every read/write is guarded. The Newsroom works without storage.

## Interface states

| State            | Trigger                                                            |
| ---------------- | ------------------------------------------------------------------ |
| Loading skeleton | first load, and while refreshing with no data                      |
| Empty feed       | providers succeeded but returned no stories                        |
| No results       | stories exist but none match the filters (with "Clear filters")    |
| Provider error   | every provider failed                                              |
| Partial failure  | at least one provider failed, others succeeded                     |
| Offline          | `navigator.onLine` is false or the request cannot reach the server |
| Stale data       | the feed is older than 15 minutes                                  |

In development, `?scenario=slow|empty|error|partial|stale|offline` on `/newsroom` forces each state. The server ignores it in production unless `NEWSROOM_ENABLE_SCENARIOS=1` is set.

## Fixture mode

The fixture providers return synthetic stories about fictional projects and people, with `example.com` links. A **Fixture data** badge in the command bar says so whenever any fixture provider supplied stories.

## Layout

Tuned for a 32-inch 2560×1440 display, and usable at 1920×1080:

| Width        | Left nav             | Centre   | Right rail            |
| ------------ | -------------------- | -------- | --------------------- |
| ≥ 1600 px    | 250 px, full labels  | flexible | 360 px                |
| 1200–1599 px | 72 px, icons only    | flexible | 320 px                |
| < 1200 px    | drawer (menu button) | full     | stacked below content |

The outer margin is 24 px and grid gaps are 16 px. Text never goes below 12 px.

## Private vs. open-source core

| Open-source core (this repo)                      | Private configuration (ignored)                                        |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| Interface, flashcards, widgets, story model       | `.env` — future provider credentials                                   |
| Search, filtering, ranking display                | `config/newsroom.local.json` — personal watchlists and ranking weights |
| Fixture provider, provider interfaces, aggregator | Account ids, content history, deployment secrets                       |
| Generic Hermes integration boundary               |                                                                        |

The core runs with none of the private pieces present.
