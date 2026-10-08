import { SOURCE_IDS, STORY_TYPES, SIGNAL_AREAS, RECOMMENDED_ACTIONS, type Story } from "../model/story";

export const ARCHIVE_VERSION = 1;
export const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;
export type ArchiveMode = "live" | "fixture" | "mixed";
export interface ArchivedStory {
  story: Story;
  saved: boolean;
  updatedAt: string;
  mode: ArchiveMode;
}
export interface EditionReport {
  title: string;
  summary: string;
  at: string;
  label: string;
  sources: { title: string; url: string; summary: string }[];
}
export interface EditionDraft {
  period: "today" | "week";
  date: string;
  timezone: string;
  mode: ArchiveMode;
  scope: string;
  reports: EditionReport[];
  notices: string[];
}
export interface SavedEdition extends EditionDraft {
  id: string;
  savedAt: string;
}
export interface ArchiveData {
  version: 1;
  records: ArchivedStory[];
  editions: SavedEdition[];
}
export const emptyArchive = (): ArchiveData => ({ version: 1, records: [], editions: [] });
export class ArchiveInputError extends Error {}
function fail(): never {
  throw new ArchiveInputError("Invalid archive data. Use a Newsroom version 1 backup.");
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 20000): string {
  if (typeof value !== "string" || value.length > max) return fail();
  return value;
}
function choice<T extends string>(value: unknown, values: readonly T[]): T {
  if (!values.includes(value as T)) return fail();
  return value as T;
}
function bool(value: unknown): boolean {
  if (typeof value !== "boolean") return fail();
  return value;
}
function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fail();
  return value;
}
function date(value: unknown): string {
  const s = text(value, 40);
  if (!Number.isFinite(Date.parse(s))) return fail();
  return s;
}
function array<T>(value: unknown, parse: (v: unknown) => T, max = 500): T[] {
  if (!Array.isArray(value) || value.length > max) return fail();
  return value.map(parse);
}
function url(value: unknown): string {
  const s = text(value, 4096);
  // Empty links are retained as unavailable; executable schemes never enter storage.
  if (s === "") return s;
  try {
    const u = new URL(s);
    if (!["http:", "https:"].includes(u.protocol) || u.username || u.password) return fail();
  } catch {
    return fail();
  }
  return s;
}
export function parseMode(value: unknown): ArchiveMode {
  return choice(value, ["live", "fixture", "mixed"]);
}
export function parseStory(value: unknown): Story {
  const s = object(value),
    f = object(s.file),
    m = object(s.momentum);
  const evidence = (value: unknown) => {
    const e = object(value);
    return {
      id: text(e.id, 500),
      claim: text(e.claim),
      sourceLabel: text(e.sourceLabel, 500),
      url: url(e.url),
    };
  };
  const id = text(s.id, 500);
  if (!id.trim()) return fail();
  return {
    id,
    title: text(s.title, 2000),
    summary: text(s.summary),
    type: choice(s.type, STORY_TYPES),
    source: choice(s.source, SOURCE_IDS),
    sourceLabel: text(s.sourceLabel, 500),
    sourceUrl: url(s.sourceUrl),
    publishedAt: date(s.publishedAt),
    detectedAt: date(s.detectedAt),
    sourceCount: number(s.sourceCount),
    relevanceScore: number(s.relevanceScore),
    evidenceScore: number(s.evidenceScore),
    actionability: number(s.actionability),
    ...(s.evidenceMeasured === undefined ? {} : { evidenceMeasured: bool(s.evidenceMeasured) }),
    ...(s.releaseChannel === undefined
      ? {}
      : { releaseChannel: choice(s.releaseChannel, ["stable", "prerelease"] as const) }),
    momentum: {
      score: number(m.score),
      changePct: number(m.changePct),
      direction: choice(m.direction, ["rising", "steady", "falling"]),
      ...(m.measured === undefined ? {} : { measured: bool(m.measured) }),
    },
    topics: array(s.topics, (v) => text(v, 500), 100),
    signals: array(s.signals, (v) => choice(v, SIGNAL_AREAS), 20),
    status: choice(s.status, ["confirmed", "unconfirmed", "disputed", "corrected"]),
    recommendedAction: choice(s.recommendedAction, RECOMMENDED_ACTIONS),
    saved: bool(s.saved),
    dismissed: bool(s.dismissed),
    image: null,
    file: {
      fullSummary: text(f.fullSummary),
      whyItMatters: text(f.whyItMatters),
      relevanceExplanation: text(f.relevanceExplanation),
      nextAction: text(f.nextAction),
      evidence: array(f.evidence, evidence, 100),
      conflicting: array(f.conflicting, evidence, 100),
    },
  };
}
export function parseEditionDraft(value: unknown): EditionDraft {
  const e = object(value),
    day = text(e.date, 10),
    timezone = text(e.timezone, 100);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    new Date(date(`${day}T00:00:00Z`)).toISOString().slice(0, 10) !== day
  )
    return fail();
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    return fail();
  }
  return {
    period: choice(e.period, ["today", "week"]),
    date: day,
    timezone,
    mode: parseMode(e.mode),
    scope: text(e.scope, 2000),
    notices: array(e.notices, (v) => text(v, 2000), 100),
    reports: array(
      e.reports,
      (value) => {
        const r = object(value);
        return {
          title: text(r.title, 2000),
          summary: text(r.summary),
          at: date(r.at),
          label: text(r.label, 500),
          sources: array(
            r.sources,
            (value) => {
              const s = object(value);
              return { title: text(s.title, 2000), summary: text(s.summary), url: url(s.url) };
            },
            100,
          ),
        };
      },
      500,
    ),
  };
}
export function parseArchive(value: unknown): ArchiveData {
  const a = object(value);
  if (a.version !== ARCHIVE_VERSION) return fail();
  const records = array(
    a.records,
    (value) => {
      const r = object(value);
      return {
        story: parseStory(r.story),
        saved: bool(r.saved),
        updatedAt: date(r.updatedAt),
        mode: parseMode(r.mode),
      };
    },
    10000,
  );
  const editions = array(
    a.editions,
    (value) => {
      const e = object(value);
      const id = text(e.id, 100);
      if (!/^[a-zA-Z0-9-]+$/.test(id)) return fail();
      return { ...parseEditionDraft(e), id, savedAt: date(e.savedAt) };
    },
    2000,
  );
  if (
    new Set(records.map((r) => r.story.id)).size !== records.length ||
    new Set(editions.map((e) => e.id)).size !== editions.length
  )
    return fail();
  return { version: 1, records, editions };
}
