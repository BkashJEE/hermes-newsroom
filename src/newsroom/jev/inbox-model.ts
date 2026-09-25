import type { HuntCandidate, HuntRecord, RunSnapshot } from "./model";
export function sameInput(a: HuntCandidate, b: HuntCandidate) {
  return a.title === b.title && a.summary === b.summary && a.sourceUrl === b.sourceUrl;
}
export function mergeHunt(records: HuntRecord[], candidates: HuntCandidate[], now: string): HuntRecord[] {
  const byUrl = new Map(records.map((r) => [r.candidate.sourceUrl, r]));
  for (const candidate of candidates) {
    const old = byUrl.get(candidate.sourceUrl);
    byUrl.set(candidate.sourceUrl, {
      candidate,
      firstSeenAt: old?.firstSeenAt ?? now,
      lastSeenAt: now,
      ...(old?.evaluation && sameInput(old.candidate, candidate) ? { evaluation: old.evaluation } : {}),
    });
  }
  const since = Date.parse(now) - 30 * 86400000;
  return [...byUrl.values()]
    .filter((r) => Date.parse(r.candidate.publishedAt) >= since)
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
    .slice(0, 300);
}
export function applyHuntRun(records: HuntRecord[], run: RunSnapshot): HuntRecord[] {
  if (run.mode !== "live" || run.purpose === "benchmark") return records;
  return records.map((record) => {
    const item = run.items.find(
      (i) =>
        i.sourceUrl === record.candidate.sourceUrl &&
        i.title === record.candidate.title &&
        i.summary === record.candidate.summary,
    );
    if (!item?.decision || !["classified", "review"].includes(item.status)) return record;
    return {
      ...record,
      evaluation: {
        decision: item.decision,
        runId: run.id,
        evaluatedAt: run.finishedAt ?? run.startedAt,
        elapsedMs: item.elapsedMs,
      },
    };
  });
}
