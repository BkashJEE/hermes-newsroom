import { describe, expect, it } from "vitest";
import {
  BENCHMARK,
  evaluationInput,
  parseDecision,
  routing,
  runMetrics,
  type RunSnapshot,
} from "@/newsroom/jev/model";
describe("Jev routing and honest metrics", () => {
  it("keeps labels out of inputs and requests relevance separately from category", () => {
    const input = evaluationInput(BENCHMARK[0].input);
    expect(input.state).not.toHaveProperty("relevance");
    expect(input.state).not.toHaveProperty("category");
    expect(input.questions.relevance.criteria.Unclear).toBeTruthy();
  });
  it("routes uncertain or missing relevance to review, not automatic acceptance", () => {
    const decision = {
      category: "Build" as const,
      probabilities: { Build: 0.9 },
      needsReview: false,
      relevance: "Relevant" as const,
      relevanceProbability: 0.9,
    };
    expect(routing(decision)).toBe("Keep");
    expect(routing({ ...decision, relevance: "Not relevant" })).toBe("Drop");
    expect(routing({ ...decision, relevanceProbability: 0.5 })).toBe("Review");
    expect(routing({ ...decision, relevance: undefined })).toBe("Review");
    expect(() =>
      parseDecision({
        model: "typesafe-ai/jev",
        answers: {
          category: { type: "choice", choice: "Build" },
          relevance: { type: "choice", choice: "Relevant", probabilities: { Relevant: 2 } },
        },
      }),
    ).toThrow();
  });
  it("calculates measured timing and label agreement, never calls probability accuracy", () => {
    const run: RunSnapshot = {
      id: "test",
      mode: "live",
      model: "typesafe-ai/jev",
      state: "complete",
      startedAt: new Date().toISOString(),
      events: [],
      purpose: "benchmark",
      items: BENCHMARK.map((b, i) => ({
        ...b.input,
        status: "classified",
        elapsedMs: 100 * (i + 1),
        decision: {
          category: i === 0 ? "Other" : b.category,
          probabilities: {},
          needsReview: false,
          relevance: b.relevance,
        },
      })),
    };
    expect(runMetrics(run)).toMatchObject({
      accuracy: 80,
      correct: 4,
      labelled: 5,
      meanMs: 300,
      p95Ms: 500,
      relevanceCorrect: 5,
    });
    expect(runMetrics({ ...run, mode: "demo" }).accuracy).toBeNull();
    expect(runMetrics({ ...run, purpose: "hunt" }).accuracy).toBeNull();
    expect(runMetrics({ ...run, purpose: "hunt" }, { [run.items[0].id]: "Other" })).toMatchObject({
      accuracy: 100,
      labelled: 1,
      correct: 1,
    });
  });
});
