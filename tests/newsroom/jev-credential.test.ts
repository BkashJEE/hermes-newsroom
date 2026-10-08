import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, stat, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let directory: string;

// The store resolves its path at import time, so point the state directory at a
// scratch copy before the module loads.
vi.mock("@/newsroom/config/state-path", () => ({
  stateDir: (...segments: string[]) => join(directory, ...segments),
  resolveStateDir: (...segments: string[]) => join(directory, ...segments),
  APP_DIR: "test",
}));

async function store() {
  vi.resetModules();
  return import("@/newsroom/jev/credential");
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "jev-credential-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("accepting a key", () => {
  it("rejects what is plainly not a key, before storing anything", async () => {
    const { validateKey } = await store();
    expect(() => validateKey("short")).toThrow(/too short/);
    expect(() => validateKey("x".repeat(401))).toThrow(/too long/);
    expect(() => validateKey(12345)).toThrow(/required/);
    // The three ways a paste goes wrong: a shell line, a quoted .env entry, a file.
    expect(() => validateKey("export TYPESAFE_API_KEY=abcdefghijklmnop")).toThrow(/on its own/);
    expect(() => validateKey("abcdefghijklmnop\nmore")).toThrow(/on its own/);
  });

  it("trims surrounding whitespace, because a paste usually carries some", async () => {
    const { validateKey } = await store();
    expect(validateKey("  ts_abcdefghijklmnop  ")).toBe("ts_abcdefghijklmnop");
  });
});

describe("storing a key", () => {
  const KEY = "ts_abcdefghijklmnopqrstuvwxyz";

  it("writes a file only this user can read", async () => {
    const { saveKey } = await store();
    await saveKey(KEY);
    const file = join(directory, "jev", "credential.json");
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(file, "utf8")).key).toBe(KEY);
  });

  it("reports that a key exists and its last four, and never the key", async () => {
    const { saveKey, credentialStatus } = await store();
    const status = await saveKey(KEY);
    expect(status).toEqual({
      configured: true,
      source: "saved",
      hint: "wxyz",
      environmentOverridden: false,
    });
    // Nothing anywhere in the reported status contains the key itself.
    expect(JSON.stringify(await credentialStatus())).not.toContain(KEY);
  });

  it("prefers the key someone just typed over one in the environment, and says so", async () => {
    const { saveKey, jevKey, credentialStatus } = await store();
    const env = { TYPESAFE_API_KEY: "ts_environment_key_value" };
    expect(await jevKey(env)).toBe("ts_environment_key_value");
    await saveKey(KEY);
    expect(await jevKey(env)).toBe(KEY);
    const status = await credentialStatus(env);
    expect(status.source).toBe("saved");
    expect(status.environmentOverridden).toBe(true);
  });

  it("falls back to the environment once the saved key is removed", async () => {
    const { saveKey, clearKey, jevKey } = await store();
    const env = { TYPESAFE_API_KEY: "ts_environment_key_value" };
    await saveKey(KEY);
    await clearKey();
    expect(await jevKey(env)).toBe("ts_environment_key_value");
    expect(await jevKey({})).toBeNull();
  });

  it("treats an unreadable store as no key rather than failing the page", async () => {
    const { jevKey, credentialStatus } = await store();
    expect(await jevKey({})).toBeNull();
    expect(await credentialStatus({})).toMatchObject({ configured: false, source: null, hint: null });
  });

  it("removing a key that was never there is not an error", async () => {
    const { clearKey } = await store();
    await expect(clearKey()).resolves.toMatchObject({ configured: false });
  });
});
