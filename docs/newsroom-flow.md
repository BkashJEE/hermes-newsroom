# How news reaches the screen

The open Newsroom checks its local API every 60 seconds while Live is enabled. Pausing stops this polling. This is not an independent background collector when the app is closed. Refresh requests can return a cached provider result.

| Source/view                  | Collection and cache                                                                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main feed: GitHub            | Up to 15 official Hermes Agent releases; five-minute cache                                                                                            |
| Main feed: Hacker News       | First 80 top-story IDs, filtered by AI-related title keywords; five-minute cache. It reads submission metadata, not full linked articles.             |
| Built With Hermes            | Public GitHub project discovery, up to 60 candidates active within 30 days; ten-minute cache                                                          |
| Weekly Chronicle             | Seven-day Hermes ecosystem sample, merged core PRs and sampled community releases; one-hour cache, fetched when requested                             |
| X (opt-in), Reddit, Facebook | X browser worker: five-minute checks, up to 20 rendered public posts per pass. Reddit/Facebook not connected; source selection filters stored stories |

The main feed retains a 30-day collection window; its default display filter is the last 24 hours. These collection limits can miss announcements. Cache durations are not guarantees of a periodic background fetch. X capture needs the opt-in browser worker described in [browser collection](browser-x-collector.md); a browser login alone is insufficient.

## Jev and Hermes have separate roles

1. Public provider adapters fetch and normalize stories.
2. Live Wire displays stories with source links and publication times.
3. The manual Jev Live Desk can classify a small selected batch as Release, Build, Research, Discussion, Incident or Other. It is off by default; the free demo is synthetic.
4. A person reviews uncertain classifications. Overrides remain separate from model results.
5. Hermes editorial controls can produce briefs from supplied evidence. Jev results do not yet automatically change newspaper selection.

The installed `jev-vercel` skill supplies the server-side evaluation helper; `hermes-newsroom` supplies Newsroom context and existing control commands. A separate opt-in Codex browser worker imports bounded public X search captures. The new Jev endpoint is not yet exposed as a Hermes Newsroom skill command. Jev is a classifier, not a news collector or a source of measured popularity.

## Existing projects worth learning from

- [Jev BANKING77 demo](https://github.com/adilmoujahid/jev-banking77-demo): streams actual classifications item by item, shows latency and evaluates labelled answers. Use this pattern for the live process and an independently labelled newsroom benchmark.
- [Jev Explained](https://github.com/davila7/jev-explained): lets readers inspect structured input, questions and returned decisions. Use this pattern for an expandable evidence view. Do not paste private provider credentials into somebody else's demo.
- [TypeSafe AI playground](https://github.com/BunsDev/typesafe-ai-playground): demonstrates classification, routing and comparisons, distinguishing mocked and live scenarios. A future newsroom comparison should use the same public examples for the existing rules and Jev.

These are design references, not measurements of this installation's performance. See [Jev Live Desk](jev-live-desk.md) for implemented behavior and limitations.

## Optional browser X capture and future API coverage

Use the official [recent-search API](https://docs.x.com/x-api/posts/search/introduction) for a bounded query around Hermes Agent and relevant project links. It searches the preceding seven days and needs a developer project/app and credentials. Check [current usage pricing](https://docs.x.com/x-api/getting-started/pricing) and obtain a spending limit before enabling collection.

Keep original post links, timestamps and available public engagement counts. Compare at least two timestamped snapshots before showing growth per hour. Rank within the collected sample and disclose the query, time window and coverage; do not label that sample as all-platform X trends. The hunt asks both Hermes relevance and story type to separate unrelated uses of “Hermes” and route actual releases/builds for review; its decisions filter the hunt view, not the raw feed.

Manually curated public links can be a lower-cost starting point, but do not establish exhaustive coverage or automatic trending. Private bookmarks are a separate, explicitly authorized data source.

## Demonstrating it to viewers

Record the input/source, queued → processing → result transitions, actual returned category/probabilities, elapsed request time and a human correction. Download the proof JSON and correlate live results with provider logs. Use public or synthetic examples only. Keep the demo label visible when using the free preview; it makes no Jev call. Do not claim model accuracy from a few examples, infer price from tokens without a rate, or show private work editions/credentials.
