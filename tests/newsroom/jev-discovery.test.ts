import { beforeEach, expect, it, vi } from "vitest";
import { discoverNews } from "@/newsroom/jev/discovery";
import type { Story } from "@/newsroom/model/story";
import type { Discovery } from "@/newsroom/jev/model";
vi.mock("@/newsroom/jev/inbox", () => ({
  readHuntInbox: vi.fn(async () => []),
  rememberCandidates: vi.fn(async () => []),
}));
const fixtures = vi.hoisted(() => ({ gh: vi.fn(), hn: vi.fn() }));
vi.mock("@/newsroom/providers/hermes-hunt", () => ({
  hermesHuntProviders: vi.fn(() => [
    { id: "gh", label: "GitHub", kind: "live", sources: ["github"], fetchStories: fixtures.gh },
    { id: "hn", label: "Hacker News", kind: "live", sources: ["hackernews"], fetchStories: fixtures.hn },
  ]),
}));
vi.mock("@/newsroom/browser-x/server", () => ({
  readXState: async () => ({ posts: [], lastCollectedAt: "2026-09-01T00:00:00Z" }),
}));
import { hermesHuntProviders } from "@/newsroom/providers/hermes-hunt";
function story(id: string, relevanceScore: number, source = "github"): Story {
  return {
    id,
    title: `Synthetic ${id}`,
    summary: "Synthetic excerpt",
    source,
    publishedAt: new Date().toISOString(),
    sourceUrl: `https://example.com/${id}`,
    relevanceScore,
  } as Story;
}
beforeEach(() => {
  vi.clearAllMocks();
  fixtures.gh.mockResolvedValue([story("release", 90)]);
  fixtures.hn.mockResolvedValue([story("discussion", 65, "hackernews")]);
});
it("streams actual collection before deterministic selection and explicitly distinguishes saved X", async () => {
  const events: Discovery[] = [];
  const result = await discoverNews(1, true, new AbortController().signal, (s) => events.push(s));
  expect(hermesHuntProviders).toHaveBeenCalledWith(true);
  expect(events[0].stage).toBe("collecting");
  expect(events[0].candidates).toEqual([]);
  expect(events.some((s) => s.candidates.length === 1 && s.stage === "collecting")).toBe(true);
  expect(result.inputs.map((s) => s.id)).toEqual(["release"]);
  expect(result.discovery.selectedIds).toEqual(["release"]);
  expect(result.discovery.sources.find((s) => s.id === "saved-x")).toMatchObject({
    kind: "saved",
    capturedAt: "2026-09-01T00:00:00Z",
    state: "ready",
  });
});
it("deduplicates and excludes unsupported sources before selecting anything for Jev", async () => {
  fixtures.gh.mockResolvedValue([story("same", 90), story("private", 100, "personal")]);
  fixtures.hn.mockResolvedValue([
    story("same", 80, "hackernews"),
    { ...story("duplicate-url", 80, "hackernews"), sourceUrl: "https://example.com/same" },
  ]);
  const result = await discoverNews(5, false, new AbortController().signal, () => {});
  expect(result.inputs.map((s) => s.id)).toEqual(["same"]);
  expect(result.discovery.sources.at(-1)?.state).toBe("skipped");
});
it("reports failed sources without pretending they returned news", async () => {
  fixtures.gh.mockRejectedValue(new Error("secret-token"));
  fixtures.hn.mockRejectedValue(new Error("source offline"));
  const result = await discoverNews(3, false, new AbortController().signal, () => {});
  expect(result.inputs).toEqual([]);
  expect(result.discovery.sources.slice(0, 2).every((s) => s.state === "failed")).toBe(true);
  expect(JSON.stringify(result)).not.toContain("secret-token");
});
it("aborts discovery without selecting stories for a later model call", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(discoverNews(3, false, controller.signal, () => {})).rejects.toThrow();
  expect(fixtures.gh).not.toHaveBeenCalled();
});

it("sends exactly the source-balanced selection to Jev instead of the original relevance order", async () => {
  fixtures.gh.mockResolvedValue([story("release-one", 90), story("release-two", 90)]);
  const result = await discoverNews(3, false, new AbortController().signal, () => {});
  expect(result.discovery.selectedIds).toEqual(["release-one", "discussion", "release-two"]);
  expect(result.inputs.map((s) => s.id)).toEqual(result.discovery.selectedIds);
});

it("skips unchanged evaluated excerpts while changed evidence can reach Jev again", async () => {
  const { readHuntInbox } = await import("@/newsroom/jev/inbox");
  const input = story("release", 90);
  vi.mocked(readHuntInbox).mockResolvedValueOnce([
    {
      candidate: { ...input, source: "github" },
      firstSeenAt: input.publishedAt,
      lastSeenAt: input.publishedAt,
      evaluation: {
        runId: "synthetic-run",
        evaluatedAt: input.publishedAt,
        decision: { category: "Release", probabilities: { Release: 0.9 }, needsReview: false },
      },
    },
  ]);
  const result = await discoverNews(5, false, new AbortController().signal, () => {});
  expect(result.inputs.map((s) => s.id)).toEqual(["discussion"]);
  expect(result.discovery.candidates.find((s) => s.id === "release")?.evaluated).toBe(true);
});
