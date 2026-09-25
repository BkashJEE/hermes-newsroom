import { afterEach, describe, expect, it, vi } from "vitest";
import { blueskyProvider } from "@/newsroom/providers/bluesky";
import { aggregateProviders } from "@/newsroom/providers/aggregate";

const query = { now: "2026-09-25T07:00:00.000Z", since: "2026-08-26T07:00:00.000Z" };
// Synthetic API response, not a captured post or live result.
const post = {
  uri: "at://did:plc:synthetic/app.bsky.feed.post/abc123",
  author: { did: "did:plc:synthetic", handle: "synthetic.test" },
  record: { text: "Nous Research released a new Hermes Agent version.", createdAt: "2026-09-24T18:00:00Z" },
  indexedAt: "2026-09-25T06:00:00Z",
  likeCount: 500,
  repostCount: 90,
};
afterEach(() => vi.unstubAllGlobals());

describe("Bluesky public search", () => {
  it("drops malformed, unrelated, stale and future posts without using indexedAt as publication", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          posts: [
            post,
            null,
            {},
            { ...post, uri: "https://evil.test/post" },
            { ...post, author: { did: "did:plc:other" } },
            ...[undefined, "bad-date", "2026-01-01", "2027-01-01"].map((createdAt) => ({
              ...post,
              record: { ...post.record, createdAt },
            })),
            { ...post, record: { ...post.record, text: "Hermes scarves launched today." } },
          ],
        }),
      ),
    );
    expect(await blueskyProvider(true).fetchStories(query, new AbortController().signal)).toHaveLength(1);
  });

  it.each([403, 429, 500])("surfaces HTTP %s without exposing the upstream body", async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("private upstream body", { status })),
    );
    const feed = await aggregateProviders([blueskyProvider(true)], query);
    expect(feed.providers[0]).toMatchObject({
      state: "error",
      storyCount: 0,
      message: `Bluesky search returned HTTP ${status}.`,
    });
    expect(feed.stories).toEqual([]);
  });

  it.each([{}, { posts: null }, { error: "secret" }])(
    "rejects malformed response envelopes",
    async (body) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => Response.json(body)),
      );
      await expect(blueskyProvider(true).fetchStories(query, new AbortController().signal)).rejects.toThrow(
        "Invalid Bluesky search response.",
      );
    },
  );

  it("does not turn a failed second query into healthy partial coverage", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ posts: [post] }))
        .mockResolvedValueOnce(new Response("denied", { status: 403 })),
    );
    const feed = await aggregateProviders([blueskyProvider(true)], query);
    expect(feed.providers[0].state).toBe("error");
    expect(feed.stories).toEqual([]);
  });

  it("bounds response processing, does not chase cursors or linked content", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        posts: Array.from({ length: 80 }, (_, i) => ({
          ...post,
          uri: `at://did:plc:synthetic/app.bsky.feed.post/p${i}`,
        })),
        cursor: "next",
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    expect(await blueskyProvider(true).fetchStories(query, new AbortController().signal)).toHaveLength(50);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("reuses only a covering cache window and honours cancellation even on cache hits", async () => {
    const fetcher = vi.fn(async () => Response.json({ posts: [post] }));
    vi.stubGlobal("fetch", fetcher);
    await blueskyProvider(true).fetchStories(query, new AbortController().signal);
    const cachedRows = await blueskyProvider().fetchStories(
      { ...query, now: "2026-09-25T07:01:00Z" },
      new AbortController().signal,
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(cachedRows[0].detectedAt).toBe(query.now);
    await blueskyProvider().fetchStories(
      { ...query, since: "2026-08-01T00:00:00Z" },
      new AbortController().signal,
    );
    expect(fetcher).toHaveBeenCalledTimes(4);
    const controller = new AbortController();
    controller.abort();
    await expect(blueskyProvider().fetchStories(query, controller.signal)).rejects.toThrow();
  });

  it("searches both phrases and maps unique posts without invented evidence", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ posts: [post] }));
    vi.stubGlobal("fetch", fetcher);
    const signal = new AbortController().signal;
    const rows = await blueskyProvider(true).fetchStories(query, signal);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: `bluesky:${post.uri}`,
      source: "bluesky",
      title: post.record.text,
      summary: post.record.text,
      publishedAt: "2026-09-24T18:00:00.000Z",
      detectedAt: query.now,
      sourceUrl: "https://bsky.app/profile/did:plc:synthetic/post/abc123",
      sourceCount: 1,
      evidenceScore: 0,
      evidenceMeasured: false,
      status: "unconfirmed",
      momentum: { measured: false },
    });
    expect(rows[0].file.evidence).toEqual([
      {
        id: `${rows[0].id}:source`,
        claim: post.record.text,
        sourceLabel: rows[0].sourceLabel,
        url: rows[0].sourceUrl,
      },
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.map(([url]) => new URL(String(url)).searchParams.get("q"))).toEqual([
      '"Hermes Agent"',
      '"Nous Research"',
    ]);
    for (const [url, init] of fetcher.mock.calls as unknown as [string, RequestInit][]) {
      expect(new URL(url).origin).toBe("https://public.api.bsky.app");
      expect(new URL(url).searchParams.get("sort")).toBe("latest");
      expect(new URL(url).searchParams.get("since")).toBe(query.since);
      expect(init.signal).toBe(signal);
      expect(init.cache).toBe("no-store");
      expect(init.headers).not.toHaveProperty("Authorization");
    }
  });
});
