/**
 * The normalized Newsroom story model. Presentation components only ever see
 * these types; provider adapters translate raw responses into them.
 */

import type { UpdateBrief } from "./update-brief";

export const STORY_TYPES = [
  "breaking",
  "verified",
  "developing",
  "community",
  "build",
  "research",
  "pain-point",
  "opportunity",
  "correction",
] as const;
export type StoryType = (typeof STORY_TYPES)[number];

export const STORY_TYPE_LABELS: Record<StoryType, string> = {
  breaking: "Breaking",
  verified: "Verified",
  developing: "Developing",
  community: "Community Signal",
  build: "New Build",
  research: "Research",
  "pain-point": "Pain Point",
  opportunity: "Opportunity",
  correction: "Correction",
};

export const SOURCE_IDS = [
  "bluesky",
  "reddit",
  "hackernews",
  "x",
  "facebook",
  "github",
  "official-blog",
  "research",
  "hermes-community",
] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

export const SOURCE_LABELS: Record<SourceId, string> = {
  bluesky: "Bluesky",
  reddit: "Reddit",
  hackernews: "Hacker News",
  x: "X",
  facebook: "Facebook",
  github: "GitHub",
  "official-blog": "Official Blogs",
  research: "Research",
  "hermes-community": "Hermes Community",
};

export const SIGNAL_AREAS = ["hermes", "ai-models", "community", "security"] as const;
export type SignalArea = (typeof SIGNAL_AREAS)[number];

export const SIGNAL_AREA_LABELS: Record<SignalArea, string> = {
  hermes: "Hermes",
  "ai-models": "AI Models",
  community: "Community",
  security: "Security",
};

// Reading actions only: the Newsroom reports, it does not draft or queue work.
export const RECOMMENDED_ACTIONS = ["track", "ignore"] as const;
export type RecommendedAction = (typeof RECOMMENDED_ACTIONS)[number];

export type MomentumDirection = "rising" | "steady" | "falling";

export interface Momentum {
  /** False when a provider has no repeated attention measurements. */
  measured?: boolean;
  /** 0–100 */
  score: number;
  direction: MomentumDirection;
  /** Change in attention over the last period, in percent. */
  changePct: number;
}

export type StoryStatus = "confirmed" | "unconfirmed" | "disputed" | "corrected";

export interface EvidenceItem {
  id: string;
  claim: string;
  sourceLabel: string;
  url: string;
}

export interface IntelligenceFile {
  fullSummary: string;
  whyItMatters: string;
  evidence: EvidenceItem[];
  conflicting: EvidenceItem[];
  relevanceExplanation: string;
  nextAction: string;
}

export interface StoryImage {
  src: string;
  alt: string;
}

export interface Story {
  updateBrief?: UpdateBrief;
  releaseChannel?: "stable" | "prerelease";
  id: string;
  type: StoryType;
  title: string;
  summary: string;
  source: SourceId;
  sourceLabel: string;
  sourceUrl: string;
  publishedAt: string;
  detectedAt: string;
  sourceCount: number;
  relevanceScore: number;
  /** False when the source supplies no evidence-quality measurement. */
  evidenceMeasured?: boolean;
  evidenceScore: number;
  momentum: Momentum;
  actionability: number;
  topics: string[];
  signals: SignalArea[];
  status: StoryStatus;
  recommendedAction: RecommendedAction;
  saved: boolean;
  dismissed: boolean;
  image: StoryImage | null;
  file: IntelligenceFile;
}

export interface Watchlist {
  id: string;
  label: string;
  topics: string[];
}

/** 0–100 blend used by "Most Important" and the lead story pick. */
export function importance(story: Pick<Story, "relevanceScore" | "evidenceScore" | "momentum">): number {
  return Math.round(0.45 * story.relevanceScore + 0.35 * story.evidenceScore + 0.2 * story.momentum.score);
}

export function momentumLabel(momentum: Momentum): string {
  if (momentum.measured === false) return "Unmeasured";
  if (momentum.direction === "rising") return "Rising";
  if (momentum.direction === "falling") return "Falling";
  return "Steady";
}
