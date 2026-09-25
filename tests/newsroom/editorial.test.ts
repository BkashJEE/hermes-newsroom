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
  it("selects at least three stories from a realistic 47-item recent feed", () => {
    // Synthetic provider-shaped mix: one release, twenty merges, twenty-six projects.
    const fresh = [
      release,
      ...Array.from({ length: 20 }, (_, i) => ({
        ...merge,
        id: `github:change:${i + 100}`,
        sourceUrl: `https://github.com/NousResearch/hermes-agent/pull/${i + 100}`,
      })),
      ...Array.from({ length: 26 }, (_, i) => ({
        ...project,
        id: `github:project:${i + 100}`,
        sourceUrl: `https://github.com/community/hermes-tool-${i}`,
      })),
    ];
    expect(fresh).toHaveLength(47);
    const oldDiscussion = {
      ...discussion,
      publishedAt: new Date(NOW.getTime() - 3 * 86400000).toISOString(),
    };
    const selected = sectionStories(
      "front-page",
      [...fresh, oldDiscussion],
      { ...DEFAULT_FILTERS, range: "24h" },
      { now: NOW },
    );
    expect(selected.length).toBeGreaterThanOrEqual(3);
    expect(selected.length).toBeLessThanOrEqual(8);
    expect(selected[0].id).toBe(release.id);
    expect(selected.slice(1).every((s) => hermesUpdateKind(s) === "change")).toBe(true);
    expect(selected).not.toContain(oldDiscussion);
    expect(new Set(selected.map((s) => s.id)).size).toBe(selected.length);
  });

  it("fills the page to its own cap, so a quiet day is never a near-empty page", () => {
    // The real failure this guards: one release in the window, everything else a
    // merge or project card, and the page rendered a single story.
    const lead = { ...release, id: "github:hermes:99" };
    const merges = Array.from({ length: 5 }, (_, i) => ({
      ...merge,
      id: `github:change:${i + 20}`,
      sourceUrl: `https://github.com/NousResearch/hermes-agent/pull/${i + 20}`,
    }));
    const projects = Array.from({ length: 5 }, (_, i) => ({ ...project, id: `github:project:${i + 30}` }));
    const selected = frontPageSelection([lead, ...merges, ...projects]);
    expect(selected.length).toBe(8);
    expect(selected[0]).toEqual(lead);
    // Merges are preferred over project activity when filling.
    expect(selected.filter((s) => s.id.startsWith("github:change:"))).toHaveLength(5);
    expect(new Set(selected.map((s) => s.id)).size).toBe(selected.length);
  });

  it("fills a quiet front page from merges before projects without relabeling them", () => {
    const merge2 = {
      ...merge,
      id: "github:change:5",
      sourceUrl: "https://github.com/NousResearch/hermes-agent/pull/5",
    };
    expect(frontPageSelection([project, merge, merge2])).toEqual([merge, merge2, project]);
    expect(frontPageSelection([project])).toEqual([project]);
    expect(frontPageSelection([])).toEqual([]);
  });

  it("keeps activity off a sufficiently populated headline page", () => {
    const headlines = Array.from({ length: 10 }, (_, i) => ({ ...discussion, id: `hn:${i + 100}` }));
    expect(frontPageSelection([project, merge, ...headlines])).toEqual(headlines.slice(0, 8));
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
    // Headlines first, then the page is filled: on a quiet day project activity
    // appears rather than leaving a near-empty front page.
    expect(
      select("front-page")
        .map((s) => s.id)
        .sort(),
    ).toEqual([release.id, discussion.id, merge.id, project.id].sort());
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
      8,
    );
  });
});
