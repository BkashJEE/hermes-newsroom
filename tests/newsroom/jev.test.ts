import { describe, expect, it, vi } from "vitest";
import {
  DEMO_STORIES,
  evaluationInput,
  JevFailure,
  parseDecision,
  type RunSnapshot,
} from "@/newsroom/jev/model";
import { runClassification } from "@/newsroom/jev/runner";
const answer = {
  model: "typesafe-ai/jev",
  answers: { category: { type: "choice", choice: "Build", probabilities: { Build: 0.8, Other: 0.2 } } },
  usage: { totalTokens: 40 },
};
describe("Jev decisions and process events", () => {
  it("accepts typed output and treats missing probabilities as needing review", () => {
    expect(parseDecision(answer)).toMatchObject({ category: "Build", needsReview: false, tokens: 40 });
    expect(
      parseDecision({ ...answer, answers: { category: { type: "choice", choice: "Build" } } }).needsReview,
    ).toBe(true);
    for (const patch of [
      { model: "other" },
      { answers: { category: { type: "choice", choice: "execute" } } },
      { answers: { category: { type: "choice", choice: "Build", probabilities: { Build: 2 } } } },
    ])
      expect(() => parseDecision({ ...answer, ...patch })).toThrow();
  });
  it("only passes public text into the evaluator; never passes paths or source metadata", () => {
    const input = evaluationInput({ ...DEMO_STORIES[0], sourceUrl: "https://example.com" });
    expect(Object.keys(input.state)).toEqual(["title", "summary"]);
    expect(input.questions.category.criteria.Other).toBeTruthy();
  });
  it("emits queued, processing and actual results in order", async () => {
    const events: RunSnapshot[] = [];
    const evaluate = vi.fn(async () => parseDecision(answer));
    const result = await runClassification(
      DEMO_STORIES.slice(0, 2),
      "live",
      new AbortController().signal,
      evaluate,
      (e) => events.push(e),
    );
    expect(events[0].items.every((i) => i.status === "queued")).toBe(true);
    expect(events[1].items[0].status).toBe("processing");
    expect(events[1].items[0].decision).toBeUndefined();
    expect(events[2].items[0].decision?.category).toBe("Build");
    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(result.state).toBe("complete");
  });
  it("cancellation stops further calls and marks unfinished stories", async () => {
    const controller = new AbortController();
    const evaluate = vi.fn(async () => {
      controller.abort();
      return parseDecision(answer);
    });
    const result = await runClassification(DEMO_STORIES, "live", controller.signal, evaluate, () => {});
    expect(evaluate).toHaveBeenCalledOnce();
    expect(result.state).toBe("cancelled");
    expect(result.items.every((i) => i.status === "cancelled" && !i.decision)).toBe(true);
  });
  it("provider errors stop the batch, redact error detail and do not retry", async () => {
    const evaluate = vi.fn(async () => {
      throw new Error("private synthetic diagnostic");
    });
    const result = await runClassification(
      DEMO_STORIES,
      "live",
      new AbortController().signal,
      evaluate,
      () => {},
    );
    expect(evaluate).toHaveBeenCalledOnce();
    expect(result.state).toBe("failed");
    expect(result.items[0].status).toBe("failed");
    expect(JSON.stringify(result)).not.toContain("private synthetic diagnostic");
    expect(result.items[1].status).toBe("cancelled");
  });
  it("retains a safe Gateway failure reason and leaves later stories unattempted", async () => {
    const evaluate = vi.fn(async () => {
      throw new JevFailure("credits");
    });
    const result = await runClassification(
      DEMO_STORIES.slice(0, 3),
      "live",
      new AbortController().signal,
      evaluate,
      () => {},
    );
    expect(evaluate).toHaveBeenCalledOnce();
    expect(result.items[0].error).toContain("insufficient credits");
    expect(result.items.slice(1).map((item) => item.status)).toEqual(["cancelled", "cancelled"]);
  });
});
