import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile, readFile, rename, unlink, mkdtemp, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  evaluationInput,
  parseDecision,
  JevFailure,
  type PublicInput,
  type Decision,
  type RunSnapshot,
} from "./model";
import { stateDir } from "../config/state-path";
const exec = promisify(execFile);
const directory = stateDir("jev");
const helper = join(homedir(), ".openclaw/workspace/hermes-jev/evaluate.mjs");
export async function helperReady() {
  try {
    const { stdout } = await exec(process.execPath, [helper, "--check"], {
      timeout: 10000,
      maxBuffer: 16000,
    });
    const result = JSON.parse(stdout);
    return result.sdkReady === true && result.keyConfigured === true;
  } catch {
    return false;
  }
}
export async function acquireRun() {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  // Shared by dev and deployed processes. Fail closed after a crash; no overlapping paid runs.
  await writeFile(join(directory, "active.lock"), new Date().toISOString(), { flag: "wx", mode: 0o600 });
  return async () => {
    await unlink(join(directory, "active.lock"));
  };
}
async function reserveCall() {
  const file = join(directory, "calls.json");
  let calls: number[] = [];
  try {
    const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
    if (!Array.isArray(parsed) || !parsed.every((n) => typeof n === "number" && Number.isFinite(n)))
      throw new Error("Invalid ledger");
    calls = parsed.filter((n) => n > Date.now() - 3600000);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (calls.length >= 10) throw new JevFailure("hourly-limit");
  calls.push(Date.now());
  await writeFile(file + ".next", JSON.stringify(calls), { mode: 0o600 });
  await rename(file + ".next", file);
}
export async function evaluatePublic(story: PublicInput, signal: AbortSignal): Promise<Decision> {
  signal.throwIfAborted();
  await reserveCall();
  const temp = await mkdtemp(join(directory, "request-"));
  try {
    const file = join(temp, "input.json");
    await writeFile(file, JSON.stringify(evaluationInput(story)), { mode: 0o600 });
    let stdout: string;
    try {
      ({ stdout } = await exec(process.execPath, [helper, "--run", file], {
        signal,
        timeout: 35000,
        maxBuffer: 64000,
      }));
    } catch (error) {
      // The helper prints only a fixed, redacted error and optional HTTP status.
      // Never forward raw SDK stderr, headers, or request content to the browser.
      const stderr = (error as { stderr?: unknown }).stderr;
      const status =
        typeof stderr === "string" ? /Jev request failed \(HTTP (\d{3})\)/.exec(stderr)?.[1] : undefined;
      if (status === "401" || status === "403") throw new JevFailure("authentication");
      if (status === "402") throw new JevFailure("credits");
      if (status === "404") throw new JevFailure("unavailable");
      if (status === "429") throw new JevFailure("rate-limit");
      if (status === "400" || status === "422") throw new JevFailure("request");
      throw new JevFailure("provider");
    }
    try {
      return parseDecision(JSON.parse(stdout));
    } catch {
      throw new JevFailure("invalid-result");
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
export async function evaluateDemo(story: PublicInput, signal: AbortSignal): Promise<Decision> {
  await delay(1100, undefined, { signal });
  const category = story.id === "demo-release" ? "Release" : story.id === "demo-build" ? "Build" : "Other";
  // Deliberately no fabricated model probabilities, tokens or inference timings.
  return { category, probabilities: {}, needsReview: category === "Other" };
}
export async function saveRun(run: RunSnapshot) {
  const file = join(directory, "last-run.json");
  await writeFile(file + ".next", JSON.stringify(run, null, 2), { mode: 0o600 });
  await rename(file + ".next", file);
}
export async function lastRun(): Promise<RunSnapshot | null> {
  try {
    return JSON.parse(await readFile(join(directory, "last-run.json"), "utf8"));
  } catch {
    return null;
  }
}
