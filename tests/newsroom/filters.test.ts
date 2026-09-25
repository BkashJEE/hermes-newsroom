import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  SORT_KEYS,
  SOURCE_OPTIONS,
  TIME_RANGES,
  TYPE_OPTIONS,
  applyFilters,
  isFiltered,
  parseFilters,
  writeFilters,
  type NewsroomFilters,
} from "@/newsroom/model/filters";
import { importance } from "@/newsroom/model/story";
import { NOW, fixtureStories } from "./helpers";

const stories = fixtureStories();
const run = (patch: Partial<NewsroomFilters>, extra = {}) =>
  applyFilters(stories, { ...DEFAULT_FILTERS, ...patch }, { now: NOW, ...extra });

describe("search", () => {
  it("matches title, summary, topics and source label, case-insensitively", () => {
    expect(run({ q: "REBUILDING" }).map((s) => s.title)).toContain("Agents are rebuilding context");
    expect(run({ q: "token spend" }).length).toBeGreaterThan(0);
    expect(
      run({ q: "local models" }).every(
        (s) => s.topics.includes("Local Models") || /local/i.test(s.title + s.summary),
      ),
    ).toBe(true);
    expect(run({ q: "r/LocalLLaMA" }).length).toBeGreaterThan(0);
  });

  it("requires every term to match", () => {
    expect(run({ q: "memory plugin" }).map((s) => s.id)).toEqual(["fixture:memory-plugin-pulled"]);
    expect(run({ q: "zzzz-no-match" })).toEqual([]);
  });
});

describe("source filter", () => {
  it.each(SOURCE_OPTIONS.filter((o) => o.value !== "all").map((o) => o.value))("keeps only %s", (source) => {
    // Live-only Bluesky gets a test-local sample; do not rewrite the fixture edition.
    const input = [...stories, { ...stories[0], id: "synthetic:bluesky-filter", source: "bluesky" as const }];
    const result = applyFilters(input, { ...DEFAULT_FILTERS, source, range: "week" }, { now: NOW });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((s) => s.source === source)).toBe(true);
  });

  it("All Sources keeps everything in range", () => {
    expect(run({ source: "all", range: "week" })).toHaveLength(stories.length);
  });
});

describe("type filter", () => {
  it.each(TYPE_OPTIONS.filter((o) => o.value !== "all").map((o) => o.value))("keeps only %s", (type) => {
    const result = run({ type, range: "week" });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((s) => s.type === type)).toBe(true);
  });
});

describe("time range", () => {
  const counts = Object.fromEntries(TIME_RANGES.map((range) => [range, run({ range }).length]));

  it("narrows from week to live", () => {
    expect(counts.live).toBeLessThan(counts.hour);
    expect(counts.hour).toBeLessThan(counts["24h"]);
    expect(counts["24h"]).toBeLessThan(counts.week);
  });

  it("live keeps only the last 15 minutes", () => {
    const cutoff = NOW.getTime() - 15 * 60_000;
    expect(run({ range: "live" }).every((s) => Date.parse(s.publishedAt) >= cutoff)).toBe(true);
    expect(counts.live).toBeGreaterThan(0);
  });

  it("custom honors from/to dates", () => {
    const old = run({ range: "custom", from: "2026-09-17", to: "2026-09-19" });
    expect(old.map((s) => s.id)).toEqual(["fixture:builder-survey"]);
  });
});

describe("sorting", () => {
  it.each(SORT_KEYS)("%s produces a stable, complete ordering", (sort) => {
    const a = run({ sort, range: "week" });
    const b = run({ sort, range: "week" });
    expect(a.map((s) => s.id)).toEqual(b.map((s) => s.id));
    expect(a).toHaveLength(stories.length);
  });

  it("orders by the documented keys", () => {
    const pairs = (sort: NewsroomFilters["sort"]) => {
      const list = run({ sort, range: "week" });
      return list.slice(1).map((s, i) => [list[i], s] as const);
    };
    expect(pairs("relevance").every(([a, b]) => a.relevanceScore >= b.relevanceScore)).toBe(true);
    expect(pairs("importance").every(([a, b]) => importance(a) >= importance(b))).toBe(true);
    expect(pairs("rising").every(([a, b]) => a.momentum.changePct >= b.momentum.changePct)).toBe(true);
    expect(pairs("newest").every(([a, b]) => Date.parse(a.publishedAt) >= Date.parse(b.publishedAt))).toBe(
      true,
    );
    expect(pairs("evidence").every(([a, b]) => a.evidenceScore >= b.evidenceScore)).toBe(true);
    expect(pairs("actionable").every(([a, b]) => a.actionability >= b.actionability)).toBe(true);
    expect(pairs("least-covered").every(([a, b]) => a.sourceCount <= b.sourceCount)).toBe(true);
  });
});

describe("dismissed and watchlists", () => {
  it("hides dismissed stories unless asked", () => {
    const withDismissed = stories.map((s, i) => (i === 0 ? { ...s, dismissed: true } : s));
    const opts = { now: NOW };
    const f = { ...DEFAULT_FILTERS, range: "week" as const };
    expect(applyFilters(withDismissed, f, opts)).toHaveLength(stories.length - 1);
    expect(applyFilters(withDismissed, f, { ...opts, includeDismissed: true })).toHaveLength(stories.length);
  });

  it("filters by watchlist topics", () => {
    const watchlists = [{ id: "sec", label: "Security", topics: ["Security"] }];
    const result = run({ watch: "sec", range: "week" }, { watchlists });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((s) => s.topics.includes("Security"))).toBe(true);
  });
});

describe("URL state", () => {
  it("round-trips every filter", () => {
    const filters: NewsroomFilters = {
      q: "agent memory",
      source: "github",
      range: "custom",
      from: "2026-09-01",
      to: "2026-09-21",
      type: "build",
      sort: "least-covered",
      watch: "security",
    };
    expect(parseFilters(writeFilters(filters))).toEqual(filters);
  });

  it("omits defaults and keeps unrelated params", () => {
    const params = writeFilters(DEFAULT_FILTERS, new URLSearchParams("scenario=partial&q=old"));
    expect(params.toString()).toBe("scenario=partial");
  });

  it("drops custom dates when the range is not custom", () => {
    const params = writeFilters({ ...DEFAULT_FILTERS, range: "week", from: "2026-09-01" });
    expect(params.has("from")).toBe(false);
  });

  it("ignores unknown or malformed values", () => {
    const parsed = parseFilters(
      new URLSearchParams("source=myspace&range=forever&sort=random&type=x&from=yesterday"),
    );
    expect(parsed).toEqual(DEFAULT_FILTERS);
    expect(isFiltered(parsed)).toBe(false);
  });
});
