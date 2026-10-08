import "server-only";
import { mkdir, readFile, open, rename, unlink, stat } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { stateDir } from "../config/state-path";
import {
  emptyArchive,
  parseArchive,
  MAX_ARCHIVE_BYTES,
  type ArchiveData,
  type ArchivedStory,
  type EditionDraft,
} from "./model";

/** Atomic, local file store. Missing is empty; corruption must never reset user data. */
export function createArchiveStore(directory: string) {
  const file = join(directory, "archive.json");
  async function read(): Promise<ArchiveData> {
    try {
      if ((await stat(file)).size > MAX_ARCHIVE_BYTES) throw new Error("Archive exceeds size limit.");
      return parseArchive(JSON.parse(await readFile(file, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyArchive();
      throw error;
    }
  }
  async function update(change: (data: ArchiveData) => void): Promise<ArchiveData> {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const lock = join(directory, "archive.lock");
    let handle;
    for (let attempt = 0; ; attempt++) {
      try {
        handle = await open(lock, "wx", 0o600);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST" || attempt >= 80)
          throw new Error("Archive is busy. Retry, or check the archive lock after an interrupted process.");
        await delay(25);
      }
    }
    const temporary = join(directory, `${randomUUID()}.tmp`);
    try {
      const data = await read();
      change(data);
      const encoded = JSON.stringify(parseArchive(data));
      if (Buffer.byteLength(encoded) > MAX_ARCHIVE_BYTES)
        throw new Error("Archive is full. Export a backup before managing stored data.");
      const output = await open(temporary, "wx", 0o600);
      try {
        await output.writeFile(encoded);
        await output.sync();
      } finally {
        await output.close();
      }
      await rename(temporary, file);
      return data;
    } finally {
      await unlink(temporary).catch(() => {});
      await handle.close();
      await unlink(lock);
    }
  }
  return {
    read,
    saveStory(record: ArchivedStory) {
      return update((data) => {
        const index = data.records.findIndex((r) => r.story.id === record.story.id);
        if (index < 0) data.records.push(record);
        else data.records[index] = record;
      });
    },
    saveEdition(draft: EditionDraft) {
      const edition = { ...draft, id: randomUUID(), savedAt: new Date().toISOString() };
      return update((data) => {
        data.editions.push(edition);
      }).then(() => edition);
    },
    importBackup(backup: ArchiveData) {
      return update((data) => {
        // Restore is additive: current saves/removals and existing edition IDs win.
        const ids = new Set(data.records.map((r) => r.story.id));
        data.records.push(...backup.records.filter((r) => !ids.has(r.story.id)));
        const editions = new Set(data.editions.map((e) => e.id));
        data.editions.push(...backup.editions.filter((e) => !editions.has(e.id)));
      });
    },
  };
}
export const archiveStore = createArchiveStore(stateDir("newsroom-archive"));
