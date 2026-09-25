import { describe, expect, it } from "vitest";
import { sectionStories } from "@/newsroom/model/section-scope";
import { DEFAULT_FILTERS } from "@/newsroom/model/filters";
import { NOW, fixtureStories } from "./helpers";

const base = fixtureStories()[0];
const ago = (days: number) => new Date(NOW.getTime() - days * 86400000).toISOString();
const stories = [
  {
    ...base,
    id: "recent",
    title: "Synthetic release",
    topics: ["Hermes Agent"],
    source: "github" as const,
    type: "build" as const,
    publishedAt: ago(3),
    saved: true,
    dismissed: false,
  },
  {
    ...base,
    id: "old",
    title: "Synthetic archived story",
    source: "reddit" as const,
    publishedAt: ago(60),
    saved: true,
    dismissed: true,
  },
  { ...base, id: "future", publishedAt: ago(-1), saved: false, dismissed: false },
];
describe("section scope", () => {
  it("keeps a full week while applying source and search filters", () => {
    const options = { now: NOW };
    expect(sectionStories("weekly-chronicle", stories, DEFAULT_FILTERS, options).map((s) => s.id)).toEqual([
      "recent",
    ]);
    expect(
      sectionStories("weekly-chronicle", stories, { ...DEFAULT_FILTERS, source: "reddit" }, options),
    ).toEqual([]);
    expect(
      sectionStories("weekly-chronicle", stories, { ...DEFAULT_FILTERS, q: "missing" }, options),
    ).toEqual([]);
  });
  it("searches older saved and dismissed stories across retained dates", () => {
    const selected = sectionStories("archive", stories, { ...DEFAULT_FILTERS, q: "archived" }, { now: NOW });
    expect(selected.map((s) => s.id)).toEqual(["old"]);
  });
  it("scopes builds to matching stories in the past thirty days", () => {
    expect(
      sectionStories("built-with-hermes", stories, DEFAULT_FILTERS, { now: NOW }).map((s) => s.id),
    ).toEqual(["recent"]);
    expect(
      sectionStories("built-with-hermes", stories, { ...DEFAULT_FILTERS, source: "reddit" }, { now: NOW }),
    ).toEqual([]);
  });
});
