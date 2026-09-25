import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the open-source core against leaking private material. Scans every
 * file that ships (source, config examples, docs, public assets, scripts).
 */
const ROOT = path.resolve(__dirname, "..");
const SCAN = [
  "src",
  "config",
  "docs",
  "public",
  "scripts",
  "skills",
  "deploy",
  "README.md",
  ".env.example",
  "package.json",
];
const SKIP_FILES = new Set(["config/newsroom.local.json"]);

const FORBIDDEN: [string, RegExp][] = [
  ["absolute home path", /\/home\/[a-z0-9_-]+\//i],
  ["Windows user path", /[A-Z]:\\Users\\/],
  ["private key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["OpenAI/Anthropic-style key", /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{30,}/],
  ["Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["Google OAuth client secret", /GOCSPX-[A-Za-z0-9_-]{10,}/],
  ["email address", /\b[A-Za-z0-9._%+-]+@(?!example\.(?:com|org))[A-Za-z0-9.-]+\.[a-z]{2,}\b/],
];

function files(entry: string): string[] {
  const full = path.join(ROOT, entry);
  let stat;
  try {
    stat = statSync(full);
  } catch {
    return [];
  }
  if (stat.isFile()) return [entry];
  return readdirSync(full).flatMap((name) => files(path.join(entry, name)));
}

const scanned = SCAN.flatMap(files).filter(
  (f) => !SKIP_FILES.has(f) && !/\.(png|jpe?g|webp|woff2?)$/i.test(f),
);

describe("open-source hygiene", () => {
  it("scans a meaningful set of files", () => {
    expect(scanned.length).toBeGreaterThan(40);
  });

  it.each(FORBIDDEN)("no %s in shipped files", (_label, pattern) => {
    const hits = scanned.filter((file) => pattern.test(readFileSync(path.join(ROOT, file), "utf8")));
    expect(hits).toEqual([]);
  });

  it("keeps secrets and local config out of git", () => {
    const ignore = readFileSync(path.join(ROOT, ".gitignore"), "utf8");
    for (const rule of [".env", "config/*.local.json", "artifacts/"]) expect(ignore).toContain(rule);
    expect(ignore).toContain("!.env.example");
  });

  it("never exposes provider secrets through NEXT_PUBLIC_ variables", () => {
    const example = readFileSync(path.join(ROOT, ".env.example"), "utf8");
    const publicSecrets = example
      .split("\n")
      .filter((line) => /^NEXT_PUBLIC_/.test(line) && /(TOKEN|SECRET|KEY|PASSWORD)/.test(line));
    expect(publicSecrets).toEqual([]);
  });
});
