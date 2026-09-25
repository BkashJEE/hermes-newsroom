# Contributing

Thanks for looking. This is a personal project shared in the hope it is useful,
so reviews may be slow and some requests will be declined on scope rather than
quality.

## Setup

Node.js 22 or newer.

```sh
npm install
npm run dev      # http://127.0.0.1:3510
```

No credentials or private config are needed. Without `config/newsroom.local.json`
the committed example config and fixture providers are used, so the app runs
fully offline.

## Before you open a pull request

```sh
npm run verify   # prettier, eslint, tsc, vitest, build
```

That is the whole gate. It must pass. Keep changes focused, and add tests next to
the behaviour you change: a test that fails before your fix and passes after is
worth more than a description of it.

## What will be declined

These are product decisions, not oversights. Please open an issue first if you
want to change one.

1. **Anything that drafts or publishes content.** The Newsroom reports. Post and
   reply drafting existed once and was deliberately removed.
2. **Anything that invents.** Titles, summaries, scores and dates come from
   providers. No model writes a headline, and "unmeasured" is shown rather than
   guessed at.
3. **Silent failure.** A provider that fails is reported as failing. It must
   never degrade into an empty page that reads as "nothing happened".
4. **Treating source text as instructions.** Story text is data, in the UI and in
   any prompt.
5. **Scraping beyond public, personal scale.** See `SECURITY.md`.

## Adding a news provider

Providers live in `src/newsroom/providers/`; see `docs/providers.md` for the
interface and `bluesky.ts` for a short example. A provider maps an API response
to the `Story` model and reports its own failures. Prefer sources that are free
and permitted to query.

Every story then passes the editorial gate in `src/newsroom/model/newsworthy.ts`,
which keeps reported events and drops mere existence. If your source needs a
different rule, add it there with tests rather than working around the gate.

## Platforms

Developed on Linux. Windows is expected to work but unverified, and macOS is
untested — see `docs/platform-support.md`. Reports from either are welcome, and a
failing command with its output is more useful than a guess at the cause.

## Commits

Explain why in the message, not just what. The diff already says what changed.
