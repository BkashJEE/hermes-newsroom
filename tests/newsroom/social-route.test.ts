import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/newsroom/route";
import { socialStory } from "@/newsroom/providers/social-search";
import { sourceNotConnected } from "@/newsroom/model/source-availability";

vi.mock("@/newsroom/config/load-config", () => ({
  loadNewsroomConfig: async () => ({
    liveSources: true,
    watchlists: [],
    personalDaily: { enabled: false },
    xBrowser: { enabled: false },
  }),
}));
vi.mock("@/newsroom/providers/registry", () => ({
  buildProviders: () => [
    {
      id: "bluesky-search",
      kind: "live",
      label: "Synthetic Bluesky provider",
      sources: ["bluesky"],
      fetchStories: async () =>
        ["Nous Research released a new model.", "Hermes Agent exists."].map((text, i) =>
          socialStory({
            id: `synthetic:${i}`,
            source: "bluesky",
            label: "Bluesky",
            url: "https://example.test/post",
            title: text,
            text,
            publishedAt: "2026-09-25T00:00:00.000Z",
            now: "2026-09-25T07:00:00.000Z",
          }),
        ),
    },
  ],
}));
afterEach(() => vi.unstubAllGlobals());
it("gates the API response and reports the new live source families", async () => {
  const response = await GET(new NextRequest("http://localhost/api/newsroom"));
  const feed = await response.json();
  expect(feed.stories.map((s: { id: string }) => s.id)).toEqual(["synthetic:0"]);
  expect(feed.filteredOut).toBe(1);
  expect(feed.connectedSources).toEqual(["github", "hackernews", "bluesky", "reddit"]);
  expect(sourceNotConnected("live", "bluesky")).toBe(false);
  expect(sourceNotConnected("live", "reddit")).toBe(false);
  expect(sourceNotConnected("live", "facebook")).toBe(true);
});

it("ships the reasoning with the feed, not just a count of what it hid", async () => {
  const response = await GET(new NextRequest("http://localhost/api/newsroom"));
  const feed = await response.json();
  expect(feed.collection).toMatchObject({ collected: 2, kept: 1, excluded: 1 });
  expect(feed.collection.reasons).toHaveLength(1);
  const [reason] = feed.collection.reasons;
  expect(reason.reason).toBe("no-event");
  expect(reason.rule).toContain("reporting something that occurred");
  // The excluded item is named and linked, so the decision can be checked.
  expect(reason.examples[0]).toMatchObject({ id: "synthetic:1", sourceLabel: "Bluesky" });
});
