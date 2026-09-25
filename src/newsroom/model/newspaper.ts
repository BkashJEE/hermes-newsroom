import { importance, type Story } from "./story";

export interface NewspaperSection {
  title: string;
  subtitle: string;
  stories: Story[];
  empty: string;
}

/** Bounded, non-overlapping selections keep the print edition readable. */
export function selectNewspaper(stories: Story[]): NewspaperSection[] {
  const ranked = stories
    .filter((story) => !story.dismissed)
    .sort((a, b) => importance(b) - importance(a) || a.id.localeCompare(b.id));
  const used = new Set<string>();
  const take = (predicate: (story: Story) => boolean, limit = 3) => {
    const selected = ranked.filter((story) => !used.has(story.id) && predicate(story)).slice(0, limit);
    selected.forEach((story) => used.add(story.id));
    return selected;
  };
  const front = take(() => true, 1);
  // Keep the strongest lead, reserve specialists, then fill the front page.
  const builds = take((story) => story.type === "build" || story.type === "research");
  const community = take((story) => ["community", "pain-point", "opportunity"].includes(story.type));
  front.push(...take(() => true, 2));
  return [
    {
      title: "The Front Page",
      subtitle: "What changed. Why it matters.",
      stories: front,
      empty:
        "No stories match the current filters. Change the source, time range or search to build an edition.",
    },
    {
      title: "Builds & Research",
      subtitle: "New tools. Ideas worth examining.",
      stories: builds,
      empty:
        "No additional build or research stories in this selection. A matching story may already appear on the front page.",
    },
    {
      title: "Community & Opportunity",
      subtitle: "Signals from the people building with AI.",
      stories: community,
      empty:
        "No additional community, pain-point or opportunity stories in this selection. Nothing has been invented to fill the page.",
    },
  ];
}

/** Short extracts, not generated claims. Full reporting remains in the source. */
export function newspaperExcerpt(text: string, limit = 240): string {
  const plain = text
    .replace(/!?\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/[*_`#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= limit) return plain;
  const cut = plain.slice(0, limit - 1);
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > limit / 2 ? space : cut.length)}…`;
}

export function sourceHref(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}
