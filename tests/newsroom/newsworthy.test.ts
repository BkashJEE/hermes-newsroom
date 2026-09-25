import { describe, expect, it } from "vitest";
import { applyEditorialGate, isNewsworthy, COMMENTARY_CAP } from "@/newsroom/model/newsworthy";
import type { Story } from "@/newsroom/model/story";

function story(over: Partial<Story> & { id: string }): Story {
  return {
    title: "Synthetic story",
    summary: "A synthetic summary long enough to carry real meaning for a reader.",
    sourceLabel: "Hermes Agent releases",
    sourceUrl: "https://example.test/a",
    publishedAt: "2026-09-24T10:00:00.000Z",
    ...over,
  } as Story;
}

const EXISTENCE = "this is not a release or proof of a working integration.";

describe("editorial gate", () => {
  it("uses the full Bluesky text so a truncated title cannot hide a question", () => {
    const text = `Has Nous Research released ${"a detailed new Hermes Agent integration ".repeat(10)}yet?`;
    expect(
      isNewsworthy(
        story({
          id: "long-question",
          source: "bluesky",
          title: text.slice(0, 250),
          summary: text,
        }),
      ),
    ).toBe(false);
  });
  it.each(["bluesky", "reddit"] as const)(
    "requires a reported event from %s, not mere existence",
    (source) => {
      for (const title of [
        "Hermes Agent exists and has a lot of useful tools for everyday tasks.",
        "I love Hermes Agent and Nous Research!",
        "What is Hermes Agent?",
        "We plan to release a Hermes Agent plugin next month.",
        "Nous Research will announce a new model tomorrow.",
        "Nous Research has not released the model.",
        "Has Nous Research released a new model?",
        "How to publish a Hermes Agent plugin",
        "Hermes Agent supports tools that were released years ago.",
        "Hermes Agent https://example.test/released/new-model",
      ])
        expect(isNewsworthy(story({ id: title, source, title, summary: title })), title).toBe(false);
      for (const title of [
        "Nous Research released a new Hermes Agent version.",
        "We shipped a Hermes Agent plugin today.",
        "Hermes Agent now supports the new API.",
        "Nous Research announced a new model.",
        "Hermes Agent crashes on startup after the update.",
      ])
        expect(isNewsworthy(story({ id: title, source, title, summary: title })), title).toBe(true);
    },
  );

  it("reports no-event rejection and caps each new social source independently", () => {
    const posts = (["bluesky", "reddit"] as const).flatMap((source) =>
      Array.from({ length: COMMENTARY_CAP + 2 }, (_, i) =>
        story({
          id: `${source}:${i}`,
          source,
          sourceLabel: source,
          title: "Nous Research released a new model.",
          summary: "Nous Research released a new model.",
          publishedAt: new Date(Date.parse("2026-09-24T10:00:00Z") - i * 60000).toISOString(),
        }),
      ),
    );
    const { kept, dropped } = applyEditorialGate([
      story({
        id: "mention",
        source: "bluesky",
        title: "Hermes Agent exists",
        summary: "Hermes Agent exists",
      }),
      ...posts,
    ]);
    expect(dropped).toContainEqual({ id: "mention", reason: "no-event" });
    for (const source of ["bluesky", "reddit"]) {
      expect(kept.filter((s) => s.source === source)).toHaveLength(COMMENTARY_CAP);
      expect(kept.some((s) => s.id === `${source}:0`)).toBe(true);
      expect(kept.some((s) => s.id === `${source}:${COMMENTARY_CAP}`)).toBe(false);
    }
  });

  it("keeps events: releases, merged changes and discussions", () => {
    expect(isNewsworthy(story({ id: "r1" }))).toBe(true);
    expect(
      isNewsworthy(
        story({ id: "r2", summary: "Rolls up 460 merged PRs into a tagged release for downstream users." }),
      ),
    ).toBe(true);
  });

  it("drops repo cards that only prove a repository exists", () => {
    const bare = story({
      id: "p1",
      sourceLabel: "Hermes project search",
      summary: `Topics: . Last code push: 2026-09-25T04:03:05.000Z; ${EXISTENCE}`,
    });
    expect(isNewsworthy(bare)).toBe(false);
    const thin = story({
      id: "p2",
      sourceLabel: "Hermes project search",
      summary: `A kit. Topics: . Last code push: 2026-09-25T04:03:05.000Z; ${EXISTENCE}`,
    });
    expect(isNewsworthy(thin)).toBe(false);
  });

  it("keeps a project card that actually describes itself", () => {
    const described = story({
      id: "p3",
      sourceLabel: "Hermes project search",
      summary: `Browser-native side panel for Hermes Agent that connects web context to your local runtime. Topics: ai-agent, browser-extension. Last code push: 2026-09-25T04:03:05.000Z; ${EXISTENCE}`,
    });
    expect(isNewsworthy(described)).toBe(true);
  });

  it("caps low-evidence commentary so one source cannot fill the edition", () => {
    const posts = Array.from({ length: COMMENTARY_CAP + 12 }, (_, i) =>
      story({
        id: `x${i}`,
        sourceLabel: "X · browser search sample",
        publishedAt: new Date(Date.parse("2026-09-24T10:00:00.000Z") - i * 60_000).toISOString(),
      }),
    );
    const news = [story({ id: "release" }), ...posts];
    const { kept, dropped } = applyEditorialGate(news);
    const commentary = kept.filter((s) => s.sourceLabel.startsWith("X "));
    expect(commentary).toHaveLength(COMMENTARY_CAP);
    // The newest survive, and real news is never capped.
    expect(commentary[0].id).toBe("x0");
    expect(kept.some((s) => s.id === "release")).toBe(true);
    expect(dropped.every((d) => d.reason === "commentary-cap")).toBe(true);
  });

  it("reports why each story was dropped, and keeps the order of what remains", () => {
    const input = [
      story({ id: "a" }),
      story({
        id: "b",
        sourceLabel: "Hermes project search",
        summary: `Topics: . Last code push: 2026-09-25T04:03:05.000Z; ${EXISTENCE}`,
      }),
      story({ id: "c" }),
    ];
    const { kept, dropped } = applyEditorialGate(input);
    expect(kept.map((s) => s.id)).toEqual(["a", "c"]);
    expect(dropped).toEqual([{ id: "b", reason: "existence-only" }]);
  });
});
