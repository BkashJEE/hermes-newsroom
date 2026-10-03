import type { Story } from "./story";

/**
 * Editorial gate for the live feed.
 *
 * A Newsroom reports events. Search backends also return *existence* — a repo that
 * merely exists, a passing mention — which is not news. This drops those and caps
 * any single low-evidence source so it cannot drown the edition, without ever
 * inventing or reordering by anything other than what the providers supplied.
 *
 * Every rule here is deterministic and explainable; nothing is scored by a model.
 */

/** A project card whose body is only boilerplate: no real description, no topics. */
const NO_SUBSTANCE = /^\s*(Topics:\s*[.,;]?\s*)?(Last code push:|this is not a release)/i;
const TOPICS_EMPTY = /Topics:\s*[.,;]\s/i;
/** Repo/search cards say this about themselves; releases and merges never do. */
const EXISTENCE_ONLY = /this is not a release or proof of a working integration/i;

/** Low-evidence commentary sources, capped so they cannot dominate the edition. */
export const COMMENTARY_CAP = 25;
const COMMENTARY_SOURCE = /^x\b|browser search sample/i;

const SOCIAL_SEARCH_SOURCES = new Set(["bluesky", "reddit"]);
// Conservative English event heuristic, not a truth check. Use source text only:
// links, questions, plans, negated announcements and evergreen descriptions are not events.
const EVENT =
  /\b(released|launched|shipped|published|merged|fixed|patched|added|removed|introduced|announced|rolled out|went live|now supports|crashes|is down)\b/i;
const NON_EVENT =
  /\?|\b(will|would|could|should|might|may|not|never|hasn't|haven't|didn't|isn't|wasn't|plans?|planning|hopes?|wish|how to|years ago)\b/i;

function reportsSocialEvent(story: Story): boolean {
  const body = story.file?.fullSummary ?? story.summary;
  // Bluesky's headline is a truncated excerpt, not an independent source field.
  return (story.source === "bluesky" ? [body] : [story.title, body]).some((text) =>
    (text ?? "")
      .replace(/https?:\/\/\S+/gi, "")
      .split(/(?<=[.!?])\s+|\n+/)
      .some((sentence) => EVENT.test(sentence) && !NON_EVENT.test(sentence)),
  );
}

function commentarySource(story: Story): string | null {
  if (SOCIAL_SEARCH_SOURCES.has(story.source)) return story.source;
  return COMMENTARY_SOURCE.test(story.sourceLabel ?? "") ? "x" : null;
}

export interface GateResult {
  kept: Story[];
  dropped: { id: string; reason: DropReason }[];
}

export type DropReason = "no-substance" | "existence-only" | "no-event" | "commentary-cap";

/** The card's own words, with the generated boilerplate stripped off. */
function description(story: Story): string {
  return (story.summary ?? "")
    .replace(EXISTENCE_ONLY, "")
    .replace(/Last code push:[^;]*;?/i, "")
    .replace(/Topics:[^.]*\.?/i, "")
    .replace(/[\s.;,·-]+$/, "")
    .trim();
}

/** True when a story reports something that happened, rather than something existing. */
export function isNewsworthy(story: Story): boolean {
  if (SOCIAL_SEARCH_SOURCES.has(story.source)) return reportsSocialEvent(story);
  const summary = story.summary ?? "";
  if (!EXISTENCE_ONLY.test(summary)) return true;
  // A project card earns its place with a real description, not just a name and a timestamp.
  const body = description(story);
  if (NO_SUBSTANCE.test(summary) && !body) return false;
  if (TOPICS_EMPTY.test(summary) && body.length < 40) return false;
  return body.length >= 40;
}

/**
 * Applies the gate to a whole edition. Order is preserved; only the commentary cap
 * looks across stories, and it keeps the newest of that source.
 */
export function applyEditorialGate(stories: Story[]): GateResult {
  const dropped: GateResult["dropped"] = [];
  const substantive = stories.filter((story) => {
    if (isNewsworthy(story)) return true;
    const body = description(story);
    dropped.push({
      id: story.id,
      reason: SOCIAL_SEARCH_SOURCES.has(story.source) ? "no-event" : body ? "no-substance" : "existence-only",
    });
    return false;
  });
  const commentary = substantive
    .filter((s) => commentarySource(s) !== null)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  const counts = new Map<string, number>();
  const overflow = new Set<string>();
  for (const story of commentary) {
    const source = commentarySource(story)!;
    const count = (counts.get(source) ?? 0) + 1;
    counts.set(source, count);
    if (count > COMMENTARY_CAP) overflow.add(story.id);
  }
  for (const id of overflow) dropped.push({ id, reason: "commentary-cap" });
  return { kept: substantive.filter((s) => !overflow.has(s.id)), dropped };
}

/**
 * The collection record.
 *
 * An intelligence product owes its reader the reasoning, not just the result:
 * what was collected, what survived, and what was excluded under which rule.
 * Without that, a filtered feed is indistinguishable from a feed that found
 * nothing — and a reader cannot tell a judgement from an outage.
 *
 * Every exclusion here is attributable to one deterministic rule, and the rule is
 * stated in words the reader can check the decision against.
 */
export const DROP_RULES: Record<DropReason, { label: string; rule: string }> = {
  "existence-only": {
    label: "Existence only",
    rule: "The source reported that something exists, not that anything happened.",
  },
  "no-substance": {
    label: "No substance",
    rule: "A project card carrying a name and a timestamp, with no description to read.",
  },
  "no-event": {
    label: "No event reported",
    rule: "A post asking, planning or describing, rather than reporting something that occurred.",
  },
  "commentary-cap": {
    label: "Over the commentary cap",
    rule: `More than ${COMMENTARY_CAP} items from one low-evidence source in this edition. The newest are kept.`,
  },
};

/** Fixed order, so the record reads the same way every time it is produced. */
const REASON_ORDER: DropReason[] = ["existence-only", "no-substance", "no-event", "commentary-cap"];
/** Enough excluded items to audit the rule by, without shipping the whole edition twice. */
export const EXAMPLE_CAP = 12;

export interface Exclusion {
  reason: DropReason;
  label: string;
  rule: string;
  count: number;
  examples: { id: string; title: string; sourceLabel: string; sourceUrl: string }[];
}

export interface CollectionRecord {
  /** Signals the providers returned, before any editorial decision. */
  collected: number;
  kept: number;
  excluded: number;
  reasons: Exclusion[];
}

/** Pair the gate's decisions back with the stories they were made about. */
export function collectionRecord(collected: Story[], gate: GateResult): CollectionRecord {
  const byId = new Map(collected.map((story) => [story.id, story]));
  const grouped = new Map<DropReason, Exclusion>();
  for (const { id, reason } of gate.dropped) {
    const entry = grouped.get(reason) ?? { reason, ...DROP_RULES[reason], count: 0, examples: [] };
    entry.count += 1;
    const story = byId.get(id);
    if (story && entry.examples.length < EXAMPLE_CAP) {
      entry.examples.push({
        id: story.id,
        title: story.title,
        sourceLabel: story.sourceLabel ?? story.source,
        sourceUrl: story.sourceUrl,
      });
    }
    grouped.set(reason, entry);
  }
  return {
    collected: collected.length,
    kept: gate.kept.length,
    excluded: gate.dropped.length,
    reasons: REASON_ORDER.filter((reason) => grouped.has(reason)).map((reason) => grouped.get(reason)!),
  };
}
