import { afterEach, expect, it, vi } from "vitest";
import { changeBookmark } from "../../scripts/newsroom-archive-client.mjs";
afterEach(() => vi.unstubAllGlobals());
it("agent can remove a retained bookmark without a live feed or desktop browser", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ records: [{ story: { id: "old" }, mode: "live" }] }))
    .mockResolvedValueOnce(Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetch);
  expect(await changeBookmark("http://127.0.0.1:3520", "unsave", "old")).toMatchObject({
    permanent: true,
    saved: false,
  });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
    action: "story",
    story: { id: "old" },
    mode: "live",
    saved: false,
  });
});
it("agent reports an unsuccessful durable write as an error", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(Response.json({ records: [{ story: { id: "old" }, mode: "fixture" }] }))
      .mockResolvedValueOnce(Response.json({ error: "Disk unavailable" }, { status: 503 })),
  );
  await expect(changeBookmark("http://127.0.0.1:3520", "save", "old")).rejects.toThrow("Disk unavailable");
});
it("agent refuses an unknown story instead of creating a blank record", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ records: [] }))
    .mockResolvedValueOnce(Response.json({ stories: [], mode: "live" }));
  vi.stubGlobal("fetch", fetch);
  await expect(changeBookmark("http://127.0.0.1:3520", "save", "missing")).rejects.toThrow("Story not found");
  expect(fetch).toHaveBeenCalledTimes(2);
});
