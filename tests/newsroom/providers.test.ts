import { describe, expect, it } from "vitest";
import { aggregateProviders } from "@/newsroom/providers/aggregate";
import { FIXTURE_GROUPS, createFixtureProvider } from "@/newsroom/providers/fixture-provider";
import { buildProviders } from "@/newsroom/providers/registry";
import { parseScenario, scenariosEnabled } from "@/newsroom/providers/scenarios";
import { FIXTURE_STORIES } from "@/newsroom/fixtures/stories";
import { SOURCE_IDS, STORY_TYPES } from "@/newsroom/model/story";
import type { NewsProvider } from "@/newsroom/providers/types";
import { NOW } from "./helpers";

const query = { now: NOW.toISOString(), since: new Date(NOW.getTime() - 30 * 86_400_000).toISOString() };

describe("fixture data", () => {
  it("preserves the authored fixture families and covers every story type", () => {
    // Bluesky is live-only; the original synthetic edition stays as authored.
    expect(new Set(FIXTURE_STORIES.map((s) => s.source))).toEqual(
      new Set(SOURCE_IDS.filter((s) => s !== "bluesky")),
    );
    expect(new Set(FIXTURE_STORIES.map((s) => s.type))).toEqual(new Set(STORY_TYPES));
  });

  it("uses unique ids and only example.com links", () => {
    const ids = FIXTURE_STORIES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const urls = FIXTURE_STORIES.flatMap((s) => [
      s.sourceUrl,
      ...s.file.evidence.map((e) => e.url),
      ...s.file.conflicting.map((e) => e.url),
    ]);
    expect(urls.every((u) => u.startsWith("https://example.com/"))).toBe(true);
  });

  it("keeps scores in range", () => {
    for (const s of FIXTURE_STORIES) {
      for (const v of [s.relevanceScore, s.evidenceScore, s.momentum.score, s.actionability]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe("aggregateProviders", () => {
  it("registers Bluesky and Reddit only in the default live feed", () => {
    expect(buildProviders("default", true).map((p) => p.id)).toEqual([
      "hermes-releases",
      "hermes-projects",
      "hermes-changes",
      "hermes-discussions",
      "bluesky-search",
      "reddit-search",
    ]);
    for (const scenario of ["default", "empty", "partial", "error"] as const) {
      expect(buildProviders(scenario).every((p) => p.kind === "fixture")).toBe(true);
    }
    expect(buildProviders("empty", true).every((p) => p.kind === "fixture")).toBe(true);
  });

  it("merges all fixture groups into one feed", async () => {
    const feed = await aggregateProviders(buildProviders(), query);
    expect(feed.stories).toHaveLength(FIXTURE_STORIES.length);
    expect(feed.providers.every((p) => p.state === "ok")).toBe(true);
    expect(feed.mode).toBe("fixture");
  });

  it("isolates a failing provider (partial failure)", async () => {
    const feed = await aggregateProviders(buildProviders("partial"), query);
    const [social, ...rest] = feed.providers;
    expect(social).toMatchObject({ id: FIXTURE_GROUPS[0].id, state: "error", storyCount: 0 });
    expect(rest.every((p) => p.state === "ok")).toBe(true);
    expect(feed.stories.length).toBeGreaterThan(0);
    expect(feed.stories.some((s) => ["reddit", "x", "facebook"].includes(s.source))).toBe(false);
  });

  it("reports every provider when all fail, without throwing", async () => {
    const feed = await aggregateProviders(buildProviders("error"), query);
    expect(feed.stories).toEqual([]);
    expect(feed.providers.every((p) => p.state === "error")).toBe(true);
  });

  it("times out a hung provider and keeps the rest", async () => {
    const hung: NewsProvider = {
      id: "hung",
      label: "Hung provider",
      kind: "live",
      sources: ["github"],
      fetchStories: () => new Promise(() => {}),
    };
    const ok = createFixtureProvider({ id: "ok", label: "ok", sources: ["reddit"] });
    const feed = await aggregateProviders([hung, ok], query, { timeoutMs: 30 });
    expect(feed.providers[0]).toMatchObject({ id: "hung", state: "timeout" });
    expect(feed.providers[1].state).toBe("ok");
    expect(feed.stories.every((s) => s.source === "reddit")).toBe(true);
    expect(feed.mode).toBe("fixture");
  });

  it("de-duplicates stories with the same id", async () => {
    const a = createFixtureProvider({ id: "a", label: "a", sources: ["reddit"] });
    const b = createFixtureProvider({ id: "b", label: "b", sources: ["reddit"] });
    const feed = await aggregateProviders([a, b], query);
    expect(feed.stories).toHaveLength(FIXTURE_STORIES.filter((s) => s.source === "reddit").length);
  });

  it("returns an empty but healthy feed for the empty scenario", async () => {
    const feed = await aggregateProviders(buildProviders("empty"), query);
    expect(feed.stories).toEqual([]);
    expect(feed.providers.every((p) => p.state === "ok")).toBe(true);
  });
});

describe("scenarios", () => {
  it("parses known scenarios only", () => {
    expect(parseScenario("partial")).toBe("partial");
    expect(parseScenario("drop tables")).toBe("default");
    expect(parseScenario(null)).toBe("default");
  });

  it("are disabled in production unless explicitly enabled", () => {
    expect(scenariosEnabled({ NODE_ENV: "development" })).toBe(true);
    expect(scenariosEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(scenariosEnabled({ NODE_ENV: "production", NEWSROOM_ENABLE_SCENARIOS: "1" })).toBe(true);
  });
});

describe("social sources can be switched off", () => {
  it("omits a provider the operator disabled, and keeps the rest", async () => {
    const { buildProviders } = await import("@/newsroom/providers/registry");
    const ids = (p: { id: string }[]) => p.map((x) => x.id);
    const all = ids(buildProviders("default", true));
    expect(all).toEqual(expect.arrayContaining(["bluesky-search", "reddit-search"]));
    const without = ids(buildProviders("default", true, { bluesky: false, reddit: false }));
    expect(without).not.toEqual(expect.arrayContaining(["bluesky-search", "reddit-search"]));
    // Disabling a social source must not remove the Hermes searches.
    expect(without.length).toBe(all.length - 2);
    const onlyReddit = ids(buildProviders("default", true, { bluesky: false, reddit: true }));
    expect(onlyReddit).toContain("reddit-search");
    expect(onlyReddit).not.toContain("bluesky-search");
  });
});
