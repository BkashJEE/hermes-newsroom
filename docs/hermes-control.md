# Hermes-controlled Newsroom

The eight Newsroom routes share a persistent header, feed filters, story actions,
Content Desk and Archive. The Hermes Agent panel on every route submits an explicit
request to the default local Hermes gateway. Post/reply editors also offer **Write
with Hermes**; the Daily dialog offers **Write daily with Hermes**. Local summaries
remain available without an agent connection. Nothing is automatically published.

The server discovers the loopback gateway from the user's Hermes gateway state and
reads its API key server-side. Neither credentials nor arbitrary gateway URLs are
accepted from the browser. Requests require a custom header and same-origin checks,
validate tasks and story IDs, use server-loaded evidence, reject overlapping runs,
and time out after three minutes. Errors do not contain upstream response bodies.
The gateway retains its configured tool permissions; the editorial system prompt
asks it not to use tools. This is not a separate tool sandbox.

## Desktop control and repository discovery

Deployment installs `hermes-newsroom` in the local bin directory, writes a private
installation record under `~/.local/state/omarchy-command-center/installation.json`,
and installs the `hermes-newsroom` skill into existing Hermes profiles. The record
contains the actual source path, runtime, service, URL and workspace; no private
paths are committed. See `skills/hermes-newsroom/SKILL.md` for commands.

Controls operate the existing desktop browser's storage and reuse its window.
Saved/dismissed/desk stories retain snapshots so they remain available when a
source changes. Agent responses are stored per section in that browser. Desktop
storage is not synchronized to other browser profiles.

## Sources

Set `liveSources: true` in ignored `config/newsroom.local.json` to use public sources
without credentials. The committed default remains deterministic fixture mode for
development. Live mode contains no fixture fallback, even when sources fail.

- [Official Hacker News API](https://github.com/HackerNews/API): AI-related titles
  from the current top 80 submissions; metadata and discussion links, not article full text.
- [GitHub releases API](https://docs.github.com/en/rest/releases/releases#list-releases):
  official NousResearch/hermes-agent releases within the feed's 30-day window.

Results are cached for five minutes. Rankings are heuristics. Source count is one,
verification is unconfirmed, and momentum is not measured. Optional X browser collection is available; Reddit and Facebook are not connected. Trend Radar currently counts topic appearances, not historical
velocity. Weekly Chronicle groups the rolling week's currently available stories;
it is not a complete historical ingestion archive.

The Omarchy Hermes Island bridge also resolves a Newsroom mention from the local
installation record and attaches the source path and control command to the next
user prompt. This works even when the current browser has no repository context.
That optional desktop integration lives with the user's Omarchy plugin, not in
Hermes core.
