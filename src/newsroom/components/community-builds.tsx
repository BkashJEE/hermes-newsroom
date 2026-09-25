"use client";
import { useEffect, useState } from "react";
import { Star, GitFork, ArrowUpRight, RefreshCw } from "lucide-react";
import { useNewsroom } from "../state/newsroom-store";
import type { BuildDiscovery } from "../model/community-build";
import { newspaperExcerpt } from "../model/newspaper";
import styles from "./community-builds.module.css";

export function CommunityBuilds() {
  const { filters, feed } = useNewsroom();
  const [data, setData] = useState<BuildDiscovery | null>(null);
  const [error, setError] = useState("");
  const [sort, setSort] = useState("stars");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (feed?.mode === "fixture") return;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/newsroom/builds", { signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Project discovery failed.");
        if (!controller.signal.aborted) setData(result);
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Project discovery failed.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [feed?.mode, revision]);
  const projects = (data?.projects ?? [])
    .filter((project) =>
      `${project.name} ${project.description} ${project.topics.join(" ")}`
        .toLowerCase()
        .includes(filters.q.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "updated"
        ? Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
        : sort === "forks"
          ? b.forks - a.forks
          : b.stars - a.stars,
    );
  return (
    <section className={styles.section} aria-label="Popular community projects">
      <header className={styles.header} data-section-toolbar>
        <div>
          <h3>Popular community projects · {projects.length}</h3>
          <p>GitHub popularity · public projects mentioning Hermes, active in the last 30 days.</p>
        </div>
        <label>
          Rank builds
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="stars">Most stars</option>
            <option value="forks">Most forks</option>
            <option value="updated">Recently updated</option>
          </select>
        </label>
        <button
          onClick={() => setRevision((n) => n + 1)}
          disabled={loading || feed?.mode === "fixture"}
          type="button"
        >
          <RefreshCw size={16} aria-hidden /> Refresh projects
        </button>
      </header>
      <p className={styles.coverage}>
        Stars and forks are lifetime totals, not viral growth. X, Reddit and Facebook engagement are not
        connected. Project descriptions are author claims; integrations have not been tested here. This
        discovery list uses a 30-day activity window; the header search filters it locally.
      </p>
      {loading && <p role="status">Finding community projects…</p>}
      {error && <p role="alert">{error}</p>}
      {data?.message && <p role="status">{data.message}</p>}
      {data?.incomplete && <p role="status">GitHub returned an incomplete result set.</p>}
      {feed?.mode === "fixture" && <p>Sample mode: live popularity discovery is not requested.</p>}
      {data?.fetchedAt && (
        <p className={styles.timestamp}>
          Popularity checked {new Date(data.fetchedAt).toLocaleString()} ·{" "}
          {data.state === "stale" ? "Cached results; refresh failed" : "Refreshes at most every 10 minutes"} ·
          up to 60 search candidates
        </p>
      )}
      <div className={styles.grid}>
        {projects.map((project, index) => (
          <article className={styles.card} key={project.id}>
            <div className={styles.cardTop}>
              <span>#{index + 1}</span>
              <span>Community project</span>
            </div>
            <h4>
              <a href={project.url} target="_blank" rel="noreferrer">
                {project.name}
              </a>
            </h4>
            <ul>
              <li>{newspaperExcerpt(project.description, 260) || "No project description supplied."}</li>
            </ul>
            <dl>
              <div>
                <dt>
                  <Star size={15} aria-hidden /> Stars
                </dt>
                <dd>{project.stars.toLocaleString()}</dd>
              </div>
              <div>
                <dt>
                  <GitFork size={15} aria-hidden /> Forks
                </dt>
                <dd>{project.forks.toLocaleString()}</dd>
              </div>
            </dl>
            <p className={styles.timestamp}>
              {project.language || "Language unreported"} · Updated{" "}
              {new Date(project.updatedAt).toLocaleDateString()}
            </p>
            <a className={styles.open} href={project.url} target="_blank" rel="noreferrer">
              Explore project <ArrowUpRight size={16} aria-hidden />
            </a>
          </article>
        ))}
      </div>
      {!loading && data && !projects.length && (
        <p>No matching projects returned. Try another search; no popularity data has been invented.</p>
      )}
    </section>
  );
}
