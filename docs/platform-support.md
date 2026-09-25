# Platform support

Honest status, not aspiration. The owner develops on Linux (Omarchy/Hyprland) and
has no Mac, so anything below marked untested is genuinely untested — reports and
patches are welcome.

| Platform                      | Status                           | Notes                                                                                                     |
| ----------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Linux (Omarchy/Arch, Wayland) | **Tested daily**                 | Full path: dev, `npm run verify`, `scripts/deploy-local.sh`, systemd user service, Hermes Desktop plugin. |
| Windows 10/11                 | **Expected to work, unverified** | The Next.js app only. See below.                                                                          |
| macOS                         | **Untested**                     | No Mac available to the owner. Open for review; please open an issue with results.                        |

## What is portable

The application itself makes no POSIX-only assumptions: paths are built with
`node:path` and `os.homedir()`, and there are no hardcoded `/home/...` strings in
`src/`. These should run anywhere Node runs:

```sh
npm install
npm run dev        # http://127.0.0.1:3510
npm run verify     # prettier, eslint, tsc, vitest, build
npm run build && npm start
```

State is written under `~/.local/state/omarchy-command-center/…`. On Windows that
resolves inside the user profile (`%USERPROFILE%\.local\state\…`). It works, but
it is not where a Windows user would expect application state; moving it behind a
platform-aware helper is a reasonable first contribution.

## What is Linux-only

These are deployment and desktop-integration helpers, not the product:

- `scripts/deploy-local.sh` — bash, `rsync`, `flock`, `systemctl --user`. On Windows
  or macOS use `npm run build && npm start` instead, and supervise it however you
  normally would.
- `scripts/install-newsroom-control.py`, `scripts/newsroom-window.mjs` — Omarchy/Hyprland
  window control.
- `scripts/newsroom-x-collector.mjs` transport — assumes the local service and a
  Unix-style state directory.
- The Hermes Desktop plugin is installed by copying one file into
  `~/.hermes/desktop-plugins/hermes-newsroom/`. The equivalent Hermes directory on
  Windows and macOS has not been confirmed.

## Verifying on another machine

1. `npm install && npm run verify` — if the gate passes, the app builds and its
   tests pass on that platform.
2. `npm run dev`, open `/newsroom`, and confirm the feed renders. Without
   `config/newsroom.local.json` it uses the committed example config and fixture
   providers, so no credentials are needed to try it.
3. `npm run test:smoke` against a running server for a quick end-to-end check.

If something fails on Windows or macOS, the failing command and output are more
useful than a guess at the cause.
