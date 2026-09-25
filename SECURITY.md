# Security

## Reporting a vulnerability

Please report privately, not as a public issue: open a
[GitHub security advisory](https://github.com/BkashJEE/hermes-newsroom/security/advisories/new)
for this repository.

Include what you did, what happened, and what you expected. A proof of concept
helps. This is a personal project, so expect a reply in days rather than hours.
Please give a reasonable window to fix before disclosing publicly.

## What this project does with your data

It runs locally. There is no server, no account, and no telemetry.

- **Credentials never reach the browser.** Any provider keys stay in server-side
  environment variables listed in `.env.example`. The committed example has empty
  values, and `config/*.local.json` and `.env*` are git-ignored and have never
  been committed.
- **State is local**: aggregated stories, saved editions and work records live
  under `~/.local/state/omarchy-command-center/`.
- **Source text is untrusted data.** Story titles, summaries and URLs are treated
  as content, never as instructions, in the UI and in anything sent to a model.
- **Nothing is published automatically.** The Newsroom reports; it does not post.

## Embedding

When framed inside Hermes Desktop, the page accepts a host theme over query
parameters and `postMessage`. Every value is validated before it reaches the DOM:
colours must be plain `rgb()`/`rgba()`, fonts a plain family list. A host, or
anything posing as one, cannot inject CSS through it. Keep that validation if you
extend the bridge.

## Optional X collection, and its limits

The repository includes an optional collector that reads **public** X search
results from a browser profile you sign into yourself. It is **disabled by
default**, requires explicit opt-in, and its timer is not installed unless you
install it.

Automated collection is contrary to X's Terms of Service even from your own
session, and the risk is to your account. It is provided for personal-scale
reading of public results. Do not use it to build a dataset, resell content, or
collect anything non-public. Nothing in this project collects direct messages,
notifications, bookmarks, cookies or browser storage, and it never signs in for
you.

If you would rather avoid that entirely, disable it and use the Bluesky, Reddit,
GitHub and Hacker News providers, which are free and permitted.
