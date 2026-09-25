// Opt-in real network verification; never substitute fixtures when upstream fails.
import { expect, it } from "vitest";
import { redditProvider } from "@/newsroom/providers/reddit";
import { applyEditorialGate } from "@/newsroom/model/newsworthy";

it.runIf(process.env.NEWSROOM_LIVE_REDDIT === "1")(
  "collects actual Reddit Atom posts through the provider",
  async () => {
    const now = new Date();
    const rows = await redditProvider(true).fetchStories(
      {
        now: now.toISOString(),
        since: new Date(now.getTime() - 30 * 86400000).toISOString(),
      },
      AbortSignal.timeout(20000),
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.sourceUrl).toMatch(/^https:\/\/www\.reddit\.com\/r\//);
      expect(row.sourceCount).toBe(1);
      expect(row.evidenceMeasured).toBe(false);
      expect(row.file.evidence[0].url).toBe(row.sourceUrl);
    }
    const gate = applyEditorialGate(rows);
    process.stdout.write(
      JSON.stringify(
        {
          checkedAt: now.toISOString(),
          collected: rows.length,
          keptByGate: gate.kept.length,
          droppedByGate: gate.dropped.length,
          sample: rows
            .slice(0, 3)
            .map(({ id, title, publishedAt, sourceUrl }) => ({ id, title, publishedAt, sourceUrl })),
        },
        null,
        2,
      ) + "\n",
    );
  },
  25000,
);
