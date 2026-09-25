import type { LucideIcon } from "lucide-react";
import { NEWSROOM_SECTIONS } from "@/newsroom/sections";
import {
  Activity,
  AppWindow,
  Bot,
  BrainCircuit,
  CircleHelp,
  ClipboardCheck,
  Clapperboard,
  FileText,
  FolderGit2,
  FolderOpen,
  Gauge,
  GitBranch,
  GitPullRequest,
  Globe,
  Hammer,
  KanbanSquare,
  Library,
  LayoutGrid,
  MessageSquare,
  MessagesSquare,
  Newspaper,
  Mic,
  Monitor,
  PenLine,
  Save,
  Settings,
  Sparkles,
  SquareTerminal,
  Video,
  Wand2,
} from "lucide-react";

/**
 * The Command Center tabs. Each one mirrors a workspace on the Omarchy bar
 * (a personal Omarchy bar plugin) and keeps the same purpose-menu anatomy:
 * eyebrow, one-line description, then actions with a title and a hint.
 *
 * Everything here is generic on purpose so the core can be published.
 * Personal labels (handles, profile names, project paths) belong in ignored
 * local configuration, never in this file.
 */

export interface WorkspaceAction {
  id: string;
  title: string;
  hint: string;
  icon: LucideIcon;
  /** In-app destination. Actions without one run from the Omarchy bar today. */
  href?: string;
}

export interface Workspace {
  id: string;
  label: string;
  eyebrow: string;
  description: string;
  icon: LucideIcon;
  href: string;
  /** `app` tabs are implemented in this web app; `desktop` tabs mirror the bar. */
  kind: "app" | "desktop";
  /** Hyprland workspace number on the Omarchy bar, when the tab mirrors one. */
  desktopWorkspace?: number;
  actions: WorkspaceAction[];
}

