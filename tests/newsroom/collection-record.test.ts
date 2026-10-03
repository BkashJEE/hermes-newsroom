import { describe, expect, it } from "vitest";
import {
  applyEditorialGate,
  collectionRecord,
  COMMENTARY_CAP,
  EXAMPLE_CAP,
  DROP_RULES,
} from "@/newsroom/model/newsworthy";
import type { Story } from "@/newsroom/model/story";

const EXISTS = "this is not a release or proof of a working integration. Topics: .";

function story(id: string, summary: string, over: Partial<Story> = {}): Story {
  return {
    id,
    title: `Signal ${id}`,
    summary,
    source: "github",
    sourceLabel: "GitHub",
    sourceUrl: `https://example.com/${id}`,
    publishedAt: "2026-09-20T00:00:00.000Z",
    relevanceScore: 50,
    ...over,
  } as Story;
}

function record(stories: Story[]) {
  return collectionRecord(stories, applyEditorialGate(stories));
}

describe("collection record", () => {
  it("accounts for every collected signal: kept plus excluded is what came in", () => {
    const stories = [
      story("a", "Released v2 with a new scheduler and a rewritten planner loop for long tasks."),
      story("b", EXISTS),
      story("c", EXISTS),
    ];
    const result = record(stories);
    expect(result.collected).toBe(3);
    expect(result.kept).toBe(1);
    expect(result.excluded).toBe(2);
    expect(result.kept + result.excluded).toBe(result.collected);
  });

  it("names the rule behind each exclusion, not just a category", () => {
    const result = record([story("a", EXISTS)]);
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0].reason).toBe("existence-only");
    expect(result.reasons[0].rule).toBe(DROP_RULES["existence-only"].rule);
    // The rule has to be a sentence a reader can check a decision against.
    expect(result.reasons[0].rule.length).toBeGreaterThan(30);
  });

  it("links what it excluded, so the judgement can be checked rather than trusted", () => {
    const result = record([story("a", EXISTS)]);
    expect(result.reasons[0].examples).toEqual([
      { id: "a", title: "Signal a", sourceLabel: "GitHub", sourceUrl: "https://example.com/a" },
    ]);
  });

  it("caps the examples but never the count, and says how many it did not list", () => {
    const stories = Array.from({ length: EXAMPLE_CAP + 5 }, (_, i) => story(`s${i}`, EXISTS));
    const result = record(stories);
    expect(result.reasons[0].count).toBe(EXAMPLE_CAP + 5);
    expect(result.reasons[0].examples).toHaveLength(EXAMPLE_CAP);
  });

  it("reports the commentary cap as its own rule", () => {
    const stories = Array.from({ length: COMMENTARY_CAP + 3 }, (_, i) =>
      story(`x${i}`, "Shipped a fix for the retry loop.", {
        sourceLabel: "X · browser search sample",
        publishedAt: new Date(Date.UTC(2026, 8, 20, 0, i)).toISOString(),
      }),
    );
    const result = record(stories);
    const capped = result.reasons.find((r) => r.reason === "commentary-cap");
    expect(capped?.count).toBe(3);
    expect(result.kept).toBe(COMMENTARY_CAP);
  });

  it("reads the same way every time: reasons keep a fixed order", () => {
    const stories = [
      story("x0", "Asked whether anyone has tried this.", { source: "bluesky", sourceLabel: "Bluesky" }),
      story("e0", EXISTS),
    ];
    expect(record(stories).reasons.map((r) => r.reason)).toEqual(["existence-only", "no-event"]);
    expect(record([...stories].reverse()).reasons.map((r) => r.reason)).toEqual([
      "existence-only",
      "no-event",
    ]);
  });

  it("reports an empty exclusion list rather than hiding the section", () => {
    const result = record([story("a", "Released v2 with a rewritten planner loop for long-running tasks.")]);
    expect(result.excluded).toBe(0);
    expect(result.reasons).toEqual([]);
  });
});
