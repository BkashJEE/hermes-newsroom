# Personal Hermes Daily

The personal newspaper is **disabled by default**. The example configuration sets
`personalDaily.enabled` to `false`. Only the ignored `config/newsroom.local.json`
can enable it. Disabled installations hide the navigation entry and reject API
reads and generation before opening any Hermes database.

Merge this into local configuration to opt in:

```json
{
  "personalDaily": {
    "enabled": true,
    "title": "My Hermes Daily",
    "timezone": "UTC"
  }
}
```

Use your IANA timezone. A day is midnight to midnight in that timezone, including
daylight-saving changes. Visit `/newsroom/personal-daily`, select the date, and
choose **Generate my newspaper**. The existing Hermes Daily section covers public
news; this separate newspaper covers your own work. Nothing is published.

## Data flow and storage

- The collector reads the default Hermes profile and non-hidden local profiles
  under `$HOME/.hermes/profiles/`, using SQLite read-only connections.
- Only user/assistant messages within the selected day are queried. Hidden sessions,
  inactive messages, tool outputs, system prompts and reasoning are excluded.
  Each record contains its title, profile, session ID, dated message count, first
  user request (up to 1,000 characters), and latest assistant response (up to 2,400).
  Common credential patterns are redacted; this is not a guarantee that every
  sensitive phrase can be recognized. Review the displayed evidence before generating.
- Opening the page reads local records without calling a model. **Generating sends
  these excerpts to the local Hermes gateway, which may call a cloud model through
  your configured provider.** The same notice appears above the page controls.
- The collector communicates through process stdout; it never writes records into
  the repository. If capturing diagnostic output, put it under
  `$HOME/.local/state/omarchy-command-center/` with owner-only permissions.
- Generated editions include their evidence snapshot and live under
  `$HOME/.local/state/omarchy-command-center/personal-daily/`. Directories use mode
  0700 and files 0600. Each generation creates a new edition using an atomic rename;
  previous editions survive restarts, deploys and regeneration.
- Personal API requests require a loopback Host and the Newsroom client header;
  cross-origin requests are rejected and responses use `Cache-Control: no-store`.
  This protects the browser boundary, not against other programs running as your user.
  Conversation excerpts are never added to the public feed or browser localStorage.

The installed gateway currently ignores request-level tool-disabling fields.
See [provider tool-isolation limits](providers.md#prompt-injection-and-tool-isolation)
before treating personal generation as tool-isolated.

## Evidence limits

The newspaper summarizes recorded conversations; assistant claims are reported
outcomes, not independently verified tests, commits or completed projects. Every
bullet must cite a supplied source ID or generation fails without replacing saved
editions. Click a reference to expand its source record.

Coverage reports missing/unreadable profiles and dates with no activity. At most
40 latest sessions per profile are included, with omitted counts shown. Long
conversations are excerpted. Generation refuses evidence over 180,000 characters
instead of silently dropping more profiles. The day’s sessions are not a complete
audit trail of all filesystem or external actions. No automatic schedule is installed.

Tests use synthetic records only. Run `npm test` (including repository hygiene)
and inspect the staged diff before committing. Never commit local configuration,
real excerpts, private screenshots, collector output or saved editions.

## Agent controls

- `hermes-newsroom open personal`
- `hermes-newsroom personal [YYYY-MM-DD]`
- `hermes-newsroom personal-generate YYYY-MM-DD`

The installed skill tells Command Center where the source and private archive live.
Do not recursively invoke generation from inside a Newsroom editorial request.

## Four-page reading edition

The reader now renders four numbered sheets: Your Morning; Your Agents at Work; Intelligence & Opportunity; and Life & the Long View. Existing editions are reflowed in memory using their section titles, without rewriting saved files. New generation asks for explicit page assignments. Unsupported sections show missing-evidence notes; calendar, weather, inbox and personal-life connectors are not supplied by this feature. Notebook prompts are labelled as questions, not reported activity.

Print / Save PDF prints exactly the four reading sheets using A4 portrait layout. Reading excerpts are bounded, with additional points retained in the expandable full saved edition. The raw record list and full edition are omitted from print, while source IDs remain on each paper page. Before generation, four preview pages explain what evidence is missing; they are not an agent-written edition. PDF pagination is tested using synthetic records only.
