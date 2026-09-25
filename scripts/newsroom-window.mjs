/** Navigate only the dedicated desktop Newsroom profile; never create a tab. */
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";

const routes = {
  front: "",
  livewire: "/live-wire",
  updates: "/hermes-agent-updates",
  daily: "/hermes-daily",
  personal: "/personal-daily",
  weekly: "/weekly-chronicle",
  built: "/built-with-hermes",
  trends: "/trend-radar",
  archive: "/archive",
  generate: "",
};
const action = process.argv[2];
if (!Object.hasOwn(routes, action)) throw new Error("Unknown Newsroom action");
const profile = join(homedir(), ".local/share/omarchy-newsroom-browser");
const port = Number((await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid browser port");
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 10000 });
try {
  const base = "http://127.0.0.1:3520/newsroom";
  const pages = browser.contexts().flatMap((context) => context.pages());
  const page = pages.find(
    (p) => p.url() === base || p.url().startsWith(base + "/") || p.url().startsWith(base + "?"),
  );
  if (!page) throw new Error("The dedicated Newsroom window is not ready");
  await page.goto(base + routes[action], { waitUntil: "domcontentloaded", timeout: 15000 });
  if (action === "generate") {
    await page.getByRole("button", { name: "Generate Daily", exact: true }).click();
    await page.getByRole("dialog", { name: /Hermes Daily/ }).waitFor();
  }
  console.log(JSON.stringify({ action, url: page.url(), pages: pages.length }));
} finally {
  // Disconnecting CDP leaves the persistent desktop window running.
  await browser.close();
}
