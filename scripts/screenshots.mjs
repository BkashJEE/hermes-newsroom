/**
 * Capture Newsroom screenshots at the target resolutions.
 *
 *   npm run dev            # in another terminal
 *   node scripts/screenshots.mjs
 *
 * Output goes to artifacts/screenshots/ (git-ignored). Uses playwright-core;
 * point CHROMIUM_PATH at a Chromium binary if Playwright's own is not installed.
 */
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3510";
const OUT = new URL("../artifacts/screenshots/", import.meta.url);

const SHOTS = [
  { name: "front-2560x1440", path: "/newsroom", width: 2560, height: 1440 },
  { name: "front-1920x1080", path: "/newsroom", width: 1920, height: 1080 },
  { name: "front-1440x900", path: "/newsroom", width: 1440, height: 900 },
  { name: "front-1024x768", path: "/newsroom", width: 1024, height: 768 },
  { name: "front-390x844", path: "/newsroom", width: 390, height: 844, fullPage: true },
  { name: "front-fullpage-1920", path: "/newsroom", width: 1920, height: 1080, fullPage: true },
  { name: "state-partial", path: "/newsroom?scenario=partial", width: 1920, height: 1080 },
  { name: "state-error", path: "/newsroom?scenario=error", width: 1920, height: 1080 },
  { name: "state-empty", path: "/newsroom?scenario=empty", width: 1920, height: 1080 },
  { name: "state-stale", path: "/newsroom?scenario=stale", width: 1920, height: 1080 },
  { name: "state-offline", path: "/newsroom?scenario=offline", width: 1920, height: 1080 },
  { name: "state-loading", path: "/newsroom?scenario=slow", width: 1920, height: 1080, waitMs: 400 },
  { name: "state-no-results", path: "/newsroom?q=zzzz-no-match", width: 1920, height: 1080 },
  { name: "section-live-wire", path: "/newsroom/live-wire", width: 1920, height: 1080 },
  { name: "tab-agents", path: "/agents", width: 1920, height: 1080 },
  {
    name: "tab-purpose-menu",
    path: "/agents",
    width: 1920,
    height: 1080,
    act: (page) => page.getByRole("button", { name: "Hermes Newsroom tools" }).click(),
  },
  {
    name: "drawer-intelligence-file",
    path: "/newsroom",
    width: 2560,
    height: 1440,
    act: (page) => page.getByRole("button", { name: /Open Intelligence File/ }).click(),
  },
];

const only = process.argv.slice(2);

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  for (const shot of SHOTS.filter((s) => !only.length || only.includes(s.name))) {
    const page = await browser.newPage({ viewport: { width: shot.width, height: shot.height } });
    await page.goto(BASE + shot.path, { waitUntil: "domcontentloaded" });
    if (shot.waitMs) await page.waitForTimeout(shot.waitMs);
    else await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(600);
    if (shot.act) {
      await shot.act(page);
      await page.waitForTimeout(500);
    }
    const file = fileURLToPath(new URL(`${shot.name}.png`, OUT));
    await page.screenshot({ path: file, fullPage: !!shot.fullPage });
    console.log(`saved ${shot.name}.png`);
    await page.close();
  }
} finally {
  await browser.close();
}
