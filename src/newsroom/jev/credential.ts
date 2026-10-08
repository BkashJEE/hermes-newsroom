import "server-only";
import { mkdir, readFile, writeFile, rename, unlink, chmod } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { stateDir } from "../config/state-path";
import { DIRECT_KEY } from "./transport";

/**
 * Where the Jev key lives, and who may see it.
 *
 * Editing `.env` means finding the clone, knowing the variable name and
 * restarting the server. A key pasted into the app is saved here instead: a
 * `0600` file in the state directory, read per request so it takes effect
 * immediately.
 *
 * The key is write-only from outside. Nothing returns it — not this module, not
 * the API, not the page. A caller can learn that a key exists and see its last
 * four characters, which is enough to tell two keys apart and useless to anyone
 * who steals the answer.
 */
const FILE = join(stateDir("jev"), "credential.json");

/** Long enough to be a key, short enough that a pasted file is rejected. */
const MIN = 16;
const MAX = 400;

export type CredentialSource = "saved" | "environment";

export interface CredentialStatus {
  configured: boolean;
  /** Which one the next request will actually use. */
  source: CredentialSource | null;
  /** Last four characters, to tell one key from another. Never the key. */
  hint: string | null;
  /** True when a key is saved here *and* the environment also sets one. */
  environmentOverridden: boolean;
}

export class CredentialError extends Error {}

/** Accept what could be a key; reject what plainly is not, before it is stored. */
export function validateKey(raw: unknown): string {
  if (typeof raw !== "string") throw new CredentialError("A key is required.");
  const key = raw.trim();
  if (key.length < MIN) throw new CredentialError("That is too short to be an API key.");
  if (key.length > MAX) throw new CredentialError("That is too long to be an API key.");
  // A key is a single opaque token. Whitespace or control characters mean the
  // paste picked up a shell line, a quoted .env entry, or a whole file.
  if (/[\s\u0000-\u001f\u007f]/.test(key))
    throw new CredentialError("Paste the key on its own, with no quotes, spaces or line breaks.");
  return key;
}

export function hintFor(key: string): string {
  return key.slice(-4);
}

async function savedKey(): Promise<string | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(FILE, "utf8"));
    const key = (parsed as { key?: unknown })?.key;
    return typeof key === "string" && key.trim() ? key.trim() : null;
  } catch {
    // Missing or unreadable is simply "no saved key"; the environment may still have one.
    return null;
  }
}

/**
 * The key the next Jev request should use.
 *
 * A key saved through the app wins over the environment. Someone who just typed
 * one into the screen means that one, and silently preferring a stale variable
 * they cannot see from there would be the wrong surprise.
 */
export async function jevKey(env: Record<string, string | undefined> = process.env): Promise<string | null> {
  return (await savedKey()) ?? env[DIRECT_KEY]?.trim() ?? null;
}

export async function credentialStatus(
  env: Record<string, string | undefined> = process.env,
): Promise<CredentialStatus> {
  const saved = await savedKey();
  const fromEnv = env[DIRECT_KEY]?.trim() || null;
  const inUse = saved ?? fromEnv;
  return {
    configured: inUse !== null,
    source: saved ? "saved" : fromEnv ? "environment" : null,
    hint: inUse ? hintFor(inUse) : null,
    environmentOverridden: Boolean(saved && fromEnv),
  };
}

export async function saveKey(raw: unknown): Promise<CredentialStatus> {
  const key = validateKey(raw);
  const directory = stateDir("jev");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  // Write and chmod before the rename, so the key is never briefly world-readable.
  const temporary = join(directory, `${randomUUID()}.tmp`);
  await writeFile(temporary, JSON.stringify({ key }), { mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, FILE);
  return credentialStatus();
}

export async function clearKey(): Promise<CredentialStatus> {
  await unlink(FILE).catch(() => {});
  return credentialStatus();
}
