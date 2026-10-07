"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { useNewsroom } from "../state/newsroom-store";
import { archiveRequest, readArchive } from "../archive/client";
import {
  MAX_ARCHIVE_BYTES,
  parseArchive,
  emptyArchive,
  type EditionDraft,
  type EditionReport,
} from "../archive/model";
import { readJSON } from "../state/storage";
import { sourceHref } from "../model/newspaper";
import type { Story } from "../model/story";
import styles from "./archive-controls.module.css";

export function SaveEdition({
  reports,
  period,
  notices = [],
  disabled = false,
  scopeExtra = "",
}: {
  reports: EditionReport[];
  period: "today" | "week";
  notices?: string[];
  disabled?: boolean;
  scopeExtra?: string;
}) {
  const { feed, filters, now, reloadArchive } = useNewsroom();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [savedId, setSavedId] = useState("");
  async function save() {
    setBusy(true);
    setMessage("");
    setSavedId("");
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const edition: EditionDraft = {
      period,
      date,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      mode: feed?.mode ?? "fixture",
      scope: [
        filters.q && `Search: ${filters.q}`,
        `Source: ${filters.source}`,
        `Type: ${filters.type}`,
        `Watchlist: ${filters.watch || "all"}`,
        scopeExtra,
      ]
        .filter(Boolean)
        .join(" · "),
      reports,
      notices: [
        ...notices,
        ...(feed?.providers ?? [])
          .filter((p) => p.state !== "ok")
          .map((p) => `${p.label}: ${p.state}. ${p.message ?? "No source response."}`),
      ],
    };
    try {
      const result = await archiveRequest({ action: "edition", edition });
      setSavedId(result.id);
      setMessage("Edition saved permanently.");
      await reloadArchive();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Edition could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={styles.save} data-archive-controls>
      <button type="button" disabled={disabled || busy || !reports.length} onClick={() => void save()}>
        {busy ? "Saving…" : "Save dated edition"}
      </button>
      <span role="status">{message}</span>
      {savedId && (
        <Link href={`/newsroom/archive?edition=${encodeURIComponent(savedId)}`}>Read saved edition</Link>
      )}
    </div>
  );
}

export function ArchiveControls() {
  const { archive, archiveError, archiveReady, archiveSaving, reloadArchive } = useNewsroom();
  const params = useSearchParams();
  const file = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [day, setDay] = useState("");
  const selectedId = params?.get("edition");
  const edition = archive.editions.find((e) => e.id === selectedId);
  const editions = [...archive.editions]
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    .filter(
      (e) =>
        (!day || e.date === day) &&
        `${e.date} ${e.scope} ${e.reports.map((r) => `${r.title} ${r.summary}`).join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    );
  async function task(run: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await run();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Archive operation failed.");
    } finally {
      setBusy(false);
    }
  }
  async function backup() {
    const data = await readArchive();
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `hermes-newsroom-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("Backup downloaded. It contains saved public stories and editions.");
  }
  async function restore(upload: File) {
    if (upload.size > MAX_ARCHIVE_BYTES) throw new Error("Backup is too large (25 MB maximum).");
    const data = parseArchive(JSON.parse(await upload.text()));
    await archiveRequest({ action: "import", backup: data });
    await reloadArchive();
    setMessage("Backup restored. Existing records were kept; missing records were added.");
  }
  async function importBrowser() {
    const old = readJSON<{ saved?: string[]; snapshots?: Record<string, Story> }>("newsroom:v1:overlays", {});
    const backup = emptyArchive();
    backup.records = (old.saved ?? []).flatMap((id) =>
      old.snapshots?.[id]
        ? [
            {
              story: old.snapshots[id],
              saved: true,
              updatedAt: new Date().toISOString(),
              mode: "mixed" as const,
            },
          ]
        : [],
    );
    if (!backup.records.length) {
      setMessage("No browser-only saved snapshots to import.");
      return;
    }
    await archiveRequest({ action: "import", backup: parseArchive(backup) });
    await reloadArchive();
    setMessage("Browser saves imported. Their original live/demo origin is unknown; they are marked mixed.");
  }
  return (
    <section className={styles.archive} aria-label="Permanent archive">
      <header>
        <h3>Permanent archive</h3>
        <p>
          Saved on this computer, outside browser storage. Public stories and editions only; personal work
          stays separate.
        </p>
      </header>
      <div className={styles.tools} data-archive-controls>
        <button
          type="button"
          disabled={busy || archiveSaving || !archiveReady}
          onClick={() => void task(backup)}
        >
          Export backup
        </button>
        <button type="button" disabled={busy || archiveSaving} onClick={() => file.current?.click()}>
          Restore backup
        </button>
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const upload = e.target.files?.[0];
            e.target.value = "";
            if (upload) void task(() => restore(upload));
          }}
        />
        <button
          type="button"
          disabled={busy || archiveSaving || !archiveReady}
          onClick={() => void task(importBrowser)}
        >
          Import browser saves
        </button>
        <button type="button" disabled={busy || archiveSaving} onClick={() => void reloadArchive()}>
          Reload archive
        </button>
      </div>
      {archiveError && <p role="alert">{archiveError}</p>}
      {!archiveReady && !archiveError && <p role="status">Loading permanent archive…</p>}
      <p role="status">{archiveSaving ? "Saving to this computer…" : message}</p>
      <h3>Dated editions · {archive.editions.length}</h3>
      <p>
        Each snapshot retains the reports, source links, filters and coverage notes from the moment you saved
        it. Restoring a backup adds missing records without overwriting current ones.
      </p>
      <div className={styles.tools} data-archive-controls>
        <label>
          Search saved editions
          <input value={query} onChange={(e) => setQuery(e.target.value)} type="search" />
        </label>
        <label>
          Edition date
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </label>
      </div>
      {archiveReady && !editions.length && (
        <p>No saved editions match. Open Editions and choose “Save dated edition”.</p>
      )}
      <ul className={styles.list}>
        {editions.map((e) => (
          <li key={e.id}>
            <Link
              aria-current={e.id === selectedId ? "page" : undefined}
              href={`/newsroom/archive?edition=${encodeURIComponent(e.id)}`}
            >
              {e.date} · {e.period === "week" ? "Weekly" : "Daily"} · {e.reports.length} reports
            </Link>
            <span>
              {e.mode === "fixture" ? "Demo" : e.mode === "mixed" ? "Mixed / origin unconfirmed" : "Live"} ·
              saved {new Date(e.savedAt).toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
      {selectedId && archiveReady && !edition && (
        <p role="alert">This edition was not found on this computer. Restore its backup to read it.</p>
      )}
      {edition && (
        <section className={styles.edition} aria-label="Saved edition">
          <header>
            <p>
              {edition.mode === "fixture"
                ? "Demo snapshot · fixture data"
                : edition.mode === "mixed"
                  ? "Mixed live and sample data"
                  : "Public news snapshot"}
            </p>
            <h3>
              {edition.date} · {edition.period === "week" ? "Weekly edition" : "Daily edition"}
            </h3>
            <p>
              {edition.timezone} · {edition.scope}
            </p>
            <p>Saved {new Date(edition.savedAt).toLocaleString()}. This snapshot does not refresh.</p>
          </header>
          {edition.notices.length > 0 && (
            <ul>
              {edition.notices.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
          {edition.reports.map((report, i) => (
            <article key={i}>
              <p className={styles.label}>
                {report.label} · <time dateTime={report.at}>{new Date(report.at).toLocaleString()}</time>
              </p>
              <h4>{report.title}</h4>
              <p>{report.summary}</p>
              <details>
                <summary>Details & sources · {report.sources.length}</summary>
                {report.sources.map((s, j) => (
                  <div key={j}>
                    {sourceHref(s.url) ? (
                      <a href={sourceHref(s.url)} target="_blank" rel="noreferrer">
                        {s.title}
                      </a>
                    ) : (
                      <span>{s.title} · link unavailable</span>
                    )}
                    <p>{s.summary}</p>
                  </div>
                ))}
              </details>
            </article>
          ))}
        </section>
      )}
    </section>
  );
}
