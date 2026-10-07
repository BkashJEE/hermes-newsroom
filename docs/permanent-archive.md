# Permanent archive and dated public editions

Bookmarks now write to the local Newsroom service before showing a successful save. Clearing browser storage does not remove them. Open **Archive** to read saved stories across all retained dates, reload changes made in another browser, or make a JSON backup. The source service must be running to read the archive; upstream news providers do not need to work. Agent controls `hermes-newsroom archive` and `save`/`unsave` use the same permanent API, without a desktop-browser connection. Reload an already-open Archive after an agent changes a bookmark.

**Editions → Today / This week → Save dated edition** saves a new immutable snapshot. It captures the selected report text, original source links, active filters, local edition date, time zone, live/demo mode and coverage notices. Weekly snapshots include grouped GitHub sources and all matching recaps, even rows behind “Show all”. Each save makes a separate edition; it never replaces a previous one. Archived editions have their own search and date controls and a bookmarkable `?edition=` URL. Those links work on this installation, or on another installation after restoring its backup. Saving is explicit, not scheduled. It does not generate an AI brief or access My Hermes Daily.

## Location and recovery

The versioned `archive.json` is outside the checkout and deployment releases:

- Linux: `$XDG_STATE_HOME/omarchy-command-center/newsroom-archive/` (default `~/.local/state/omarchy-command-center/newsroom-archive/`).
- macOS: `~/Library/Application Support/omarchy-command-center/newsroom-archive/`.
- Windows: `%LOCALAPPDATA%\omarchy-command-center\newsroom-archive\`.

This is an atomic JSON file store, with no database service or new runtime dependency. Writes acquire an exclusive lock, validate the entire next state, sync a temporary file, then rename it into place. Separate app processes serialize writes. Unix directory/file modes are 0700/0600; Windows uses the user's filesystem permissions. Concurrent browser actions use last completed save/removal; use Reload archive to see another browser's changes.

A missing file is a new empty archive. An invalid or unreadable file is an error, never an invitation to overwrite it. After a process is killed during a write, stop all Newsroom processes before removing a leftover `archive.lock` from this directory. Retain `archive.json` and any temporary files for recovery. For corrupt data, stop Newsroom, copy the whole directory somewhere safe, move the corrupt file aside, restart and restore a known-good exported backup. Do not delete the only copy of your history.

## Backup, restore and browser migration

- **Export backup** downloads a version 1 JSON backup containing public bookmarks, removal records and dated editions. Store another copy somewhere you control; one local disk is not a backup.
- **Restore backup** validates the complete file before making any change. It adds missing story and edition IDs; existing local records win, including removals. Re-importing the same backup does not duplicate it or resurrect a removed bookmark.
- **Import browser saves** copies older browser-only saved snapshots into the permanent store. Existing permanent records win. Old browser saves did not retain reliable origin metadata, so imports are labelled mixed / origin unconfirmed. This is explicit; unrelated browser state and private work are not imported.
- Dismissed stories, tracking flags and other reading preferences remain browser-local. The permanent store covers explicit bookmarks and dated public editions. Remote images are omitted from saved snapshots; text, evidence and source links are retained.

The archive has a 25 MB serialized limit, 10,000 story records and 2,000 editions. Nothing is silently pruned. Export before reaching these limits. There is no automatic retention policy, device sync, full-feed historical collection or background edition scheduler in this version.

The API only accepts localhost/127.0.0.1 on the existing ports 3510/3520, requires the Newsroom client header, rejects foreign origins, disables response caching and bounds request bodies. Imported URLs must be HTTP(S), without embedded credentials. Backups are data, never executable HTML. The personal daily storage remains separate.

## Browser verification

On Linux, start a demo server with a fresh isolated state directory: `XDG_STATE_HOME="$(mktemp -d)" npm run dev`. In another terminal run `NEWSROOM_ARCHIVE_SMOKE=1 CHROMIUM_PATH=/path/to/chromium node scripts/archive-smoke.mjs`. Do not run this against your regular Newsroom data; it creates demo bookmarks and editions. The script refuses a nonempty archive and checks browser reset, daily/weekly saves, backup re-import, invalid files, provider failure and mobile layout. Unit tests use temporary directories on every CI platform.
