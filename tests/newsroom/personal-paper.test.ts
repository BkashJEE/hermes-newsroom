import { describe, expect, it } from "vitest";
import { personalPages } from "@/newsroom/personal/paper";
import type { PersonalEdition } from "@/newsroom/personal/types";

describe("personal reading pages", () => {
  it("always supplies the four original sections, even before generation", () => {
    expect(personalPages(null).map((p) => p.title)).toEqual([
      "Your Morning",
      "Your Agents at Work",
      "Intelligence & Opportunity",
      "Life & the Long View",
    ]);
    expect(personalPages(null).every((p) => p.sections.length === 0 && p.empty.length > 0)).toBe(true);
  });
  it("reflows old editions without changing them and bounds the printed excerpts", () => {
    const edition = {
      sections: [
        {
          title: "Work reported",
          bullets: Array.from({ length: 20 }, () => ({
            text: "A synthetic reported outcome. ".repeat(30),
            sources: ["S1", "S2", "S3", "S4"],
          })),
        },
      ],
    } as PersonalEdition;
    const original = JSON.stringify(edition);
    const pages = personalPages(edition);
    expect(pages[1].sections).toHaveLength(1);
    expect(pages[1].sections[0].bullets).toHaveLength(8);
    expect(pages[1].sections[0].bullets[0].text.length).toBeLessThanOrEqual(261);
    expect(pages[1].sections[0].bullets[0].sources).toEqual(["S1", "S2", "S3"]);
    expect(pages[1].omitted).toBe(12);
    expect(JSON.stringify(edition)).toBe(original);
  });
  it("respects explicit page assignments for newly written editions", () => {
    const edition = {
      sections: [
        {
          page: 3,
          title: "A sourced experiment",
          bullets: [{ text: "Synthetic research note.", sources: ["S1"] }],
        },
      ],
    } as PersonalEdition;
    expect(personalPages(edition)[2].sections[0].title).toBe("A sourced experiment");
  });
});
