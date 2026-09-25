import { describe, expect, it } from "vitest";
import { redditAtomPosts } from "@/newsroom/providers/reddit-atom";

// Synthetic Atom; malicious content must remain inert and cannot supply fake identities.
const entry = `<entry><id>t3_abc123</id><title>Hermes Agent shipped &amp; patched</title><published>2026-09-24T18:00:00Z</published><updated>2026-09-25T01:00:00Z</updated><link href="https://www.reddit.com/r/LocalLLaMA/comments/abc123/example/"/><content type="html">&lt;div class="md"&gt;&lt;p&gt;Hermes Agent fixed a crash.&lt;/p&gt;&lt;p&gt;New &amp;amp; improved.&lt;br/&gt;Shipped.&lt;/p&gt;&lt;script&gt;fake news&lt;/script&gt;&lt;/div&gt;submitted by somebody [link] [comments]</content></entry>`;
const feed = (body: string) => `<feed xmlns="http://www.w3.org/2005/Atom">${body}</feed>`;

describe("Reddit Atom parsing", () => {
  it("decodes source text while discarding markup, scripts and submission boilerplate", () => {
    expect(redditAtomPosts(feed(entry))).toEqual([
      {
        id: "abc123",
        title: "Hermes Agent shipped & patched",
        publishedAt: "2026-09-24T18:00:00Z",
        url: "https://www.reddit.com/r/LocalLLaMA/comments/abc123/example/",
        text: "Hermes Agent fixed a crash. New & improved. Shipped.",
      },
    ]);
  });
  it.each([
    "<html><body>Blocked</body></html>",
    '<feed xmlns="https://evil.invalid"/>',
    '<feed xmlns="http://www.w3.org/2005/Atom"><entry></feed>',
    '<!DOCTYPE feed [<!ENTITY secret SYSTEM "file:///etc/passwd">]>' + feed(entry),
    "x".repeat(1_000_001),
  ])("rejects non-Atom, malformed, oversized and DTD payloads", (xml) => {
    expect(() => redditAtomPosts(xml)).toThrow("Invalid Reddit Atom response.");
  });
  it("ignores nested entries and entries from another namespace", () => {
    expect(
      redditAtomPosts(
        feed(
          `<foreign>${entry}</foreign>${entry.replace("<entry>", '<entry xmlns="https://evil.invalid">')}`,
        ),
      ),
    ).toEqual([]);
  });
  it("never substitutes update time for missing publication time", () => {
    expect(redditAtomPosts(feed(entry.replace(/<published>.*?<\/published>/, "")))).toEqual([]);
  });
  it.each([
    "https://evil.invalid",
    "http://www.reddit.com",
    "https://user@www.reddit.com",
    "https://www.reddit.com:1234",
  ])("rejects the untrusted link origin %s", (origin) => {
    expect(redditAtomPosts(feed(entry.replace("https://www.reddit.com", origin)))).toEqual([]);
  });
});
