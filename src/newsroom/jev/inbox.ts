import "server-only";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { HuntRecord, HuntCandidate, RunSnapshot } from "./model";
import { mergeHunt, applyHuntRun } from "./inbox-model";
import { stateDir } from "../config/state-path";
const directory = stateDir("jev");
const file = join(directory, "hunt-inbox.json");
export async function readHuntInbox(): Promise<HuntRecord[]> {
  try {
    const data = JSON.parse(await readFile(file, "utf8"));
    if (!Array.isArray(data) || data.some((r) => !r.candidate?.sourceUrl || !r.firstSeenAt))
      throw new Error("Invalid hunt inbox");
    return data;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new Error("Hunt history is unavailable. Existing data has not been replaced.");
  }
}
// All mutations are made while the shared Jev run lock is held.
async function writeInbox(records: HuntRecord[]) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(file + ".next", JSON.stringify(records), { mode: 0o600 });
  await rename(file + ".next", file);
  return records;
}
export async function rememberCandidates(candidates: HuntCandidate[], now: string) {
  return writeInbox(mergeHunt(await readHuntInbox(), candidates, now));
}
export async function rememberHuntRun(run: RunSnapshot) {
  return writeInbox(applyHuntRun(await readHuntInbox(), run));
}
