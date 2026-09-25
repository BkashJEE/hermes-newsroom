import { afterEach, describe, expect, it, vi } from "vitest";
import { redditProvider } from "@/newsroom/providers/reddit";
import { aggregateProviders } from "@/newsroom/providers/aggregate";

const query = { now: "2026-09-25T07:00:00.000Z", since: "2026-08-26T07:00:00.000Z" };
// Synthetic Reddit entries serialized as Atom; no claims about live content.
const post = {
  id: "abc123",
  name: "t3_abc123",
  title: "Nous Research released a Hermes Agent update",
  selftext: "The update fixed a Hermes Agent startup crash.",
  created_utc: Date.parse("2026-09-24T18:00:00Z") / 1000,
  permalink: "/r/LocalLLaMA/comments/abc123/synthetic/",
  subreddit: "LocalLLaMA",
  score: 999,
  num_comments: 90,
  url: "https://untrusted.example/linked-article",
};
const xml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
function atomResponse(body: unknown) {
  const listing = body as { kind?: string; data?: { children?: { kind?: string; data?: typeof post }[] } };
  if (listing.kind !== "Listing" || !Array.isArray(listing.data?.children)) return new Response("<invalid/>");
  return new Response(
    `<feed xmlns="http://www.w3.org/2005/Atom">${listing.data.children
      .map((child) => {
        const p = child?.data;
        if (!p) return "<entry/>";
        const time =
          typeof p.created_utc === "number" && p.created_utc > 0 && p.created_utc < 1e12
            ? new Date(p.created_utc * 1000).toISOString()
            : "bad-date";
        return `<entry><id>${child.kind}_${xml(p.id)}</id><title>${xml(p.title)}</title><published>${time}</published><link href="${xml(p.permalink.startsWith("/") && !p.permalink.startsWith("//") ? `https://www.reddit.com${p.permalink}` : p.permalink)}"/><content type="html">${xml(p.selftext ? `<div class="md"><p>${p.selftext}</p></div>` : "submitted by a user [link] [comments]")}</content></entry>`;
      })
      .join("")}</feed>`,
    { headers: { "Content-Type": "application/atom+xml" } },
  );
}
afterEach(() => vi.unstubAllGlobals());

describe("Reddit public Atom search", () => {
  it("rejects malformed records, deleted posts, wrong identities, dates and off-topic matches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        atomResponse({
          kind: "Listing",
          data: {
            children: [
              null,
              {},
              { kind: "t1", data: post },
              ...[
                post,
                { ...post, permalink: "//evil.test/r/x/comments/abc123/" },
                { ...post, permalink: "/r/test/comments/other/slug/" },
                { ...post, title: "Hermes handbags launched", selftext: "Fashion news" },
                { ...post, selftext: "[removed]" },

                ...[null, "1234", 0, 99999999999999999].map((created_utc) => ({ ...post, created_utc })),
              ].map((data) => ({ kind: "t3", data })),
            ],
          },
        }),
      ),
    );
    expect(await redditProvider(true).fetchStories(query, new AbortController().signal)).toHaveLength(1);
  });

  it("uses a real headline as evidence for link posts instead of inventing a body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        atomResponse({
          kind: "Listing",
          data: { children: [{ kind: "t3", data: { ...post, selftext: "" } }] },
        }),
      ),
    );
    const rows = await redditProvider(true).fetchStories(query, new AbortController().signal);
    expect(rows[0].summary).toBe(post.title);
    expect(rows[0].file.fullSummary).toBe(post.title);
    expect(rows[0].sourceCount).toBe(1);
  });

  it.each([403, 429, 500])("reports HTTP %s and never substitutes fixtures", async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("sensitive server message", { status })),
    );
    const feed = await aggregateProviders([redditProvider(true)], query);
    expect(feed.mode).toBe("live");
    expect(feed.stories).toEqual([]);
    expect(feed.providers[0]).toMatchObject({
      state: "error",
      message: `Reddit search returned HTTP ${status}.`,
    });
  });

  it.each([{}, { kind: "Listing", data: {} }, { kind: "Listing", data: { children: null } }])(
    "rejects malformed listings",
    async (body) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => atomResponse(body)),
      );
      await expect(redditProvider(true).fetchStories(query, new AbortController().signal)).rejects.toThrow(
        "Invalid Reddit Atom response.",
      );
    },
  );

  it("distinguishes valid empty results from transport and parse failures", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(atomResponse({ kind: "Listing", data: { children: [] } }))
      .mockResolvedValueOnce(new Response("not JSON"))
      .mockRejectedValueOnce(new Error("private network details"));
    vi.stubGlobal("fetch", fetcher);
    expect(await redditProvider(true).fetchStories(query, new AbortController().signal)).toEqual([]);
    await expect(redditProvider(true).fetchStories(query, new AbortController().signal)).rejects.toThrow(
      "Invalid Reddit Atom response.",
    );
    await expect(redditProvider(true).fetchStories(query, new AbortController().signal)).rejects.toThrow(
      "Reddit search is unavailable.",
    );
  });

  it("propagates timeout cancellation to the request", async () => {
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, init) => {
        requestSignal = init.signal;
        return new Promise((_resolve, reject) =>
          init.signal.addEventListener("abort", () => reject(new Error("aborted"))),
        );
      }),
    );
    const feed = await aggregateProviders([redditProvider(true)], query, { timeoutMs: 20 });
    expect(feed.providers[0].state).toBe("timeout");
    expect(requestSignal?.aborted).toBe(true);
  });

  it("maps Atom posts and actual evidence without treating links as sources", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      atomResponse({
        kind: "Listing",
        data: {
          children: [
            { kind: "t3", data: post },
            { kind: "t3", data: post },
          ],
        },
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    const signal = new AbortController().signal;
    const rows = await redditProvider(true).fetchStories(query, signal);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "reddit:abc123",
      source: "reddit",
      title: post.title,
      summary: post.selftext,
      publishedAt: "2026-09-24T18:00:00.000Z",
      detectedAt: query.now,
      sourceUrl: `https://www.reddit.com${post.permalink}`,
      sourceCount: 1,
      evidenceMeasured: false,
      evidenceScore: 0,
      status: "unconfirmed",
      momentum: { measured: false },
    });
    expect(rows[0].file.evidence).toHaveLength(1);
    expect(rows[0].file.evidence[0].claim).toBe(post.selftext);
    expect(rows[0].file.evidence[0].url).toBe(rows[0].sourceUrl);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    const params = new URL(String(url)).searchParams;
    expect(params.get("q")).toBe('"Hermes Agent" OR "Nous Research"');
    expect(params.get("sort")).toBe("new");
    expect(params.get("type")).toBe("link");
    expect(new URL(String(url)).pathname).toBe("/search.rss");
    expect(init?.headers).toMatchObject({
      Accept: "application/atom+xml",
      "User-Agent": expect.stringContaining("linux:hermes-newsroom:"),
    });
    expect(init?.signal).toBe(signal);
  });
});
