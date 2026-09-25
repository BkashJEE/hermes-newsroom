import { newspaperExcerpt } from "../model/newspaper";
import type { PersonalEdition } from "./types";

export const PERSONAL_PAGES = [
  {
    title: "Your Morning",
    subtitle: "The lead, decisions and priorities",
    empty:
      "No sourced morning briefing is available for this edition. Calendar, weather and inbox are not connected.",
  },
  {
    title: "Your Agents at Work",
    subtitle: "Reported delivery, active work and blockers",
    empty:
      "No agent-work summary has been written for this edition. Recorded sessions are available below the newspaper.",
  },
  {
    title: "Intelligence & Opportunity",
    subtitle: "Research, ideas and experiments",
    empty: "No sourced research or opportunity items were recorded in this edition.",
  },
  {
    title: "Life & the Long View",
    subtitle: "Reflection, lessons and what comes next",
    empty: "No personal-life or reflection items were supplied. Nothing is inferred from missing records.",
  },
] as const;

function pageFor(section: PersonalEdition["sections"][number]): number {
  if (section.page && section.page >= 1 && section.page <= 4) return section.page - 1;
  // Presentation-only migration for older saved editions; never rewrite the source file.
  if (/morning|priorit|decision|lead|agenda/i.test(section.title)) return 0;
  if (/intelligence|opportunit|research|experiment|idea|reading/i.test(section.title)) return 2;
  if (/life|long view|reflect|lesson|notebook|tomorrow/i.test(section.title)) return 3;
  return 1;
}

export function personalPages(edition: PersonalEdition | null | undefined) {
  return PERSONAL_PAGES.map((page, index) => {
    const sections = edition?.sections.filter((section) => pageFor(section) === index) ?? [];
    const bulletsPerSection = Math.floor(8 / Math.max(1, Math.min(3, sections.length)));
    const selected = sections.slice(0, 3).map((section) => ({
      title: newspaperExcerpt(section.title, 70),
      bullets: section.bullets.slice(0, bulletsPerSection).map((bullet) => ({
        text: newspaperExcerpt(bullet.text, 260),
        sources: bullet.sources.slice(0, 3),
      })),
    }));
    const total = sections.reduce((sum, section) => sum + section.bullets.length, 0);
    const shown = selected.reduce((sum, section) => sum + section.bullets.length, 0);
    return { ...page, sections: selected, omitted: total - shown };
  });
}