export const WORKSPACES: Workspace[] = [
  {
    id: "x-studio",
    label: "X Studio",
    eyebrow: "X Studio",
    description: "Your X content studio: review, schedule and publish receipts.",
    icon: Clapperboard,
    href: "/x-studio",
    kind: "desktop",
    desktopWorkspace: 6,
    actions: [
      { id: "review", title: "Review queue", hint: "Drafts waiting for your approval", icon: ClipboardCheck },
      {
        id: "calendar",
        title: "Publishing calendar",
        hint: "What is scheduled and when",
        icon: KanbanSquare,
      },
      { id: "receipts", title: "Publication receipts", hint: "What went out, with proof", icon: FileText },
    ],
  },
  {
    id: "agents",
    label: "Agents Lab",
    eyebrow: "Agents",
    description: "Your coding agents at work.",
    icon: Bot,
    href: "/agents",
    kind: "desktop",
    desktopWorkspace: 1,
    actions: [
      { id: "claude", title: "Claude in this project", hint: "Opens in the chosen project", icon: Bot },
      {
        id: "codex",
        title: "Codex in this project",
        hint: "Opens or returns to its terminal",
        icon: SquareTerminal,
      },
      { id: "openclaw", title: "OpenClaw", hint: "Its control UI in your browser", icon: AppWindow },
      {
        id: "switchboard",
        title: "Open Switchboard",
        hint: "Claude, Codex and Hermes in one app",
        icon: LayoutGrid,
      },
      { id: "usage", title: "Usage and limits", hint: "Pace for every agent", icon: Gauge },
    ],
  },
  {
    id: "social",
    label: "Omarchy Media",
    eyebrow: "Omarchy Media",
    description: "Your content, profiles, posts and recordings.",
    icon: Video,
    href: "/social",
    kind: "desktop",
    desktopWorkspace: 2,
    actions: [
      { id: "profile", title: "Open my profile", hint: "Kept on the Social Media workspace", icon: Globe },
      {
        id: "draft",
        title: "Draft a post or script",
        hint: "Hermes helps; you edit and post",
        icon: PenLine,
      },
      { id: "gate", title: "Post checklist", hint: "Check before you post", icon: ClipboardCheck },
      { id: "record", title: "Record a demo", hint: "Choose region, microphone and webcam", icon: Mic },
      { id: "polish", title: "Polish a recording", hint: "Zooms, clicks and backgrounds", icon: Wand2 },
    ],
  },
  {
    id: "newsroom",
    label: "Hermes Newsroom",
    eyebrow: "Hermes Newsroom",
    description: "Ranked AI intelligence, and what to do about it.",
    icon: Newspaper,
    href: "/newsroom",
    kind: "app",
    actions: NEWSROOM_SECTIONS.map((section) => ({
      id: section.id,
      title: section.label,
      hint: section.description,
      icon: section.icon,
      href: section.href,
    })),
  },
  {
    id: "archive",
    label: "Hermes Archive",
    eyebrow: "Hermes Archive",
    description: "What people actually build with Hermes, quoted and credited.",
    icon: Library,
    href: "/archive",
    kind: "app",
    actions: [
      {
        id: "stories",
        title: "User stories",
        hint: "What people built, in their words",
        icon: Newspaper,
        href: "/archive#use-cases",
      },
      {
        id: "commands",
        title: "Commands",
        hint: "The CLI reference, searchable",
        icon: SquareTerminal,
        href: "/archive#commands",
      },
      {
        id: "trending",
        title: "Trending repos",
        hint: "Measured star growth per day",
        icon: Activity,
        href: "/archive#trending",
      },
      {
        id: "mine",
        title: "My work",
        hint: "Your own Hermes posts and projects",
        icon: Bot,
        href: "/archive#my-work",
      },
    ],
  },
  {
    id: "messages",
    label: "Messages",
    eyebrow: "Messages",
    description: "Your messaging apps in one place.",
    icon: MessagesSquare,
    href: "/messages",
    kind: "desktop",
    desktopWorkspace: 7,
    actions: [
      {
        id: "open-all",
        title: "Open all messaging apps",
        hint: "Start only the missing apps",
        icon: MessageSquare,
      },
    ],
  },
  {
    id: "hermes",
    label: "Hermes OS",
    eyebrow: "Hermes",
    description: "Your Hermes desktop, bots and learning.",
    icon: Sparkles,
    href: "/hermes",
    kind: "desktop",
    desktopWorkspace: 3,
    actions: [
      {
        id: "desktop",
        title: "Open Hermes desktop",
        hint: "The full Hermes app on this workspace",
        icon: Monitor,
      },
      {
        id: "profile",
        title: "Talk to a Hermes profile",
        hint: "Any profile you have configured",
        icon: MessageSquare,
      },
      { id: "spawn", title: "Spawn a new bot", hint: "Hermes plans it with you first", icon: Bot },
      {
        id: "explain",
        title: "Explain it with Hermes",
        hint: "Step by step, with an example",
        icon: BrainCircuit,
      },
      { id: "quiz", title: "Quiz me", hint: "Hermes tests you on your material", icon: CircleHelp },
      { id: "notes", title: "Learning notes", hint: "Capture insights and questions", icon: FileText },
    ],
  },
  {
    id: "git",
    label: "Git",
    eyebrow: "Git",
    description: "Changes, pull requests and repos.",
    icon: GitBranch,
    href: "/git",
    kind: "desktop",
    desktopWorkspace: 4,
    actions: [
      { id: "changes", title: "Review Git changes", hint: "LazyGit in your project", icon: GitBranch },
      { id: "prs", title: "My pull requests", hint: "Open PRs on GitHub", icon: GitPullRequest },
      {
        id: "activity",
        title: "GitHub activity",
        hint: "Recent pushes and workflow results",
        icon: Activity,
      },
      { id: "repos", title: "My repositories", hint: "Your repositories on GitHub", icon: FolderGit2 },
      { id: "dotfiles", title: "Save my desktop to Git", hint: "Sync and review your dotfiles", icon: Save },
    ],
  },
  {
    id: "build",
    label: "Build",
    eyebrow: "Build",
    description: "A project, its tools, and its running app.",
    icon: Hammer,
    href: "/build",
    kind: "desktop",
    desktopWorkspace: 5,
    actions: [
      {
        id: "setup",
        title: "Open Build setup",
        hint: "Editor + terminal + preview browser",
        icon: LayoutGrid,
      },
      { id: "choose", title: "Choose project", hint: "Select a folder to work on", icon: FolderOpen },
      {
        id: "terminal",
        title: "Project terminal",
        hint: "Run your project commands here",
        icon: SquareTerminal,
      },
      { id: "preview", title: "Open app preview", hint: "Preview URL is set in settings", icon: Globe },
      {
        id: "settings",
        title: "Workspace settings",
        hint: "Project, preview URL and notes paths",
        icon: Settings,
      },
    ],
  },
];

export function workspaceById(id: string): Workspace | undefined {
  return WORKSPACES.find((w) => w.id === id);
}
