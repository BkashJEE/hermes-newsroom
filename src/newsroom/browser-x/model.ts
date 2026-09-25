import type { Story } from "../model/story";
export const X_SEARCH_URL = "https://x.com/search?q=%22Hermes%20Agent%22&src=typed_query&f=live";
export interface XPost {
  id: string;
  text: string;
  url: string;
  publishedAt: string;
  collectedAt: string;
}
export interface CollectionJob {
  id: string;
  state: "queued" | "collecting" | "complete" | "unavailable" | "failed";
  requestedAt: string;
  startedAt?: string;
  finishedAt?: string;
  postIds?: string[];
  message?: string;
}
export interface XState {
  posts: XPost[];
  job?: CollectionJob;
  lastCollectedAt?: string;
}
export function parsePosts(raw: unknown, now = new Date()): XPost[] {
  if (!Array.isArray(raw) || raw.length > 20) throw new Error("Expected at most 20 public posts.");
  const posts = new Map<string, XPost>();
  for (const value of raw) {
    if (
      !value ||
      typeof value.url !== "string" ||
      typeof value.text !== "string" ||
      typeof value.publishedAt !== "string"
    )
      throw new Error("Invalid public post.");
    const url = new URL(value.url);
    const match = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d{10,25})\/?$/);
    const time = Date.parse(value.publishedAt);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "x.com" ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      !match ||
      !value.text.trim() ||
      value.text.length > 2000 ||
      !Number.isFinite(time) ||
      time > now.getTime() + 300000 ||
      time < now.getTime() - 30 * 86400000
    )
      throw new Error("Invalid public post.");
    const id = `x:${match[2]}`;
    posts.set(id, {
      id,
      url: url.href,
      text: value.text.trim().slice(0, 1200),
      publishedAt: new Date(time).toISOString(),
      collectedAt: now.toISOString(),
    });
  }
  return [...posts.values()];
}
export function xStory(post: XPost): Story {
  const title = post.text.replace(/\s+/g, " ").slice(0, 180);
  return {
    id: post.id,
    type: "community",
    title,
    summary: post.text,
    source: "x",
    sourceLabel: "X · browser search sample",
    sourceUrl: post.url,
    publishedAt: post.publishedAt,
    detectedAt: post.collectedAt,
    sourceCount: 1,
    relevanceScore: 60,
    evidenceScore: 25,
    momentum: { measured: false, score: 0, direction: "steady", changePct: 0 },
    actionability: 40,
    topics: ["Hermes Agent"],
    signals: ["hermes", "community"],
    status: "unconfirmed",
    recommendedAction: "track",
    saved: false,
    dismissed: false,
    image: null,
    file: {
      fullSummary: post.text,
      whyItMatters:
        "A public X search result mentioning Hermes Agent; review the original post before relying on it.",
      evidence: [
        {
          id: `${post.id}:source`,
          claim: title,
          sourceLabel: "Public X post · browser capture",
          url: post.url,
        },
      ],
      conflicting: [],
      relevanceExplanation:
        "Search match only. Not independently verified, not yet judged by Jev, and not a platform-wide trending ranking.",
      nextAction: "Inspect the source and run Jev or review it yourself.",
    },
  };
}
