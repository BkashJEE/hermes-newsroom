import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parsePosts, xStory } from "@/newsroom/browser-x/model";
const tempHome = mkdtempSync(join(tmpdir(), "newsroom-x-test-"));
const { createXStore } = await import("@/newsroom/browser-x/server");
const { readXState, updateX } = createXStore(join(tempHome, ".local/state/omarchy-command-center/browser-x"));
const post = {
  url: "https://x.com/example/status/1234567890123456789",
  text: "Synthetic Hermes Agent build",
  publishedAt: new Date().toISOString(),
};
beforeEach(() => rmSync(join(tempHome, ".local"), { recursive: true, force: true }));
afterAll(() => rmSync(tempHome, { recursive: true, force: true }));
describe("public X browser capture", () => {
  it("validates canonical post URLs, dates, text bounds and deduplicates", () => {
    expect(parsePosts([post, post])).toHaveLength(1);
    for (const url of [
      "https://x.com/messages",
      "https://example.com/user/status/1234567890123",
      post.url + "?token=private",
      "http://x.com/example/status/1234567890123",
    ])
      expect(() => parsePosts([{ ...post, url }])).toThrow();
    expect(() => parsePosts([{ ...post, text: "x".repeat(2001) }])).toThrow();
    expect(() => parsePosts([{ ...post, publishedAt: "invalid" }])).toThrow();
    expect(() => parsePosts(Array(21).fill(post))).toThrow();
    const story = xStory(parsePosts([post])[0]);
    expect(story.momentum.measured).toBe(false);
    expect(story.sourceCount).toBe(1);
    expect(story.status).toBe("unconfirmed");
  });
  it("deduplicates queued requests, permits one collector and rejects obsolete completions", async () => {
    const queued = await updateX("request");
    expect((await updateX("request")).job?.id).toBe(queued.job?.id);
    const claim = await updateX("claim");
    await expect(updateX("claim")).rejects.toThrow();
    await expect(updateX("complete", "wrong", [post])).rejects.toThrow();
    const complete = await updateX("complete", claim.job!.id, [post]);
    expect(complete.posts).toHaveLength(1);
    expect(complete.job?.state).toBe("complete");
    await expect(updateX("complete", claim.job!.id, [post])).rejects.toThrow();
    const next = await updateX("claim");
    await updateX("unavailable", next.job!.id);
    expect((await readXState()).posts).toHaveLength(1);
  });
});
