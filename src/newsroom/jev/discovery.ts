import "server-only";
import type { Story } from "../model/story";
import type { NewsProvider } from "../providers/types";
import { hermesHuntProviders } from "../providers/hermes-hunt";
import { readHuntInbox, rememberCandidates } from "./inbox";
import { sameInput } from "./inbox-model";
import { readXState } from "../browser-x/server";
import { xStory } from "../browser-x/model";
import type { Discovery, PublicInput } from "./model";

/** Fresh public requests only; saved X is explicitly separate from network collection. */
export async function discoverNews(
  count: number,
  includeX: boolean,
  signal: AbortSignal,
  emit: (snapshot: Discovery) => void,
): Promise<{ discovery: Discovery; inputs: PublicInput[] }> {
  const started = Date.now();
  const providers = hermesHuntProviders(true);
  const history = await readHuntInbox();
  const snapshot: Discovery = {
    stage: "collecting",
    startedAt: new Date(started).toISOString(),
    elapsedMs: 0,
    sources: providers.map((p) => ({
      id: p.id,
      label: p.label,
      kind: "network",
      state: "fetching",
      count: 0,
    })),
    candidates: [],
    selectedIds: [],
    selectionRule:
      "Unevaluated excerpts first, balanced across releases, projects, merged changes, discussions and saved X. New to this newsroom first, then newest within each channel. Unchanged evaluated excerpts are skipped. Jev evaluates only the selected 1, 3 or 5; initial selection is deterministic. New does not mean globally unknown.",
  };
  snapshot.sources.push({
    id: "saved-x",
    label: "X · saved browser sample",
    kind: "saved",
    state: includeX ? "fetching" : "skipped",
    count: 0,
    ...(!includeX ? { message: "Browser collection is disabled; no X request is made." } : {}),
  });
  const publish = () => {
    snapshot.elapsedMs = Date.now() - started;
    emit(structuredClone(snapshot));
  };
  const candidates = new Map<string, Story>();
  const since = new Date(started - 30 * 86400000).toISOString();
  const channels = new Map<string, string>();
  const add = (stories: Story[], channel: string) => {
    for (const story of stories) {
      if (!["github", "hackernews", "x"].includes(story.source) || story.publishedAt < since) continue;
      if (
        !candidates.has(story.id) &&
        ![...candidates.values()].some((s) => s.sourceUrl === story.sourceUrl)
      ) {
        candidates.set(story.id, story);
        channels.set(story.id, channel);
      }
    }
    snapshot.candidates = [...candidates.values()]
      .sort(
        (a, b) =>
          b.relevanceScore - a.relevanceScore ||
          b.publishedAt.localeCompare(a.publishedAt) ||
          a.id.localeCompare(b.id),
      )
      .map((s) => ({
        id: s.id,
        title: s.title.slice(0, 240),
        summary: s.summary.slice(0, 1200),
        channel: channels.get(s.id),
        sourceUrl: s.sourceUrl,
        source: s.source,
        publishedAt: s.publishedAt,
        relevanceScore: s.relevanceScore,
      }))
      .map((s) => {
        const previous = history.find((r) => r.candidate.sourceUrl === s.sourceUrl);
        return {
          ...s,
          newToNewsroom: !previous,
          evaluated: !!previous?.evaluation && sameInput(previous.candidate, s),
        };
      });
  };
  const collect = async (id: string, load: (signal: AbortSignal) => Promise<Story[]>) => {
    const source = snapshot.sources.find((s) => s.id === id)!;
    const at = Date.now();
    const controller = new AbortController();
    const combined = AbortSignal.any([signal, controller.signal]);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      const cancel = () => reject(new Error("Collection stopped"));
      combined.addEventListener("abort", cancel, { once: true });
      timer = setTimeout(() => controller.abort(), 12000);
    });
    try {
      signal.throwIfAborted();
      const stories = await Promise.race([load(combined), deadline]);
      signal.throwIfAborted();
      add(stories, id);
      source.state = "ready";
      source.count = snapshot.candidates.filter((s) => s.channel === id).length;
    } catch {
      source.state = "failed";
      source.message = signal.aborted
        ? "Collection cancelled."
        : "Source unavailable or timed out. No fabricated results or automatic retry.";
    } finally {
      clearTimeout(timer);
      controller.abort();
      source.elapsedMs = Date.now() - at;
      publish();
    }
  };
  publish();
  await Promise.all([
    ...providers.map((p: NewsProvider) =>
      collect(p.id, (s) => p.fetchStories({ now: snapshot.startedAt, since }, s)),
    ),
    ...(includeX
      ? [
          collect("saved-x", async () => {
            const state = await readXState();
            snapshot.sources.find((s) => s.id === "saved-x")!.capturedAt = state.lastCollectedAt;
            snapshot.sources.find((s) => s.id === "saved-x")!.message =
              "Previously captured posts; this run does not browse X.";
            return state.posts
              .filter((p) => p.publishedAt >= since)
              .slice(0, 20)
              .map(xStory);
          }),
        ]
      : []),
  ]);
  signal.throwIfAborted();
  await rememberCandidates(snapshot.candidates, snapshot.startedAt);
  const buckets = [...providers.map((p) => p.id), "saved-x"].map((channel) =>
    snapshot.candidates
      .filter((s) => s.channel === channel && !s.evaluated)
      .sort(
        (a, b) =>
          Number(b.newToNewsroom) - Number(a.newToNewsroom) ||
          b.publishedAt.localeCompare(a.publishedAt) ||
          b.relevanceScore - a.relevanceScore ||
          a.id.localeCompare(b.id),
      ),
  );
  const picked: PublicInput[] = [];
  while (picked.length < count && buckets.some((bucket) => bucket.length)) {
    for (const bucket of buckets) {
      const next = bucket.shift();
      if (next && picked.length < count) picked.push(next);
    }
  }
  snapshot.selectedIds = picked.map((s) => s.id);
  snapshot.stage = "selected";
  snapshot.finishedAt = new Date().toISOString();
  publish();
  return {
    discovery: snapshot,
    inputs: picked.map(({ id, title, summary, sourceUrl }) => ({ id, title, summary, sourceUrl })),
  };
}
