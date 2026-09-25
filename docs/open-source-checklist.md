# Open-source release checklist

The project is developed privately. Work through this list before making any repository public. **Nothing here is automated. Changing visibility is a manual, owner-only decision.**

## 1. Secrets and private data

- [ ] `.env`, `.env.*` (except `.env.example`) and `config/*.local.json` are git-ignored and have **never** been committed. Check the full history with `git log --all --full-history -- .env config/`.
- [ ] Scan all history for secrets with a dedicated scanner (for example `gitleaks detect` or `trufflehog git file://.`), not just the current tree.
- [ ] `npm test` passes, including `tests/hygiene.test.ts`, which blocks absolute home paths, emails, key-shaped strings and `NEXT_PUBLIC_` secrets in shipped files.
- [ ] No personal account ids, handles, profile names, content history, production data or logs in fixtures, tests, docs or screenshots.
- [ ] `artifacts/` (screenshots, traces) is git-ignored. Any screenshot added to docs uses fixture data only.
- [ ] `.env.example` contains variable names with empty values only.

## 2. Items to sanitize or decide before release

- [ ] **Tab labels and descriptions** in `src/config/workspaces.ts` mirror a personal Omarchy bar setup (X-Studio, Agents Lab, OpenClaw, Switchboard…). Decide whether to keep them as an example layout or move them into a config file with a generic default.
- [ ] **"Hermes" naming.** "Hermes Agent" belongs to Nous Research. Confirm naming and any logo use is acceptable, and add a disclaimer that this is an independent project. The monogram in the UI is original, not the Hermes logo.
- [ ] **Fixture stories** are fictional, but some mention Hermes community activity. Re-read them for anything that could be mistaken for real news.
- [ ] **Font stack** references Google Sans Text if it is installed locally, but it is **not bundled**. Bundled fonts (Barlow, Barlow Condensed, JetBrains Mono via `@fontsource`) are SIL OFL 1.1.
- [ ] **Source badges** use plain letters (R, Y, X, f, GH), not third-party logos. Keep it that way, or follow each platform's brand guidelines.
- [ ] **Local tooling**: `.claude/` is git-ignored. Make sure no other editor or agent state is tracked.
- [ ] **Git author identity**: confirm the commit author name and email are what you want public.

## 3. License

No license has been added yet. Until one is, the code is "all rights reserved" even if the repository is public.

|               | MIT                                                | Apache-2.0                                                                                        |
| ------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Length        | Very short, easy to read                           | Longer, more formal                                                                               |
| Permissions   | Use, modify, distribute, sublicense, sell          | Same                                                                                              |
| Patent grant  | None explicit                                      | **Explicit patent license** from contributors, and it terminates for anyone who sues over patents |
| Notices       | Keep the copyright notice                          | Keep notices, **state significant changes**, keep a `NOTICE` file if one exists                   |
| Contributions | No built-in contribution terms                     | Section 5: contributions are licensed under Apache-2.0 by default                                 |
| Compatibility | Compatible with almost everything, including GPLv2 | Compatible with GPLv3, **not** GPLv2-only                                                         |
| Typical fit   | Small tools, maximum adoption                      | Projects expecting outside contributors or corporate users who care about patents                 |

Recommendation: **Apache-2.0** if you expect contributions or corporate users (the patent grant and contribution terms protect everyone). **MIT** if you want the simplest possible terms. Check the licenses of dependencies and anything copied in: current dependencies are MIT, ISC, Apache-2.0 or OFL, all compatible with either choice.

## 4. Community files (recommended, not yet created)

- [ ] `LICENSE`, once chosen
- [ ] `CONTRIBUTING.md`: setup, `npm run verify`, commit style, how to add a provider (link `docs/providers.md`)
- [ ] `SECURITY.md`: how to report vulnerabilities privately; the rule that credentials stay server-side
- [ ] `CODE_OF_CONDUCT.md`, for example Contributor Covenant 2.1
- [ ] Issue and pull-request templates

## 5. Final checks

- [ ] Fresh clone → `npm ci` → `npm run verify` passes with **no** `.env` and **no** local config.
- [ ] `npm run test:smoke` passes against `npm run build && npm start`.
- [ ] README states clearly what is implemented and what is fixture-only or not yet connected.
- [ ] Repository description, topics and social preview contain nothing private.
- [ ] [docs/platform-support.md](platform-support.md) still matches reality: which platforms
      were actually tested, and which remain open for review. Do not claim macOS or
      Windows support that nobody has verified.
