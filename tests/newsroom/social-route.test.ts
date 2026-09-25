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
