import { randomUUID } from "node:crypto";
import { JevFailure, type Decision, type Mode, type PublicInput, type RunSnapshot } from "./model";

export async function runClassification(
  inputs: PublicInput[],
  mode: Mode,
  signal: AbortSignal,
  evaluate: (story: PublicInput, signal: AbortSignal) => Promise<Decision>,
  emit: (run: RunSnapshot) => void,
): Promise<RunSnapshot> {
  const run: RunSnapshot = {
    id: randomUUID(),
    mode,
    model: mode === "live" ? "typesafe-ai/jev" : "Scripted demo · no model",
    startedAt: new Date().toISOString(),
    state: "running",
    items: inputs.map((s) => ({ ...s, status: "queued" })),
    events: [],
  };
  const publish = (message: string) => {
    run.events.push({ at: new Date().toISOString(), message });
    emit(structuredClone(run));
  };
  publish(`${inputs.length} ${mode === "demo" ? "synthetic examples" : "public stories"} queued`);
  for (const item of run.items) {
    if (signal.aborted) break;
    item.status = "processing";
    publish(`Processing: ${item.title}`);
    const start = performance.now();
    try {
      item.decision = await evaluate(item, signal);
      signal.throwIfAborted();
      item.elapsedMs = Math.round(performance.now() - start);
      item.status = item.decision.needsReview ? "review" : "classified";
      publish(`${item.status === "review" ? "Needs review" : "Classified"}: ${item.title}`);
    } catch (error) {
      if (signal.aborted) break;
      item.status = "failed";
      item.elapsedMs = Math.round(performance.now() - start);
      item.error =
        error instanceof JevFailure
          ? error.message
          : "Jev evaluation failed. The cause was not retained; inspect provider access before another run.";
      publish(`Failed: ${item.title}`);
      // Stop the batch on provider/validation/budget failure instead of spending on more calls.
      run.state = "failed";
      break;
    }
  }
  for (const item of run.items)
    if (item.status === "queued" || item.status === "processing") {
      item.status = "cancelled";
      delete item.decision;
    }
  run.state = signal.aborted ? "cancelled" : run.state === "failed" ? "failed" : "complete";
  run.finishedAt = new Date().toISOString();
  publish(`Run ${run.state}`);
  return run;
}
