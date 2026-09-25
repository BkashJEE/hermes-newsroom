import {
  SIGNAL_AREAS,
  SIGNAL_AREA_LABELS,
  importance,
  type SignalArea,
  type Story,
  type StoryType,
} from "./story";

/** Most important verified story, else the most important story overall. */
export function pickLead(stories: Story[]): Story | undefined {
  const byImportance = [...stories].sort((a, b) => importance(b) - importance(a));
  return byImportance.find((s) => s.type === "verified") ?? byImportance[0];
}

export const FLASHCARD_SLOTS: StoryType[] = ["developing", "community", "build"];

/** Prefer varied story types, then fill remaining slots with available stories. */
export function pickFlashcards(
  stories: Story[],
  leadId?: string,
): { type: StoryType; story: Story | null }[] {
  const cards = FLASHCARD_SLOTS.map((type) => ({
    type,
    story: stories.find((s) => s.type === type && s.id !== leadId) ?? null,
  }));
  const used = new Set([leadId, ...cards.map((card) => card.story?.id)]);
  for (const card of cards) {
    if (card.story) continue;
    card.story = stories.find((story) => !used.has(story.id)) ?? null;
    if (card.story) used.add(card.story.id);
  }
  return cards;
}

export function hasMeasuredMomentum(stories: Story[]): boolean {
  return stories.length > 0 && stories.every((s) => s.momentum.measured !== false);
}

export interface SignalReading {
  area: SignalArea;
  label: string;
  value: number;
  level: "Low" | "Moderate" | "High" | "Very high";
  count: number;
}

function levelFor(value: number): SignalReading["level"] {
  if (value >= 80) return "Very high";
  if (value >= 65) return "High";
  if (value >= 45) return "Moderate";
  return "Low";
}

/** Per area: relevance weighted by momentum, 0–100. Areas with no stories read 0. */
export function signalMeter(stories: Story[]): SignalReading[] {
  const measured = hasMeasuredMomentum(stories);
  return SIGNAL_AREAS.map((area) => {
    const inArea = stories.filter((s) => s.signals.includes(area));
    const weight = inArea.reduce((sum, s) => sum + s.momentum.score, 0);
    const value = !measured
      ? stories.length
        ? Math.round((inArea.length / stories.length) * 100)
        : 0
      : weight
        ? Math.round(inArea.reduce((sum, s) => sum + s.relevanceScore * s.momentum.score, 0) / weight)
        : 0;
    return { area, label: SIGNAL_AREA_LABELS[area], value, level: levelFor(value), count: inArea.length };
  });
}

export interface TrendingTopic {
  rank: number;
  topic: string;
  momentum: number;
  changePct: number;
  sources: number;
  stories: number;
}

/** Top topics by summed momentum, with the number of distinct source families. */
export function trendingTopics(stories: Story[], limit = 5): TrendingTopic[] {
  const measured = hasMeasuredMomentum(stories);
  const byTopic = new Map<string, { momentum: number; changes: number[]; sources: Set<string> }>();
  for (const story of stories) {
    for (const topic of new Set(story.topics)) {
      const entry = byTopic.get(topic) ?? { momentum: 0, changes: [], sources: new Set<string>() };
      entry.momentum += story.momentum.score;
      entry.changes.push(story.momentum.changePct);
      entry.sources.add(story.source);
      byTopic.set(topic, entry);
    }
  }
  return [...byTopic.entries()]
    .sort(
      (a, b) =>
        (measured ? b[1].momentum - a[1].momentum : b[1].changes.length - a[1].changes.length) ||
        a[0].localeCompare(b[0]),
    )
    .slice(0, limit)
    .map(([topic, entry], index) => ({
      rank: index + 1,
      topic,
      momentum: Math.min(100, Math.round(entry.momentum / entry.changes.length)),
      changePct: Math.round(entry.changes.reduce((a, b) => a + b, 0) / entry.changes.length),
      sources: entry.sources.size,
      stories: entry.changes.length,
    }));
}

export interface ContentOpportunity {
  story: Story;
  angle: string;
  novelty: "Low" | "Medium" | "High";
  audienceFit: "Low" | "Medium" | "High";
  evidenceReadiness: "Not ready" | "Needs sources" | "Ready";
}

function band(value: number): "Low" | "Medium" | "High" {
  if (value >= 75) return "High";
  if (value >= 50) return "Medium";
  return "Low";
}

/** The best opportunity story, else the most actionable story. */
export function contentOpportunity(stories: Story[]): ContentOpportunity | null {
  const story =
    stories.find((s) => s.type === "opportunity") ??
    [...stories].sort((a, b) => b.actionability - a.actionability)[0];
  if (!story) return null;
  return {
    story,
    angle: story.file.nextAction,
    // Few independent sources + rising attention = a less-covered, novel angle.
    novelty: band(
      100 - Math.min(100, story.sourceCount * 10) + (story.momentum.direction === "rising" ? 20 : 0),
    ),
    audienceFit: band(story.relevanceScore),
    evidenceReadiness:
      story.evidenceScore >= 75 ? "Ready" : story.evidenceScore >= 50 ? "Needs sources" : "Not ready",
  };
}

export function tickerStories(stories: Story[]): Story[] {
  return stories.filter((s) => s.type === "breaking");
}

/** Compact relative time: "just now", "12m ago", "3h ago", "2d ago". */
export function timeAgo(iso: string, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
