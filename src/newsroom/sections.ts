import type { LucideIcon } from "lucide-react";
import { Archive, BarChart3, Boxes, FileText, Home, Radio, GitPullRequest } from "lucide-react";

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
      "Up to five selected events. Routine project activity and individual code changes live in their own sections.",
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
    id: "editions",
    label: "Editions",
    href: `${NEWSROOM_BASE}/editions`,
    icon: FileText,
    description:
      "Public news around Hermes Agent. Read today’s selection or the week’s recap, with sources and printable editions.",
    planned: [],
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
    description: "Permanent bookmarks and dated public editions, with local backup and restore.",
    planned: ["Full-feed historical collection", "Intelligence file history"],
  },
];

export function sectionById(id: string) {
  return NEWSROOM_SECTIONS.find((s) => s.id === id);
}
