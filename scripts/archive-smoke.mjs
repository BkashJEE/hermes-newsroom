/** Run only against an isolated demo server with an empty permanent archive. */
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
if (process.env.NEWSROOM_ARCHIVE_SMOKE !== "1")
  throw new Error("Set NEWSROOM_ARCHIVE_SMOKE=1 and use an isolated state directory for this test.");
const base = process.env.BASE_URL ?? "http://127.0.0.1:3510";
const out = new URL("../artifacts/archive/", import.meta.url);
await mkdir(out, { recursive: true });
const read = async () => {
  const response = await fetch(`${base}/api/newsroom/archive`, { headers: { "x-newsroom-client": "1" } });
  assert(response.ok);
  return response.json();
};
const initial = await read();
assert.equal(initial.records.length, 0, "Use a fresh isolated archive.");
assert.equal(initial.editions.length, 0, "Use a fresh isolated archive.");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, reducedMotion: "reduce" });
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(`${base}/newsroom`);
  await page.getByRole("button", { name: "Read story & sources" }).waitFor();
  const saved = page.waitForResponse(
    (r) => r.url().endsWith("/api/newsroom/archive") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save", exact: true }).first().click();
  assert((await saved).ok());
  await page.getByRole("button", { name: "Saved", exact: true }).first().waitFor();
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${base}/newsroom/archive`);
  await page.getByRole("region", { name: "Saved · 1" }).waitFor();
  await page.goto(`${base}/newsroom/editions?range=today`);
  await page.getByRole("button", { name: "Save dated edition" }).click();
  await page.getByRole("link", { name: "Read saved edition" }).click();
  await page.getByRole("region", { name: "Saved edition" }).waitFor();
  assert(await page.getByText("Demo snapshot · fixture data").isVisible());
  const dailyUrl = page.url();
  const daily = (await read()).editions[0];
  assert(daily.reports.length > 0);
  await page.goto(`${base}/newsroom/editions?range=week`);
  await page.getByRole("button", { name: "Save dated edition" }).click();
  await page.getByRole("link", { name: "Read saved edition" }).click();
  await page.getByRole("region", { name: "Saved edition" }).waitFor();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export backup" }).click();
  const download = await downloadEvent;
  const backup = JSON.parse(await readFile(await download.path(), "utf8"));
  assert.equal(backup.records.length, 1);
  assert.equal(backup.editions.length, 2);
  await page.locator('input[type="file"]').setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page.getByText("Backup restored. Existing records were kept; missing records were added.").waitFor();
  assert.equal((await read()).editions.length, 2);
  await page.locator('input[type="file"]').setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":99}'),
  });
  await page.getByText("Invalid archive data. Use a Newsroom version 1 backup.").waitFor();
  assert.equal((await read()).editions.length, 2);
  await page.evaluate(() => localStorage.clear());
  await page.route("**/api/newsroom", (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"Source unavailable"}' }),
  );
  await page.goto(dailyUrl);
  await page.getByRole("region", { name: "Saved edition" }).waitFor();
  assert.equal(
    await page.getByRole("region", { name: "Saved edition" }).getByRole("article").count(),
    daily.reports.length,
  );
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1080 });
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `Archive overflows at ${width}`,
    );
    await page.screenshot({ path: fileURLToPath(new URL(`archive-${width}.png`, out)), fullPage: true });
  }
  assert.deepEqual(errors, []);
  console.log(
    "Archive checks passed: durable bookmark, cleared browser storage, daily/weekly snapshots, backup round trip, invalid import, provider failure and responsive layouts.",
  );
} finally {
  await browser.close();
}
