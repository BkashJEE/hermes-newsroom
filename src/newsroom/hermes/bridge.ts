import { importance, type Story } from "../model/story";

export interface DailyBrief {
  title: string;
  generatedAt: string;
  items: { storyId: string; headline: string; line: string }[];
  text: string;
  composedBy: string;
}

/**
 * The generic boundary between the Newsroom and Hermes Agent. The UI only
 * talks to this interface. v1 ships a local implementation that composes text
 * deterministically in the browser; a future implementation can call a Hermes
 * profile through a server route without changing any component.
 */
export interface HermesBridge {
  id: string;
  /** False until a real Hermes connection is configured. */
  connected: boolean;
  composeDaily(stories: Story[], now: Date): Promise<DailyBrief>;
}

export const localBridge: HermesBridge = {
  id: "local",
  connected: false,
  async composeDaily(stories, now) {
    const top = stories
      .filter((s) => !s.dismissed)
      .sort((a, b) => importance(b) - importance(a))
      .slice(0, 5);
    const date = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    const items = top.map((s) => ({
      storyId: s.id,
      headline: s.title,
      line: `${s.file.whyItMatters} (${s.sourceCount} sources, evidence ${s.evidenceMeasured === false ? "Unmeasured" : s.evidenceScore})`,
    }));
    const text = [
      `Hermes Daily — ${date}`,
      "",
      ...items.map((item, i) => `${i + 1}. ${item.headline}\n   ${item.line}`),
    ].join("\n");
    return {
      title: `Hermes Daily — ${date}`,
      generatedAt: now.toISOString(),
      items,
      text,
      composedBy: "Local summary. Use the Hermes Agent panel for an agent-written brief.",
    };
  },
};
