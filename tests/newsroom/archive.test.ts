import { afterAll, beforeEach, expect, it } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createArchiveStore } from "@/newsroom/archive/server";
import {
  emptyArchive,
  parseArchive,
  parseEditionDraft,
  parseStory,
  type EditionDraft,
} from "@/newsroom/archive/model";
import { story } from "./helpers";
const directory = await mkdtemp(join(tmpdir(), "newsroom-archive-"));
const location = join(directory, "state");
const store = createArchiveStore(location);
const record = () => ({
  story: story(),
  saved: true,
  mode: "fixture" as const,
  updatedAt: new Date().toISOString(),
});
export const edition: EditionDraft = {
  period: "today",
  date: "2026-10-06",
  timezone: "UTC",
  mode: "fixture",
  scope: "All sources",
  notices: ["Sample data"],
  reports: [
    {
      title: "A dated report",
      summary: "An immutable summary",
      at: "2026-10-06T10:00:00Z",
      label: "Demo",
      sources: [{ title: "Original", summary: "Source excerpt", url: "https://example.com/news" }],
    },
  ],
};
beforeEach(async () => {
  await rm(location, { recursive: true, force: true });
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});
it("retains saves and edition content after opening a fresh store, independent of browser storage", async () => {
  await store.saveStory(record());
  const saved = await store.saveEdition(edition);
  edition.reports[0].summary = "Changed after saving";
  const reopened = await createArchiveStore(location).read();
  expect(reopened.records[0].story.title).toBe(story().title);
  expect(reopened.editions[0].id).toBe(saved.id);
  expect(reopened.editions[0].reports[0].summary).toBe("An immutable summary");
  edition.reports[0].summary = "An immutable summary";
});
it("serializes independent writers without losing records", async () => {
  await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      createArchiveStore(location).saveStory({ ...record(), story: story({ id: `parallel-${i}` }) }),
    ),
  );
  expect((await store.read()).records).toHaveLength(8);
});
it("restores a backup into an empty archive and never resurrects a locally removed save", async () => {
  await store.saveStory(record());
  await store.saveEdition(edition);
  const backup = parseArchive(JSON.parse(JSON.stringify(await store.read())));
  const other = createArchiveStore(join(directory, "restored"));
  await other.importBackup(backup);
  expect(await other.read()).toEqual(backup);
  await store.saveStory({ ...record(), saved: false });
  await store.importBackup(backup);
  await store.importBackup(backup);
  expect((await store.read()).records[0].saved).toBe(false);
  expect((await store.read()).editions).toHaveLength(1);
});
it("fails closed on corrupt data and preserves the original bytes", async () => {
  await store.saveStory(record());
  await writeFile(join(location, "archive.json"), "broken archive");
  await expect(store.read()).rejects.toThrow();
  await expect(store.saveEdition(edition)).rejects.toThrow();
  expect(await readFile(join(location, "archive.json"), "utf8")).toBe("broken archive");
});
it("rejects executable links, invalid dates, duplicate IDs and unknown backup versions", () => {
  expect(() => parseStory(story({ sourceUrl: "javascript:alert(1)" }))).toThrow();
  expect(() => parseEditionDraft({ ...edition, date: "2026-02-30" })).toThrow();
  expect(() => parseEditionDraft({ ...edition, timezone: "made-up" })).toThrow();
  expect(() => parseArchive({ ...emptyArchive(), records: [record(), record()] })).toThrow();
  expect(() => parseArchive({ ...emptyArchive(), version: 99 })).toThrow();
  expect(() =>
    parseStory({
      ...story(),
      file: {
        ...story().file,
        evidence: [{ id: "x", claim: "x", sourceLabel: "x", url: "data:text/html,bad" }],
      },
    }),
  ).toThrow();
});
it("stores text and source links without remote image tracking", () => {
  expect(parseStory(story({ image: { src: "https://example.com/pixel", alt: "" } })).image).toBeNull();
});
