"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Star, X } from "lucide-react";
import { NEWSROOM_BASE, NEWSROOM_SECTIONS } from "../sections";
import { matchesWatchlist } from "../model/filters";
import { useNewsroom } from "../state/newsroom-store";
import styles from "./section-nav.module.css";

/** Original neutral monogram (not the Hermes Agent logo). */
export function NewsroomMark({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden className={styles.mark}>
      <path d="M24 3 43 13.5v21L24 45 5 34.5v-21Z" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M16 14v20M32 14v20M16 24h16" stroke="var(--green)" strokeWidth="4" strokeLinecap="square" />
    </svg>
  );
}

export function SectionNav() {
  const pathname = usePathname() ?? NEWSROOM_BASE;
  const { feed, stories, filters, setFilters, navOpen, setNavOpen, navMode } = useNewsroom();
  const watchlists = feed?.watchlists ?? [];
  const live = stories.filter((s) => !s.dismissed);

  return (
    <nav
      id="newsroom-nav"
      className={styles.nav}
      aria-label="Newsroom sections"
      data-open={navOpen || undefined}
      data-mode={navMode}
    >
      <div className={styles.brand}>
        <NewsroomMark />
        <p className={styles.tagline}>
          Intelligence
          <br />
          connects
          <br />
          opportunity
        </p>
        <button
          type="button"
          className={styles.close}
          onClick={() => setNavOpen(false)}
          aria-label="Close navigation"
        >
          <X size={18} aria-hidden />
        </button>
      </div>

      <ul className={styles.sections}>
        {NEWSROOM_SECTIONS.filter((s) => s.id !== "personal-daily" || feed?.personalDaily?.enabled).map(
          (section) => {
            const active =
              section.href === NEWSROOM_BASE ? pathname === NEWSROOM_BASE : pathname.startsWith(section.href);
            const Icon = section.icon;
            const label =
              section.id === "personal-daily" ? (feed?.personalDaily?.title ?? section.label) : section.label;
            return (
              <li key={section.id}>
                <Link
                  href={section.href}
                  className={styles.link}
                  aria-current={active ? "page" : undefined}
                  title={label}
                >
                  <Icon size={20} aria-hidden />
                  <span className={styles.label}>{label}</span>
                </Link>
              </li>
            );
          },
        )}
      </ul>

      <section className={styles.watchlists} aria-labelledby="watchlists-heading">
        <h2 id="watchlists-heading" className={styles.heading}>
          Watchlists
        </h2>
        {watchlists.length === 0 ? (
          <p className={styles.hint}>No watchlists configured.</p>
        ) : (
          <ul>
            {watchlists.map((watchlist) => {
              const count = live.filter((s) => matchesWatchlist(s, watchlist)).length;
              const active = filters.watch === watchlist.id;
              return (
                <li key={watchlist.id}>
                  <button
                    type="button"
                    className={styles.watch}
                    aria-pressed={active}
                    title={`${watchlist.label}: ${count} stories`}
                    onClick={() => setFilters({ watch: active ? "" : watchlist.id })}
                  >
                    <Star size={15} aria-hidden fill={active ? "currentColor" : "none"} />
                    <span className={styles.label}>{watchlist.label}</span>
                    <span className={styles.count}>
                      {count}
                      <span className="visually-hidden"> stories</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p className={styles.hint}>
          Personal lists go in <code>config/newsroom.local.json</code>
        </p>
      </section>

      <blockquote className={styles.quote}>
        <p>“Better context builds a brighter tomorrow.”</p>
        <footer>— Hermes Newsroom</footer>
      </blockquote>
    </nav>
  );
}
