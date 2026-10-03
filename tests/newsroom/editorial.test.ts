import { describe, expect, it } from "vitest";
import { frontPageSelection, hermesUpdateKind } from "@/newsroom/model/editorial";
import { sectionStories } from "@/newsroom/model/section-scope";
import { DEFAULT_FILTERS } from "@/newsroom/model/filters";
import { NOW, fixtureStories, story } from "./helpers";

const at = new Date(NOW.getTime() - 3600000).toISOString();
const release = story({
  id: "github:hermes:1",
  source: "github",
  sourceUrl: "https://github.com/NousResearch/hermes-agent/releases/tag/v1",
  type: "build",
  publishedAt: at,
});
const merge = story({
  id: "github:change:2",
  source: "github",
  sourceUrl: "https://github.com/NousResearch/hermes-agent/pull/2",
  type: "developing",
  publishedAt: at,
});
const project = story({
  id: "github:project:3",
  source: "github",
  sourceUrl: "https://github.com/community/hermes-tool",
  type: "community",
  publishedAt: at,
});
const discussion = story({
  id: "hn:4",
  source: "hackernews",
  sourceUrl: "https://news.ycombinator.com/item?id=4",
  type: "community",
  publishedAt: at,
});
const select = (section: string) =>
  sectionStories(section, [release, merge, project, discussion], DEFAULT_FILTERS, { now: NOW });

describe("distinct newsroom sections", () => {
  it("keeps a quiet day short even when routine merges and project activity are plentiful", () => {
    const activity = [
      ...Array.from({ length: 20 }, (_, i) => ({ ...merge, id: `github:change:${i + 100}` })),
      ...Array.from({ length: 26 }, (_, i) => ({ ...project, id: `github:project:${i + 100}` })),
    ];
    expect(frontPageSelection([release, ...activity])).toEqual([release]);
    expect(frontPageSelection(activity)).toEqual([]);
  });

  it("caps the briefing at five ranked events without duplicates or routine filler", () => {
    const headlines = Array.from({ length: 10 }, (_, i) => ({ ...discussion, id: `hn:${i + 100}` }));
    expect(frontPageSelection([project, merge, ...headlines])).toEqual(headlines.slice(0, 5));
    expect(frontPageSelection([])).toEqual([]);
  });

  it("never backfills from outside the user's time, source, search or dismissal filters", () => {
    const old = { ...merge, publishedAt: new Date(NOW.getTime() - 2 * 86400000).toISOString() };
    expect(
      sectionStories("front-page", [old, { ...project, dismissed: true }], DEFAULT_FILTERS, { now: NOW }),
    ).toEqual([]);
    expect(
      sectionStories(
        "front-page",
        [release, merge, project, discussion],
        { ...DEFAULT_FILTERS, source: "hackernews" },
        { now: NOW },
      ),
    ).toEqual([discussion]);
    expect(
      sectionStories(
        "front-page",
        [release, merge, project],
        { ...DEFAULT_FILTERS, q: "not-present-phrase" },
        { now: NOW },
      ),
    ).toEqual([]);
  });

  it("separates upstream updates, project discovery, and the complete wire", () => {
    expect(
      select("hermes-agent-updates")
        .map((s) => s.id)
        .sort(),
    ).toEqual([merge.id, release.id].sort());
    expect(select("built-with-hermes").map((s) => s.id)).toEqual([project.id]);
    expect(select("live-wire")).toHaveLength(4);
    // Routine activity stays in its dedicated sections, even on a quiet day.
    expect(
      select("front-page")
        .map((s) => s.id)
        .sort(),
    ).toEqual([release.id, discussion.id].sort());
  });
  it("does not label a community mention, spoofed host, or unconfirmed pull request as an upstream update", () => {
    expect(hermesUpdateKind({ ...discussion, title: "Hermes Agent official update" })).toBeNull();
    expect(
      hermesUpdateKind({
        ...release,
        sourceUrl: "https://github.com.example.org/NousResearch/hermes-agent/releases/tag/v1",
      }),
    ).toBeNull();
    expect(hermesUpdateKind({ ...merge, id: "external:2" })).toBeNull();
    expect(
      hermesUpdateKind({
        ...release,
        sourceUrl: "https://github.com/community/hermes-agent/releases/tag/v1",
      }),
    ).toBeNull();
  });
  it("retains a month of updates while honoring search and source filters", () => {
    const older = { ...release, publishedAt: new Date(NOW.getTime() - 10 * 86400000).toISOString() };
    const stale = {
      ...release,
      id: "old",
      publishedAt: new Date(NOW.getTime() - 31 * 86400000).toISOString(),
    };
    expect(sectionStories("hermes-agent-updates", [older, stale], DEFAULT_FILTERS, { now: NOW })).toEqual([
      older,
    ]);
    expect(
      sectionStories("hermes-agent-updates", [older], { ...DEFAULT_FILTERS, source: "x" }, { now: NOW }),
    ).toEqual([]);
    expect(
      sectionStories("hermes-agent-updates", [older], { ...DEFAULT_FILTERS, q: "no-match" }, { now: NOW }),
    ).toEqual([]);
  });
  it("keeps Daily bounded and unique while Front Page caps its headline selection", () => {
    const stories = fixtureStories();
    const daily = sectionStories("hermes-daily", stories, DEFAULT_FILTERS, { now: NOW });
    expect(daily.length).toBeGreaterThan(0);
    expect(daily.length).toBeLessThanOrEqual(9);
    expect(new Set(daily.map((s) => s.id)).size).toBe(daily.length);
    expect(sectionStories("front-page", stories, DEFAULT_FILTERS, { now: NOW }).length).toBeLessThanOrEqual(
      5,
    );
  });
});
