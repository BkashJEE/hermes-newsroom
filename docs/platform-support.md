# Platform support

Honest status, not aspiration. The owner develops on Linux (Omarchy/Hyprland) and
has no Mac, so anything below marked untested is genuinely untested — reports and
patches are welcome.

| Platform                      | Status                            | Notes                                                                                                     |
| ----------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Linux (Omarchy/Arch, Wayland) | **Tested daily**                  | Full path: dev, `npm run verify`, `scripts/deploy-local.sh`, systemd user service, Hermes Desktop plugin. |
| Windows 10/11                 | **Paths handled, app unverified** | The Next.js app only; state goes to `%LOCALAPPDATA%`. See below.                                          |
| macOS                         | **Paths handled, app untested**   | State goes to Application Support. No Mac available to the owner; open for review.                        |

## What is portable

The application itself makes no POSIX-only assumptions: paths are built with
`node:path` and `os.homedir()`, and there are no hardcoded `/home/...` strings in
`src/`. A three-OS CI matrix runs the whole verification on Linux, macOS and
Windows, so this is checked rather than asserted. These run anywhere Node runs:

```sh
npm install
npm run dev        # http://127.0.0.1:3510
npm run verify     # prettier, eslint, tsc, vitest, build
npm run build && npm start
```

State goes where each platform expects it, resolved by
`src/newsroom/config/state-path.ts`:

| Platform | State directory                                              |
| -------- | ------------------------------------------------------------ |
| Linux    | `$XDG_STATE_HOME` or `~/.local/state/omarchy-command-center` |
| macOS    | `~/Library/Application Support/omarchy-command-center`       |
| Windows  | `%LOCALAPPDATA%\omarchy-command-center`                      |

## The one dependency that is not Node

**My Hermes Daily**, the personal work newspaper, reads local Hermes databases
through `scripts/collect-hermes-work.py`. That section — and only that section —
needs Python 3 on `PATH`. On Windows it also needs the timezone database, which
Python does not bundle there:

```sh
pip install tzdata
```

Without Python, every other section works and My Hermes Daily reports that it
cannot collect. Nothing else in Newsroom shells out.

Linux keeps its original path, so existing installs do not move. A relative
`XDG_STATE_HOME` is ignored rather than guessed at.

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
