import type { LucideIcon } from "lucide-react";
import { Archive, BarChart3, Boxes, CalendarDays, FileText, Home, Radio, GitPullRequest } from "lucide-react";

export interface NewsroomSection {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
  /** What the full version adds; listed under each section preview. */
  planned: string[];
}

export const NEWSROOM_BASE = "/newsroom";

export const NEWSROOM_SECTIONS: NewsroomSection[] = [
  {
    id: "front-page",
    label: "Front Page",
    href: NEWSROOM_BASE,
    icon: Home,
    description:
      "Up to eight headlines. Routine project activity and individual code changes live in their own sections.",
    planned: [],
  },
  {
    id: "hermes-agent-updates",
    label: "Hermes Agent Updates",
    href: `${NEWSROOM_BASE}/hermes-agent-updates`,
    icon: GitPullRequest,
    description:
      "What changed, what is new, what is gone, what is better, and what is bad — with source notes for each release and merged update.",
    planned: [],
  },
  {
    id: "live-wire",
    label: "Live Wire",
    href: `${NEWSROOM_BASE}/live-wire`,
    icon: Radio,
    description: "Every incoming signal, in order, as it lands.",
    planned: ["Streaming feed from every connected provider", "Per-source health", "Keyboard triage"],
  },
  {
    id: "hermes-daily",
    label: "Hermes Daily",
    href: `${NEWSROOM_BASE}/hermes-daily`,
    icon: FileText,
    description:
      "A short newspaper selection with source links. Up to nine stories across headlines, builds and research, and community news.",
    planned: ["Scheduled generation", "Editable brief with citations", "Delivery to your Hermes profile"],
  },
  {
    id: "personal-daily",
    label: "My Hermes Daily",
    href: `${NEWSROOM_BASE}/personal-daily`,
    icon: FileText,
    description: "A personal newspaper from your Hermes work records.",
    planned: [],
  },
  {
    id: "weekly-chronicle",
    label: "Weekly Chronicle",
    href: `${NEWSROOM_BASE}/weekly-chronicle`,
    icon: CalendarDays,
    description:
      "The week around Hermes Agent: releases, merged changes, and what the community built and shipped.",
    planned: ["Week-over-week trend changes", "Corrections roundup", "Export to Markdown"],
  },
  {
    id: "built-with-hermes",
    label: "Built With Hermes",
    href: `${NEWSROOM_BASE}/built-with-hermes`,
    icon: Boxes,
    description:
      "Community projects, skills, integrations and demos. Official agent releases belong in Hermes Agent Updates.",
    planned: ["Project cards from GitHub and the community", "Try-it checklists"],
  },
  {
    id: "trend-radar",
    label: "Trend Radar",
    href: `${NEWSROOM_BASE}/trend-radar`,
    icon: BarChart3,
    description: "Topic coverage across connected sources, with momentum where measured.",
    planned: ["Topic momentum over time", "Emerging vs. fading topics", "Watchlist alerts"],
  },
  {
    id: "archive",
    label: "Archive",
    href: `${NEWSROOM_BASE}/archive`,
    icon: Archive,
    description: "Saved and past intelligence, searchable.",
    planned: ["Full-text search of past stories", "Saved stories", "Intelligence file history"],
  },
];

export function sectionById(id: string) {
  return NEWSROOM_SECTIONS.find((s) => s.id === id);
}
