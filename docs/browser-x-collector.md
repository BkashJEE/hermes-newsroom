# Browser X collection and Jev hunts

Collection is performed by a local Playwright script on the **`newsroom-x-collector.timer` systemd user timer**, every five minutes (wall-clock minutes 00, 05, 10, etc.; up to one second scheduling tolerance). The timer is installed **disabled** until the user explicitly approves enabling it. It does not depend on Codex, a Codex browser connection, or an already-open X tab. Each run opens headless Chromium with a dedicated persistent profile, navigates directly to the public search and closes Chromium afterward. There are no catch-up runs after downtime (`Persistent=false`). The user systemd manager must be running; this installation does not enable linger.

The old `collect-hermes-news-from-open-x-browser` Codex heartbeat is superseded. Pause it during cutover to avoid competing claims. Its previous loopback `EPERM` problem does not require changing Codex sandbox permissions: the local service uses the existing loopback transport directly. The installer never edits Codex settings or automations.

The search is `"Hermes Agent"`, Latest, from public search results. At most 20 rendered posts are collected per run, with up to two scrolls. This is a bounded sample, not complete coverage or X's trending ranking. Login challenges, limits and unavailable browser connections are reported rather than bypassed. Only a recognized public-search layout is read: posts need an outer author header, its timestamp link, visible text and no protected-account/ad marker. Quoted-only, media-only, hidden and unclear rows are skipped. No cookies, browser storage, network interception, private API calls, DMs, notification pages, history, private bookmarks or protected-account posts are collected. The worker never follows links or instructions found in post text, opens a post, or reads whole-page/sidebar text. Do not install an unrelated browser extension to access these records.

Chromium itself maintains its ordinary login session in the dedicated profile; the collector never reads, exports, copies, imports or logs cookies or storage. It does not reuse or inspect the user's everyday browser profile. Do not include the profile or real captured posts in commits, fixtures, logs or bug reports. Login mode is manual browser interaction only and performs no DOM extraction or Newsroom collection.

## Installation and sign-in

Requires the app's existing `playwright-core` dependency, Node on PATH for installation/manual commands, `/usr/bin/chromium` and `flock`. No new npm packages are needed. Playwright uses [a dedicated persistent browser context](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context); the profile is `~/.local/state/omarchy-command-center/browser-x-profile`, mode 0700, with a 0077 process umask. No debug port, trace, screenshot, video or network recording is enabled.

From the repository:

```bash
python3 scripts/install-newsroom-x-collector.py
bash ~/.local/share/omarchy-command-center/scripts/newsroom-x-browser.sh login
```

The installer validates and installs only the three collector runtime scripts and `newsroom-x-collector.service`/`.timer`, then reloads user units. It does not rebuild/restart the app, enable/start any timer, pause the old heartbeat, or change Codex permissions. It refuses to replace an active collector service/timer. Future app deployments already copy `scripts/`; rerun this installer when units or the Node installation path change. The service pins the Node executable found during installation.

In the dedicated browser window, sign in to X yourself (including any required challenges), then **close the entire window** to release the profile. The collector does not enter credentials or inspect the login page. A timer/manual run during login exits with a harmless profile-busy status and tries again at the next interval. `CHROMIUM_PATH` can select a different executable; the profile path deliberately cannot be redirected to an everyday profile.

Check one collection without enabling the timer:

```bash
bash ~/.local/share/omarchy-command-center/scripts/newsroom-x-browser.sh run
node ~/.local/share/omarchy-command-center/scripts/newsroom-x-collector.mjs status
```

Only after explicit user approval, pause the old Codex heartbeat using Codex's automation controls and enable the local timer:

```bash
systemctl --user enable --now newsroom-x-collector.timer
systemctl --user list-timers newsroom-x-collector.timer
```

The first scheduled run is at the next five-minute boundary. `systemctl --user start newsroom-x-collector.service` runs one pass immediately. `systemctl --user disable --now newsroom-x-collector.timer` stops future scheduling; stop the service separately if a pass is running. No automatic Jev/Hermes/provider call or publication is part of collection.

## Failures and session expiry

- Login redirects, visible login prompts, access challenges and rate limits complete the claimed job as **`unavailable`** and exit nonzero. Reopen `newsroom-x-browser.sh login`, sign in manually and close that browser. The next timer tick uses the renewed session; no reset, cookie copying or permission change is needed. A headless-only challenge also requires user intervention; there is no stealth or challenge bypass.
- Browser failures, search errors, unknown layouts and no eligible rows report **`failed`**. Only an explicit search “No results” state can complete an empty batch. A failed/unavailable run does not advance `lastCollectedAt`, delete saved posts or make old data appear freshly collected.
- The feed keeps the saved public X sample. The existing X collection panel shows `unavailable`/`failed`, the server's message and the last successful capture time. These collection failures do **not** currently become a provider-error banner in the raw feed: the provider can still read saved posts. Since `src/` is owned by the app agent, its old “accessible X tab”/“Open an accessible X browser tab” wording remains; interpret it as the dedicated profile needing sign-in. Use the journal for the specific local failure category.
- If the local app is unreachable, no failure can be delivered to its endpoint; systemd/journal records the error. A job claimed before a crash or lost completion expires after the existing ten-minute lease deadline, on the next server status read. If no job was claimed, the existing status and last-capture time remain unchanged. Claims/completions are never blindly retried.
- Runs have a two-minute internal deadline and a three-minute systemd ceiling. SIGTERM attempts to report failure and close the browser. The five-minute timer supplies the next attempt; there are no rapid retries or catch-up bursts. Disabled Newsroom collection and already-active claims are skipped before opening Chromium.

