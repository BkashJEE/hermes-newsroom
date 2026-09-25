import { describe, expect, it } from "vitest";
import {
  contentOpportunity,
  pickFlashcards,
  pickLead,
  signalMeter,
  tickerStories,
  timeAgo,
  trendingTopics,
} from "@/newsroom/model/derive";
import { NOW, fixtureStories } from "./helpers";

const stories = fixtureStories();

describe("front page composition", () => {
  it("leads with the most important verified story", () => {
    expect(pickLead(stories)?.id).toBe("fixture:context-rebuild");
  });

  it("falls back to the most important story when nothing is verified", () => {
    const lead = pickLead(stories.filter((s) => s.type !== "verified"));
    expect(lead).toBeDefined();
    expect(lead?.type).not.toBe("verified");
  });

  it("prefers varied types, then fills gaps without repeating the lead or other cards", () => {
    const cards = pickFlashcards(stories);
    expect(cards.map((c) => c.type)).toEqual(["developing", "community", "build"]);
    expect(cards.every((c) => c.story?.type === c.type)).toBe(true);
    const community = stories.filter((s) => s.type === "community");
    const cardsWithoutBuilds = pickFlashcards(community, community[0].id);
    const selected = cardsWithoutBuilds.flatMap((c) => (c.story ? [c.story.id] : []));
    expect(selected).not.toContain(community[0].id);
    expect(new Set(selected).size).toBe(selected.length);
    expect(selected).toHaveLength(Math.min(3, community.length - 1));
    expect(pickFlashcards([]).every((c) => c.story === null)).toBe(true);
  });
});

describe("rail widgets", () => {
  it("uses coverage counts when momentum is not measured, without counting a topic twice", () => {
    const live = [
      {
        ...stories[0],
        topics: ["Less covered"],
        signals: ["hermes" as const],
        momentum: { measured: false, score: 0, changePct: 0, direction: "steady" as const },
      },
      ...[1, 2].map((i) => ({
        ...stories[i],
        topics: ["More covered", "More covered"],
        signals: ["community" as const],
        momentum: { measured: false, score: 0, changePct: 0, direction: "steady" as const },
      })),
    ];
    expect(trendingTopics(live)[0]).toMatchObject({ topic: "More covered", stories: 2 });
    expect(signalMeter(live).find((r) => r.area === "community")).toMatchObject({ count: 2, value: 67 });
  });
  it("reads every signal area as a 0–100 value with a level word", () => {
    const readings = signalMeter(stories);
    expect(readings.map((r) => r.label)).toEqual(["Hermes", "AI Models", "Community", "Security"]);
    for (const r of readings) {
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThanOrEqual(100);
      expect(r.level).toMatch(/Low|Moderate|High|Very high/);
    }
    expect(signalMeter([]).every((r) => r.value === 0)).toBe(true);
  });

  it("ranks five trending topics with source counts", () => {
    const topics = trendingTopics(stories);
    expect(topics).toHaveLength(5);
    expect(topics.map((t) => t.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(topics.every((t) => t.sources >= 1)).toBe(true);
  });

  it("prefers an opportunity story for the content opportunity", () => {
    const opportunity = contentOpportunity(stories);
    expect(opportunity?.story.type).toBe("opportunity");
    expect(opportunity?.evidenceReadiness).toBe("Ready");
    expect(contentOpportunity([])).toBeNull();
  });

  it("feeds only breaking stories to the ticker", () => {
    expect(tickerStories(stories).every((s) => s.type === "breaking")).toBe(true);
    expect(tickerStories(stories).length).toBe(2);
  });
});

describe("timeAgo", () => {
  it("formats compact relative times", () => {
    const at = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();
    expect(timeAgo(at(0), NOW)).toBe("just now");
    expect(timeAgo(at(12), NOW)).toBe("12m ago");
    expect(timeAgo(at(180), NOW)).toBe("3h ago");
    expect(timeAgo(at(3 * 24 * 60), NOW)).toBe("3d ago");
  });
});
