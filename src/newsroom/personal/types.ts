export interface WorkRecord {
  id: string;
  profile: string;
  sessionId: string;
  title: string;
  source: string;
  messages: number;
  firstAt: string;
  lastAt: string;
  request: string;
  response: string;
}
export interface WorkSnapshot {
  date: string;
  timezone: string;
  collectedAt: string;
  records: WorkRecord[];
  coverage: { profile: string; state: "ok" | "missing" | "unavailable"; sessions: number; omitted: number }[];
}
export interface PersonalEdition {
  id: string;
  title: string;
  generatedAt: string;
  headline: string;
  sections: { title: string; page?: 1 | 2 | 3 | 4; bullets: { text: string; sources: string[] }[] }[];
  snapshot: WorkSnapshot;
}
export interface PersonalData {
  title: string;
  snapshot: WorkSnapshot;
  edition: PersonalEdition | null;
  editions: { id: string; date: string; generatedAt: string }[];
}
