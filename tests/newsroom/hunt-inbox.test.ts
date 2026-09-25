import { expect, it } from "vitest";
import { applyHuntRun, mergeHunt } from "@/newsroom/jev/inbox-model";
import type { HuntCandidate, RunSnapshot, Decision } from "@/newsroom/jev/model";
const now = new Date().toISOString();
const c: HuntCandidate = {
  id: "synthetic",
  title: "Synthetic Hermes workflow",
  summary: "A synthetic public excerpt",
  sourceUrl: "https://example.com/synthetic",
  source: "github",
  publishedAt: now,
  relevanceScore: 70,
};
const decision: Decision = {
  category: "Use case",
  relevance: "Relevant",
  relevanceProbability: 0.9,
  probabilities: { "Use case": 0.9 },
  needsReview: false,
};
const run: RunSnapshot = {
  id: "run",
  mode: "live",
  purpose: "pipeline",
  model: "typesafe-ai/jev",
  startedAt: now,
  finishedAt: now,
  state: "complete",
  events: [],
  items: [{ ...c, status: "classified", decision, elapsedMs: 123 }],
};
it("retains decisions and first-seen dates on identical captures but invalidates changed excerpts", () => {
  const first = mergeHunt([], [c, { ...c, id: "duplicate" }], now);
  expect(first).toHaveLength(1);
  const evaluated = applyHuntRun(first, run);
  expect(evaluated[0].evaluation?.decision.category).toBe("Use case");
  const repeated = mergeHunt(evaluated, [c], new Date(Date.now() + 1000).toISOString());
  expect(repeated[0].firstSeenAt).toBe(now);
  expect(repeated[0].evaluation?.elapsedMs).toBe(123);
  const updated = mergeHunt(repeated, [{ ...c, summary: "Changed evidence" }], now);
  expect(updated[0].evaluation).toBeUndefined();
});
it("never persists synthetic model decisions as real findings or attaches a mismatched excerpt", () => {
  const records = mergeHunt([], [c], now);
  expect(applyHuntRun(records, { ...run, mode: "demo" })).toEqual(records);
  expect(applyHuntRun(records, { ...run, purpose: "benchmark" })).toEqual(records);
  expect(applyHuntRun(records, { ...run, items: [{ ...run.items[0], summary: "other" }] })).toEqual(records);
});
it("retains a bounded recent history", () => {
  const items = Array.from({ length: 310 }, (_, i) => ({
    ...c,
    id: String(i),
    sourceUrl: `https://example.com/${i}`,
  }));
  expect(mergeHunt([], items, now)).toHaveLength(300);
  expect(mergeHunt([], [{ ...c, publishedAt: "2000-01-01" }], now)).toHaveLength(0);
});
