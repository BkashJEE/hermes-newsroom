import { describe, expect, it } from "vitest";
import { groupWeeklyEntries, weeklyPoints, type WeeklyEntry } from "@/newsroom/model/weekly-recap";

const entry: WeeklyEntry = {
  id: "a",
  title: "Synthetic release",
  summary: "A synthetic fix.",
  url: "https://github.com/example/hermes-tool/releases/tag/v2",
  at: "2026-09-22T00:00:00Z",
  label: "Community release",
  desk: "community",
  released: true,
  topics: [],
  source: "github",
  type: "build",
};
describe("weekly recaps", () => {
  it("groups a project's releases, deduplicates URLs and preserves each source", () => {
    const rows = groupWeeklyEntries([
      entry,
      entry,
      { ...entry, id: "b", url: entry.url.replace("v2", "v1"), at: "2026-09-21T00:00:00Z" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].sources).toHaveLength(2);
    expect(rows[0].url).toBe(entry.url);
  });
  it("keeps previews separate and removes redundant repository activity", () => {
    const rows = groupWeeklyEntries([
      entry,
      {
        ...entry,
        id: "preview",
        url: entry.url.replace("v2", "v3-beta"),
        label: "Community prerelease",
        released: false,
      },
      {
        ...entry,
        id: "activity",
        url: "https://github.com/example/hermes-tool",
        label: "Repository activity",
        released: false,
        activity: true,
      },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.released)).toHaveLength(1);
    expect(rows.every((row) => !row.activity)).toBe(true);
  });
  it("does not collapse unrelated core pull requests into one release", () => {
    const merged = {
      ...entry,
      released: false,
      label: "Merged into Hermes · not necessarily released",
      url: "https://github.com/NousResearch/hermes-agent/pull/1",
    };
    expect(groupWeeklyEntries([merged, { ...merged, url: merged.url.replace("/1", "/2") }])).toHaveLength(2);
  });
  it("bounds long multilingual prose to two compact source points", () => {
    const points = weeklyPoints("新增测试功能".repeat(100) + "。Another source sentence. Third sentence.");
    expect(points).toHaveLength(2);
    expect(points.every((point) => point.length <= 120)).toBe(true);
    expect(points[0]).toContain("…");
  });
});
