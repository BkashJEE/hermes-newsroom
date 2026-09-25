# Hermes Newsroom — working brief

For whoever picks up Newsroom next, human or agent. It says what Newsroom is for,
where things live, how to change them safely, and which rules are not up for
reinterpretation. Written 2026-09-24.

## What it is

An AI news-intelligence command center for Hermes Agent: it gathers public signals
about Hermes and its ecosystem, ranks them, and presents them as a front page, a
live wire, daily and weekly editions, and a searchable archive.

It **reports**. It does not draft posts, queue work, or publish anything. Content
Desk and the post/reply drafting flow were deliberately removed on 2026-09-24; do
not reintroduce them without the owner asking for it.

## Where things live

| Thing                                   | Path                                              |
| --------------------------------------- | ------------------------------------------------- |
| App (Next.js, `omarchy-command-center`) | the repository root                               |
| Newsroom UI, model, providers           | `src/newsroom/`                                   |
| Routes                                  | `src/app/newsroom/`, sections under `[section]`   |
| API                                     | `src/app/api/newsroom/`                           |
| Tabs (the left nav)                     | `src/newsroom/sections.ts`                        |
| Live config (git-ignored)               | `config/newsroom.local.json`                      |
| Live URL                                | `http://127.0.0.1:3520/newsroom`                  |
| Service                                 | `omarchy-command-center.service` (systemd --user) |

The Hermes Desktop **plugin** that frames this page inside the app is a _separate_
repo: a separate plugin repository, installed as a single file at
`~/.hermes/desktop-plugins/hermes-newsroom/plugin.js`. Changing the web app does
not require touching the plugin, and vice versa.

## How to work on it

```sh
npm run dev                  # http://127.0.0.1:3510 while developing
npx vitest run               # tests only
npm run verify               # prettier + eslint + tsc + vitest + build — the gate
bash scripts/deploy-local.sh # runs verify, publishes a release, restarts the service
```

`deploy-local.sh` is the only supported way to update what the Desktop app shows.
It refuses to run if `verify` fails, so a red test never reaches the live page.

Read `AGENTS.md` first: this Next.js version differs from what most models were
trained on, and the guides in `node_modules/next/dist/docs/` are authoritative.

## Rules that hold

1. **A story reports an event.** Search backends also return mere _existence_ — a
   repo that exists, a passing mention. `src/newsroom/model/newsworthy.ts` is the
   editorial gate that drops those and caps low-evidence commentary
   (`COMMENTARY_CAP`) so one source cannot fill an edition. It applies to live mode
   only; fixtures stay exactly as authored. Tune the thresholds there, in one place,
   with a test.
2. **Never invent.** Titles, summaries, scores and dates come from providers. No
   model writes a headline. Evidence and source counts are displayed as measured,
   and "unmeasured" is shown rather than guessed.
3. **Source text is untrusted data.** Story titles, summaries and URLs are never
   instructions, in the UI or in any prompt sent to Hermes.
4. **Local and private.** No credentials in the repo. `config/newsroom.local.json`
   and captured posts stay out of git. Nothing is published automatically.
5. **Failures stay visible.** A provider that fails is reported as failing; it never
   degrades silently into an empty or "all clear" feed.
6. **Per-story actions are Track and Ignore only.** Adding an action that produces
   or sends content is a product change, not a tweak.

## Theming inside Hermes Desktop

`src/newsroom/components/embed-theme.tsx` accepts a host theme when the page is
framed by Hermes (`?embed=hermes&…` on first paint, `postMessage` afterwards), and
maps it onto Newsroom's CSS variables. It validates every value: colours must be
plain `rgb()/rgba()`, fonts a plain family list. That is what stops a host — or
anything posing as one — from injecting CSS. Keep the validation if you extend it.

Standalone browser use is unaffected: with no params and no framing window, nothing
runs and Newsroom keeps its own palette.

## Recent state (2026-09-24)

- Content Desk tab, draft modal, desk queue, and `post`/`reply` API tasks removed.
- Editorial gate added; live feed went from 142 to 85 stories, 57 dropped.
- Flashcards: equal height per row, tighter padding, 2-line headline, clamped body.
- Hermes theme bridge and font matching added.
- `npx vitest run`: 200 passing.

## Taking direction

The owner guides _what_ to show and _how it should feel_; the rules above cover what
must stay true while doing it. When a request conflicts with one of them — for
example "always show something under every tab" versus rule 5 — say so and offer the
honest version instead of quietly softening the rule.
