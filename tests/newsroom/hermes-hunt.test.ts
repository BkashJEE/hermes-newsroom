import { afterEach, expect, it, vi } from "vitest";
import { hermesHuntProviders } from "@/newsroom/providers/hermes-hunt";
const now = new Date().toISOString();
const query = { now, since: new Date(Date.now() - 30 * 86400000).toISOString() };
afterEach(() => vi.unstubAllGlobals());
it("hunts public projects without calling unrelated top stories or promoting a push to a release", async () => {
  const fetcher = vi.fn(async () =>
    Response.json({
      items: [
        {
          id: 1,
          full_name: "example/synthetic",
          private: false,
          fork: false,
          archived: false,
          html_url: "https://github.com/example/synthetic",
          pushed_at: now,
          description: "Synthetic Hermes Agent calendar workflow",
          topics: ["hermes-agent"],
        },
        { id: 2, private: true, html_url: "https://github.com/example/private", pushed_at: now },
        { id: 3, private: false, html_url: "https://evil.test/repo", pushed_at: now },
        { id: 4, private: false, html_url: "https://github.com/example/future", pushed_at: "2099-01-01" },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  const result = await hermesHuntProviders(true)[1].fetchStories(query, new AbortController().signal);
  expect(result).toHaveLength(1);
  expect(result[0].summary).toContain("not a release");
  expect(result[0].summary).toContain("calendar workflow");
  expect(result[0].status).toBe("unconfirmed");
  expect(result[0].type).toBe("community");
  expect(result[0].momentum.measured).toBe(false);
  expect(String(fetcher.mock.calls[0])).not.toContain("topstories");
});
it("requires an upstream merge timestamp and preserves merge versus release distinction", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        items: [
          {
            id: 1,
            title: "Synthetic fix",
            html_url: "https://github.com/NousResearch/hermes-agent/pull/1",
            body: "Fixes a workflow",
            pull_request: { merged_at: now },
          },
          {
            id: 2,
            title: "Unmerged",
            html_url: "https://github.com/NousResearch/hermes-agent/pull/2",
            pull_request: {},
          },
        ],
      }),
    ),
  );
  const result = await hermesHuntProviders(true)[2].fetchStories(query, new AbortController().signal);
  expect(result).toHaveLength(1);
  expect(result[0].summary).toContain("not necessarily in a published release");
  expect(result[0].type).toBe("developing");
  expect(result[0].updateBrief?.groups.better).toContain("Fixes a workflow");
});
it("uses targeted HN search and does not invent article contents when there is no excerpt", async () => {
  const fetcher = vi.fn(async () =>
    Response.json({ hits: [{ objectID: "123", title: "Synthetic Hermes workflow", created_at: now }] }),
  );
  vi.stubGlobal("fetch", fetcher);
  const result = await hermesHuntProviders(true)[3].fetchStories(query, new AbortController().signal);
  expect(result[0].sourceUrl).toBe("https://news.ycombinator.com/item?id=123");
  expect(result[0].summary).toContain("article has not been fetched");
  expect(String(fetcher.mock.calls[0])).toContain("search_by_date");
});
it("surfaces rate limits and incomplete search instead of silently reporting empty success", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({}, { status: 429 })),
  );
  await expect(
    hermesHuntProviders(true)[1].fetchStories(query, new AbortController().signal),
  ).rejects.toThrow("429");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ items: [], incomplete_results: true })),
  );
  await expect(
    hermesHuntProviders(true)[1].fetchStories(query, new AbortController().signal),
  ).rejects.toThrow("Incomplete");
});
