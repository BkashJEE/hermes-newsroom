import { describe, expect, it } from "vitest";
import { newspaperExcerpt, selectNewspaper, sourceHref } from "@/newsroom/model/newspaper";
import { fixtureStories, story } from "./helpers";

describe("newspaper selection", () => {
  it("excludes dismissed stories, reserves specialist pages and never repeats a story", () => {
    const stories = fixtureStories();
    stories[0].dismissed = true;
    const pages = selectNewspaper(stories);
    const selected = pages.flatMap((page) => page.stories);
    expect(selected.some((item) => item.id === stories[0].id)).toBe(false);
    expect(new Set(selected.map((item) => item.id)).size).toBe(selected.length);
    expect(pages.every((page) => page.stories.length <= 3)).toBe(true);
    expect(pages[1].stories.every((item) => ["build", "research"].includes(item.type))).toBe(true);
    expect(
      pages[2].stories.every((item) => ["community", "pain-point", "opportunity"].includes(item.type)),
    ).toBe(true);
  });
  it("promotes the only story without copying it onto two pages", () => {
    const pages = selectNewspaper([story({ type: "build" })]);
    expect(pages[0].stories).toHaveLength(1);
    expect(pages[1].stories).toHaveLength(0);
    expect(selectNewspaper([]).every((page) => !page.stories.length && page.empty)).toBe(true);
  });
  it("keeps extracts bounded and refuses executable source URLs", () => {
    expect(newspaperExcerpt("<b>News</b> **today**")).toBe("News today");
    expect(newspaperExcerpt("word ".repeat(200), 100).length).toBeLessThanOrEqual(100);
    expect(sourceHref("javascript:alert(1)")).toBeUndefined();
    expect(sourceHref("https://example.com/report")).toBe("https://example.com/report");
  });
});