```bash
systemctl --user status newsroom-x-collector.service newsroom-x-collector.timer
journalctl --user -u newsroom-x-collector.service -n 40 --no-pager
node ~/.local/share/omarchy-command-center/scripts/newsroom-x-collector.mjs status
```

Journal output is limited to status, counts and fixed diagnostic categories; it never includes captured post text, browser error bodies or session data. The separate `browser-x-profile.lock` uses `flock` and is released automatically on exit. Do not delete Chromium profile locks while its browser is running.

## Local boundary and storage

`xBrowser.enabled` is false in the committed example and only enabled in ignored local configuration. `/api/newsroom/browser-x` checks the loopback host, Origin when present and the Newsroom header before status or mutation. The collector reads already-rendered public post text and canonical post URLs; it does not execute instructions found in posts. The import validator bounds text/batch size and rejects non-X/non-post URLs, query parameters, invalid dates and stale/future inputs. Imported posts remain untrusted evidence.

State lives in `~/.local/state/omarchy-command-center/browser-x/state.json`, directory mode 0700 and files 0600. Keep up to 300 deduplicated public posts from the last 30 days. Failed collection retains previous posts. Requests have a ten-minute deadline, a single collector claim and atomic writes. A process crash can leave `write.lock`; inspect running collector processes before removing that lock. Do not store real posts in fixtures, commits or PR descriptions.

The transport contract is unchanged. `node scripts/newsroom-x-collector.mjs status` reports metadata. `request` queues work; `claim` returns the active job ID and search URL (or creates/claims a new job for a scheduled capture). `complete JOB_ID` accepts a JSON array on stdin, each item `{url,text,publishedAt}`; `unavailable JOB_ID` and `failed JOB_ID` report unsuccessful collection. Transport is fixed to `http://127.0.0.1:3520/api/newsroom/browser-x`, with `x-newsroom-client: 1`, GET for status and POST JSON `{action,id,posts}` for mutations. HTTP redirects are rejected and requests time out after ten seconds. The worker shares this transport and submits only those three post fields, canonical `https://x.com/USERNAME/status/ID` URLs, at most 1200 text characters and ISO timestamps. A request button queues work for the next scheduled check.

Synthetic verification: `node --test scripts/check-newsroom-x-collector.mjs` runs extraction in Chromium and tests transport, limits and failure transitions without accessing X or changing saved app data. The existing `tests/newsroom/browser-x.test.ts` checks server validation, lease ownership and saved-post retention.

## Jev controls

The primary **Fetch news + run Jev** flow fetches GitHub/Hacker News directly and can include this saved X sample, clearly labelled as saved. **Fetch news · no Jev call** previews those real collection steps without model credits. Neither button starts an X browser worker.

- **Queue X refresh** queues only browser collection; it does not call Jev or lock the Jev controls. The queued/claimed/completed state is displayed separately. A scheduled check can be delayed while the computer/user manager is stopped or the profile is open for manual login.
- **Run Jev on fresh X** becomes available after a non-empty collection completes and classifies 1, 3 or 5 posts from that captured batch, in its capture order. It requires a capture completed within ten minutes. It does not wait on or silently launch collection. Use **Run live Jev** to classify the selected saved news without waiting for X. Explicit UI acknowledgement authorizes public input to Vercel/TypeSafe and Gateway usage for that run. At most ten attempted calls per rolling hour, no automatic retry. Turning the feature on is not an automatic paid run.
- **Test Jev** works independently of X collection and uses five fixed, labelled synthetic inputs. Labels are not sent to the model. Category test accuracy and relevance-label matches are computed against those labels, with evaluated/total coverage. It is a small smoke benchmark, not a production accuracy claim.
- For real news, accuracy starts unmeasured. Explicit category reviews supply the denominator for agreement with the user's labels, not independent ground truth. Correct predictions must also be reviewed to avoid a biased sample of mistakes. Review overrides are local to the current view/export.

The evaluator asks separate relevance and category questions in one request per story. A usable category plus Relevant probability of at least 0.75 routes to Keep; confident Not relevant routes to Exclude; missing/uncertain results go to Review. This threshold is heuristic. Result filters affect the hunt view; original source stories remain visible in the raw feed. Jev does not establish source credibility, factual truth, editorial quality or social virality.

The dashboard shows actual elapsed request time (including adapter overhead), mean and p95, plus browser collection duration excluding queue wait. Demo pacing never counts as model timing. Proof JSON includes inputs, outputs, review labels, metrics and timestamps. Exact provider charges are not returned. No paid provider call is required for synthetic integration tests.

The Newsroom adapter continues to validate, normalize and store captures. The local systemd/Playwright worker now owns scheduling and browser access; the app and Jev controls keep the same endpoints and behavior.
