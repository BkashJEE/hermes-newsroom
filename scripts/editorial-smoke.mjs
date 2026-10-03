/** Check the Editions migration and five-event briefing against a running demo server. */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

const base = process.env.BASE_URL ?? "http://127.0.0.1:3510";
const out = new URL("../artifacts/editorial/", import.meta.url);
await mkdir(out, { recursive: true });
for (const [old, range] of [
  ["hermes-daily", "today"],
  ["weekly-chronicle", "week"],
]) {
  const response = await fetch(`${base}/newsroom/${old}?q=Hermes&range=custom&source=github`, {
    redirect: "manual",
  });
  assert.equal(response.status, 308);
  const destination = new URL(response.headers.get("location"), base);
  assert.equal(destination.pathname, "/newsroom/editions");
  assert.equal(destination.searchParams.get("range"), range);
  assert.equal(destination.searchParams.get("q"), "Hermes");
  assert.equal(destination.searchParams.get("source"), "github");
}
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const errors = [];
const page = await browser.newPage();
page.on("pageerror", (error) => errors.push(error.message));
try {
  for (const width of [1920, 1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 1080 });
    await page.goto(`${base}/newsroom`);
    await page.getByRole("button", { name: "Read story & sources" }).waitFor();
    assert.equal(await page.locator("main article").count(), 5);
    assert.equal(await page.getByRole("table").count(), 0);
    assert.equal(await page.getByRole("region", { name: "Breaking intelligence" }).count(), 0);
    assert.equal(await page.getByRole("heading", { name: "What should I do?" }).count(), 0);
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `Front page overflows at ${width}`,
    );
    await page.screenshot({ path: new URL(`front-${width}.png`, out).pathname, fullPage: true });
  }
  await page.locator("summary").filter({ hasText: "Collection record" }).click();
  assert(await page.getByRole("region", { name: "Collection record" }).isVisible());
  await page.getByRole("button", { name: "Read story & sources" }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "Close intelligence file" }).click();
  for (const width of [1920, 390]) {
    await page.setViewportSize({ width, height: 1080 });
    await page.goto(`${base}/newsroom/editions?range=today`);
    await page.getByRole("button", { name: "Flashcards", exact: true }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Flashcards", exact: true }).getAttribute("aria-pressed"),
      "true",
    );
    assert(await page.getByRole("combobox", { name: "Time range", exact: true }).isDisabled());
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `Today overflows at ${width}`,
    );
    await page.screenshot({ path: new URL(`today-${width}.png`, out).pathname, fullPage: true });
    await page.getByRole("link", { name: "This week", exact: true }).click();
    await page.getByRole("region", { name: "Hermes ecosystem this week" }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get("range"), "week");
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `Week overflows at ${width}`,
    );
    await page.screenshot({ path: new URL(`week-${width}.png`, out).pathname, fullPage: true });
    await page.goBack();
    await page.getByRole("button", { name: "Flashcards", exact: true }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get("range"), "today");
    await page.goForward();
    await page.getByRole("region", { name: "Hermes ecosystem this week" }).waitFor();
  }
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.emulateMedia({ media: "print" });
  assert.equal(await page.getByRole("navigation", { name: "Edition range" }).isVisible(), false);
  assert(await page.getByRole("region", { name: "Hermes ecosystem this week" }).isVisible());
  await page.pdf({ path: new URL("weekly.pdf", out).pathname, preferCSSPageSize: true });
  await page.emulateMedia({ media: "screen" });
  await page.goto(`${base}/newsroom/editions?range=today`);
  await page.getByRole("button", { name: "Flashcards", exact: true }).waitFor();
  await page.emulateMedia({ media: "print" });
  assert.equal(await page.getByRole("region", { name: /^Newspaper page/ }).count(), 4);
  for (const sheet of await page.getByRole("region", { name: /^Newspaper page/ }).all())
    assert(await sheet.isVisible());
  assert.equal(await page.getByRole("navigation", { name: "Edition range" }).isVisible(), false);
  await page.pdf({ path: new URL("daily.pdf", out).pathname, preferCSSPageSize: true });
  assert.deepEqual(errors, []);
  console.log(
    "Editorial checks passed: legacy redirects, responsive briefing, source drawer, Editions history and both print layouts.",
  );
} finally {
  await browser.close();
}
