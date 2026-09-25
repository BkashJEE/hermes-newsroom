"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FileText, FlaskConical, Menu, Newspaper, Pause, Play, RefreshCw, Search } from "lucide-react";
import { useNewsroom } from "../state/newsroom-store";
import { SOURCE_OPTIONS, TIME_RANGES, TIME_RANGE_LABELS, type TimeRange } from "../model/filters";
import type { SourceId } from "../model/story";
import { sourceNotConnected } from "../model/source-availability";
import { SECTION_TIME_LABELS } from "../model/section-scope";
import styles from "./command-bar.module.css";

const SEARCH_DEBOUNCE_MS = 250;

export function CommandBar() {
  const {
    filters,
    setFilters,
    live,
    setLive,
    refresh,
    refreshing,
    lastUpdated,
    feed,
    status,
    navOpen,
    setNavOpen,
    navMode,
    setNavMode,
    setDailyOpen,
  } = useNewsroom();
  const section = usePathname()?.split("/").pop() ?? "front-page";
  const personal = section === "personal-daily";
  const fixedTime = SECTION_TIME_LABELS[section];
  const barRef = useRef<HTMLElement>(null);
  const [query, setQuery] = useState(filters.q);
  const [lastUrlQuery, setLastUrlQuery] = useState(filters.q);

  // Follow the URL when it changes elsewhere (back button, "Clear filters").
  if (filters.q !== lastUrlQuery) {
    setLastUrlQuery(filters.q);
    setQuery(filters.q);
  }

  useEffect(() => {
    if (query === filters.q) return;
    const timer = setTimeout(() => setFilters({ q: query }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, filters.q, setFilters]);

  // Keep the sticky sidebar below the header, including when its controls wrap.
  useEffect(() => {
    const bar = barRef.current;
    const shell = bar?.parentElement;
    if (!bar || !shell) return;
    const measure = () =>
      shell.style.setProperty("--command-bar-height", `${bar.getBoundingClientRect().height}px`);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      shell.style.removeProperty("--command-bar-height");
    };
  }, []);

  const fixture = feed?.providers.some((p) => p.kind === "fixture" && p.state === "ok");

  function toggleNav() {
    if (window.innerWidth < 1200) {
      setNavOpen(!navOpen);
      return;
    }
    const expandedNow = navMode === "expanded" || (navMode === "auto" && window.innerWidth >= 1600);
    setNavMode(expandedNow ? "collapsed" : "expanded");
  }

  return (
    <header ref={barRef} className={styles.bar}>
      <div className={styles.brand}>
        <button
          type="button"
          className={styles.menu}
          onClick={toggleNav}
          aria-label="Toggle Newsroom navigation"
          aria-controls="newsroom-nav"
        >
          <Menu size={20} aria-hidden />
        </button>
        <div>
          <h1 className={styles.title}>
            <Newspaper className={styles.brandIcon} size={24} aria-hidden />
            <span className={styles.titleAccent}>Hermes</span> Newsroom
          </h1>
          <p className={styles.subtitle}>AI news-intelligence command center led by Hermes Agent</p>
        </div>
      </div>

      {personal ? (
        <p className={styles.subtitle}>Personal work edition · Hermes Agent</p>
      ) : (
        <>
          <div className={styles.state}>
            <button
              type="button"
              className={styles.live}
              data-live={live || undefined}
              aria-pressed={live}
              onClick={() => setLive(!live)}
              title={live ? "Pause automatic refresh" : "Resume automatic refresh"}
            >
              {live ? <span className={styles.liveDot} aria-hidden /> : <Pause size={13} aria-hidden />}
              {live ? "Live" : "Paused"}
              <span className="visually-hidden">{live ? " — press to pause" : " — press to resume"}</span>
              {live ? null : <Play size={12} aria-hidden className={styles.resumeIcon} />}
            </button>
            {fixture ? (
              <span
                className={styles.fixture}
                title="Stories come from synthetic fixture data, not live sources"
              >
                <FlaskConical size={13} aria-hidden /> Fixture data
              </span>
            ) : null}
          </div>

          <div className={styles.filters} role="search">
            <label className={styles.search}>
              <Search size={17} aria-hidden className={styles.searchIcon} />
              <span className="visually-hidden">Search stories</span>
              <input
                id="newsroom-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && query) {
                    event.preventDefault();
                    setQuery("");
                  }
                }}
                placeholder="Search topics, companies, models, or ideas…"
                autoComplete="off"
              />
              <kbd className={styles.kbd} aria-hidden>
                /
              </kbd>
            </label>
            <label className={styles.selectWrap}>
              <span className="visually-hidden">Source</span>
              <select
                value={filters.source}
                onChange={(event) => setFilters({ source: event.target.value as SourceId | "all" })}
              >
                {SOURCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                    {sourceNotConnected(feed?.mode, o.value, feed?.connectedSources)
                      ? " — not connected"
                      : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.selectWrap}>
              <span className="visually-hidden">Time range</span>
              <select
                value={fixedTime ? "section" : filters.range}
                disabled={!!fixedTime}
                title={fixedTime ? `This section uses ${fixedTime.toLowerCase()}` : undefined}
                onChange={(event) => setFilters({ range: event.target.value as TimeRange })}
              >
                {fixedTime ? <option value="section">{fixedTime}</option> : null}
                {TIME_RANGES.map((range) => (
                  <option key={range} value={range}>
                    {TIME_RANGE_LABELS[range]}
                  </option>
                ))}
              </select>
            </label>
            {filters.range === "custom" && !fixedTime ? (
              <span className={styles.custom}>
                <label>
                  <span className="visually-hidden">From date</span>
                  <input
                    type="date"
                    value={filters.from}
                    max={filters.to || undefined}
                    onChange={(event) => setFilters({ from: event.target.value })}
                  />
                </label>
                <span aria-hidden>–</span>
                <label>
                  <span className="visually-hidden">To date</span>
                  <input
                    type="date"
                    value={filters.to}
                    min={filters.from || undefined}
                    onChange={(event) => setFilters({ to: event.target.value })}
                  />
                </label>
              </span>
            ) : null}
          </div>

          <div className={styles.refresh}>
            <button
              type="button"
              className={styles.iconButton}
              onClick={refresh}
              disabled={refreshing}
              aria-label="Refresh now"
              title="Refresh now"
            >
              <RefreshCw size={17} aria-hidden className={refreshing ? styles.spinning : undefined} />
            </button>
            <p className={styles.updated} aria-live="off">
              <span className={styles.updatedLabel}>Updated</span>{" "}
              {lastUpdated ? (
                <time dateTime={lastUpdated.toISOString()}>
                  {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </time>
              ) : status === "loading" ? (
                "…"
              ) : (
                "never"
              )}
            </p>
          </div>

          <button type="button" className={styles.generate} onClick={() => setDailyOpen(true)}>
            <FileText size={18} aria-hidden />
            Generate Daily
          </button>
        </>
      )}
    </header>
  );
}
