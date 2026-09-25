"use client";

import { useEffect, useState } from "react";
import type { Story } from "../model/story";
import type { WeeklyDigest } from "../model/weekly";
import { groupWeeklyEntries, weeklyPoints, type WeeklyEntry } from "../model/weekly-recap";
import { sourceHref } from "../model/newspaper";
import { useNewsroom } from "../state/newsroom-store";
import styles from "./community-builds.module.css";
import recap from "./weekly-chronicle.module.css";

export function WeeklyChronicleCards({ stories }: { stories: Story[] }) {
  const { feed, filters, now } = useNewsroom();
  const [data, setData] = useState<WeeklyDigest | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [desk, setDesk] = useState("all");
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    if (feed?.mode !== "live") return;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/newsroom/weekly", { signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Weekly discovery is unavailable.");
        if (!controller.signal.aborted) setData(result);
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Weekly discovery is unavailable.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [feed?.mode, revision]);

  const official = (url: string) => url.startsWith("https://github.com/NousResearch/hermes-agent/releases/");
  const entries: WeeklyEntry[] = stories.map((story) => ({
    id: story.id,
    title: story.title,
    summary: story.summary,
    url: story.sourceUrl,
    at: story.publishedAt,
    label: official(story.sourceUrl)
      ? story.releaseChannel === "prerelease"
        ? "Official prerelease"
        : "Official release"
      : "Hermes community report",
    desk: official(story.sourceUrl) ? "inside" : "community",
    released: official(story.sourceUrl) && story.releaseChannel !== "prerelease",
    topics: story.topics,
    source: story.source,
    type: story.type,
  }));
  for (const update of data?.updates ?? []) {
    const core = update.repo === "NousResearch/hermes-agent";
    entries.push({
      id: update.id,
      title: update.title,
      summary: update.summary,
      url: update.url,
      at: update.at,
      label:
        update.kind === "merged"
          ? "Merged into Hermes · not necessarily released"
          : update.kind === "prerelease"
            ? "Community prerelease"
            : "Community release",
      desk: core ? "inside" : "community",
      released: update.kind === "release",
      topics: ["Hermes Agent", "AI Agents", core ? "Nous Research" : "Community Builds"],
      source: "github",
      type: update.kind === "merged" ? "developing" : "build",
    });
  }
  for (const project of data?.projects ?? [])
    entries.push({
      id: `project:${project.id}`,
      title: project.name,
      summary: project.description,
      url: project.url,
      at: project.updatedAt,
      label: "Repository activity · shipping not confirmed",
      activity: true,
      desk: "community",
      released: false,
      topics: ["Hermes Agent", "AI Agents", "Community Builds"],
      source: "github",
      type: "build",
    });
  const terms = filters.q.toLowerCase().split(/\s+/).filter(Boolean);
  const watchlist = feed?.watchlists.find((w) => w.id === filters.watch);
  const matching = entries.filter((entry) => {
    const age = now.getTime() - Date.parse(entry.at);
    return (
      age >= 0 &&
      age <= 7 * 86400000 &&
      (filters.source === "all" || filters.source === entry.source) &&
      (filters.type === "all" || filters.type === entry.type) &&
      (!watchlist || entry.topics.some((topic) => watchlist.topics.includes(topic))) &&
      terms.every((term) =>
        `${entry.title} ${entry.summary} ${entry.topics.join(" ")}`.toLowerCase().includes(term),
      )
    );
  });
  const selected = groupWeeklyEntries(
    matching.filter(
      (entry) => desk === "all" || (desk === "released" ? entry.released : entry.desk === desk),
    ),
  );
  const desks = [
    {
      id: "shipped",
      title: "Shipped this week",
      note: "Published stable releases. One recap per project; review the linked changes before upgrading.",
      rows: selected.filter((e) => e.released),
    },
    {
      id: "inside",
      title: "Inside Hermes Agent",
      note: "Core changes and previews. Merged work may not be in a released version yet.",
      rows: selected.filter((e) => !e.released && e.desk === "inside"),
    },
    {
      id: "community",
      title: "Community builds & reports",
      note: "Hermes-related previews, demos and reports. Source claims have not been independently tested.",
      rows: selected.filter((e) => !e.released && e.desk === "community" && !e.activity),
    },
    {
      id: "activity",
      title: "Activity to watch",
      note: "Recent repository activity only. A push does not establish what shipped this week.",
      rows: selected.filter((e) => e.activity),
    },
  ];
  const renderCards = (rows: typeof selected) => (
    <div className={recap.grid}>
      {(showAll ? rows : rows.slice(0, 6)).map((entry) => (
        <article className={recap.card} key={entry.id} data-weekly-card>
          <p className={recap.label}>{entry.label}</p>
          <h4>
            <a href={sourceHref(entry.url)} target="_blank" rel="noreferrer">
              {entry.title}
            </a>
          </h4>
          <ul className={recap.points}>
            {weeklyPoints(entry.summary).map((point, i) => (
              <li key={i}>{point}</li>
            ))}
          </ul>
          <footer>
            <time dateTime={entry.at}>
              {new Date(entry.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </time>
            <span>
              {entry.sources.length} {entry.sources.length === 1 ? "update" : "updates"}
            </span>
          </footer>
          <details className={recap.details}>
            <summary>Details & sources</summary>
            {entry.sources.map((source) => (
              <div key={source.url}>
                <a href={sourceHref(source.url)} target="_blank" rel="noreferrer">
                  {source.title}
                </a>
                <ul>
                  {weeklyPoints(source.summary, 6, 220).map((point, i) => (
                    <li key={i}>{point}</li>
                  ))}
                </ul>
              </div>
            ))}
          </details>
        </article>
      ))}
    </div>
  );
  return (
    <section className={styles.section} aria-label="Hermes ecosystem this week">
      <header className={styles.header} data-section-toolbar>
        <div>
          <h3>Hermes ecosystem this week · {selected.filter((e) => !e.activity).length} recaps</h3>
          <p>What shipped, what changed inside Hermes, and what the community built.</p>
        </div>
        <label>
          Weekly desk
          <select
            value={desk}
            onChange={(event) => {
              setDesk(event.target.value);
              setShowAll(false);
            }}
          >
            <option value="all">Everything</option>
            <option value="released">Shipped releases</option>
            <option value="inside">Inside Hermes Agent</option>
            <option value="community">Community builds & reports</option>
          </select>
        </label>
        <button
          type="button"
          disabled={loading || feed?.mode !== "live"}
          onClick={() => setRevision((value) => value + 1)}
        >
          Refresh weekly updates
        </button>
      </header>
      <p className={recap.purpose}>
        Your seven-day catch-up on Hermes Agent. Start with shipped releases, review changes inside the agent,
        then explore community work. Cards use short source extracts; related releases are grouped.
      </p>
      {loading && <p role="status">Checking this week&#39;s Hermes updates…</p>}
      {error && <p role="alert">{error}</p>}
      <details className={recap.coverage}>
        <summary>Sources & coverage</summary>
        <p>
          Search, source and watchlist filters apply. Community projects claim a Hermes connection; their
          integrations are not tested here. X browser captures can appear as community reports; this GitHub
          catalog does not measure social trends. Reddit and Facebook are not connected.
        </p>
        {data && (
          <p>
            Checked {new Date(data.fetchedAt).toLocaleString()} · release histories for{" "}
            {data.checkedRepositories} of {data.projects.length} active community projects (up to eight,
            prioritizing Hermes-named projects, then stars) · up to 50 recently updated core pull requests ·
            cached for one hour.
          </p>
        )}
        <ul>
          {data?.notices.map((notice) => (
            <li key={notice}>{notice}</li>
          ))}
        </ul>
        <p>This is a sourced weekly sample, not every Hermes announcement.</p>
      </details>
      {desks.map((group) =>
        group.id === "activity"
          ? group.rows.length > 0 && (
              <details className={recap.activity} key={group.id}>
                <summary>
                  {group.title} · {group.rows.length} projects
                </summary>
                <p>{group.note}</p>
                {renderCards(group.rows)}
              </details>
            )
          : (desk === "all" || group.rows.length > 0) && (
              <section key={group.id} className={recap.desk} aria-label={group.title}>
                <h3>
                  {group.title} · {group.rows.length}
                </h3>
                <p>{group.note}</p>
                {group.rows.length ? (
                  renderCards(group.rows)
                ) : (
                  <p className={recap.empty}>
                    No sourced updates in this category for the selected week and filters.
                  </p>
                )}
              </section>
            ),
      )}
      {!loading && selected.length === 0 && <p>No Hermes updates match this week&#39;s filters.</p>}
      {desks.some((group) => group.rows.length > 6) && (
        <div className={styles.header}>
          <button type="button" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Show fewer" : `Show all ${selected.length} recaps & activity items`}
          </button>
        </div>
      )}
    </section>
  );
}
