# Newsroom providers

The live adapters fetch **Hacker News AI discussions** through the public Firebase
HN API and **official Hermes Agent GitHub releases** through GitHub's public API.
Set `liveSources: true` in ignored `config/newsroom.local.json`. Neither current
adapter requires credentials. The default remains labelled synthetic fixtures.

| Provider                              | Status                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------- |
| Fixture providers (3 groups)          | Implemented, synthetic development data                                               |
| Hacker News                           | Implemented, AI discussions; not a complete HN crawl                                  |
| GitHub                                | Implemented, official Hermes Agent releases; not arbitrary repositories or advisories |
| Reddit                                | Not implemented                                                                       |
| X                                     | Optional public browser search capture; requires local opt-in and scheduled worker    |
| Facebook                              | Not implemented                                                                       |
| RSS / official blogs / research feeds | Not implemented                                                                       |
| Other Hermes community sources        | Not implemented beyond the sources above                                              |

Adapters implement `NewsProvider` in `src/newsroom/providers/types.ts` and are
registered in `registry.ts`. The aggregator isolates provider failures, limits
request time, deduplicates by story ID and preserves healthy sources. Raw provider
responses and credentials stay server-side. Source URLs remain available in the
Intelligence File. Scores are heuristics, not proof of independent corroboration;
HN popularity and a release announcement do not establish verified claims.

## Hermes connection

Next loads the ignored `.env`. `HERMES_API_URL` overrides the discovered gateway
base URL; `HERMES_API_KEY` overrides its key. Each absent value falls back
independently to `$HOME/.hermes/gateway_state.json` and `API_SERVER_KEY` in
`$HOME/.hermes/.env`. The override URL must be an HTTP loopback base URL using
`127.0.0.1` or `localhost`, with an explicit port and no `/v1` suffix. Credentials
are server-only and never use `NEXT_PUBLIC_`. Local deployment copies `.env` into
the private release with mode 0600. Restart/redeploy after changing settings.

## Prompt injection and tool isolation

Live titles, summaries and URLs are **untrusted input**. Personal conversation
records and saved drafts are also untrusted evidence. The editorial system prompt
tells Hermes to use only supplied evidence, ignore embedded instructions, avoid
tools and publishing, and distinguish reported claims from verified facts.

Requests additionally send `tools: []` and `tool_choice: "none"`, the standard
request-level controls used by compatible endpoints. **The installed Hermes
`/v1/chat/completions` gateway does not enforce these fields.** Source inspection
found them in the idempotency fingerprint only. Its OpenAI route passes text,
history and model overrides into `_run_agent`; agent construction obtains tools
from the gateway's `api_server` platform configuration, not these request fields.
Sending the fields therefore does not disable tools on this installation.

This remains an unresolved isolation limit, not a completed prompt-injection fix.
The system prompt is guidance, not a sandbox. Before treating untrusted-feed or
personal-record generation as tool-isolated, use an independently configured
no-tools gateway/profile or add upstream request-level enforcement and verify it
end-to-end. Do not disable tools globally on a shared gateway just for Newsroom.
No hostile live prompt or tool-execution probe was run against the user's gateway.
The request test verifies what Newsroom sends, not gateway enforcement.

## Validation and extensions

`npm test` covers synthetic provider responses and failures, request boundaries,
private-data opt-out and output hygiene. The browser smoke suite reads current
story titles from the UI; it works with either live feeds or fixtures. Development
scenarios are only honored in development or with `NEWSROOM_ENABLE_SCENARIOS=1`.
Production smoke verifies that scenarios are ignored when that opt-in is absent.

To add a source: implement the provider contract, normalize dates/scores and IDs,
honor cancellation, keep secrets/errors server-side, and add sanitized success and
failure tests. Update this status table. Cross-source clustering and independent
corroboration require explicit future work; do not raise source counts merely
because the same item appears twice.

See [Hermes controls](hermes-control.md) and [Personal Daily](personal-daily.md).

## Community project discovery

Built With Hermes now queries the public GitHub repository search API separately from the news feed. It searches Hermes Agent descriptions/topics, excludes forks, archived/private repositories, the upstream agent and obvious awesome lists, and considers up to 60 candidates active within 30 days. Results are cached for ten minutes; failures show an error or an explicitly stale snapshot. No GitHub token or private repository access is used.

The default order is **lifetime GitHub stars**, with forks and last-push sorting available. These counts measure repository popularity, not recent growth or social virality. A project mentioning or tagging Hermes is an author claim, not a verified working integration. Optional public X browser captures enter the main feed; this project catalog does not measure X engagement. Reddit/Facebook are not ingested. Official Hermes releases remain a separate section. Header search filters project descriptions locally; the discovery list has its own fixed 30-day activity window rather than the news feed's publication-time filter.

Reference: [GitHub repository search API](https://docs.github.com/en/rest/search/search#search-repositories).

## Weekly Hermes ecosystem

Weekly Chronicle excludes generic AI feed stories. `/api/newsroom/weekly` adds public GitHub evidence: up to 50 recently updated closed pull requests from NousResearch/hermes-agent, filtered by merged date within seven days; and up to five releases from each of eight active community repositories. The repository sample prioritizes Hermes-named projects, then stars. Broader integration repositories must mention Hermes in the fetched release excerpt to qualify for the weekly release cards.

Drafts, future dates and older events are excluded. Prereleases, published stable releases, merged code and recent repository pushes are labelled separately. A push does not prove a shipment, and a merge need not be included in a release. The UI shows sampling limits, failures and source links. No GitHub credentials are used; cache results for one hour and bound the release requests to eight to limit unauthenticated API traffic. These are not exhaustive records of community announcements.

## Optional browser X capture

The local opt-in browser collector imports bounded public Hermes Agent search results into the main feed, with original URLs and publication/capture timestamps. It requires an accessible open X tab and the scheduled Codex worker; it does not use paid X API access. It is a sample, not all-platform trends. See [browser collection and Jev hunts](browser-x-collector.md).
