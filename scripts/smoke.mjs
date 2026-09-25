/**
 * Real-browser smoke test for the Command Center and the Hermes Newsroom.
 *
 *   npm run dev   (or npm run build && npm start)
 *   node scripts/smoke.mjs
 *
 * Checks keyboard flow, dialogs, filters, actions, interface states,
 * reduced motion, every Command Center tab and the browser console.
 * Exits non-zero on any failure. Set CHROMIUM_PATH if Playwright's own
 * Chromium is not installed.
 */
import { chromium } from "playwright-core";
import { readFile } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3510";
if (new URL(BASE).port === "3520" && process.env.ALLOW_STATEFUL_SMOKE !== "1") {
  throw new Error(
    "The smoke suite runs demo and collection actions that change saved Newsroom state. Run it against the dev server on port 3510, or set ALLOW_STATEFUL_SMOKE=1 if that state change is intentional.",
  );
}
const results = [];
const consoleErrors = [];

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error: error.message.split("\n")[0] });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

async function open(path, { width = 1920, height = 1080, reducedMotion = "no-preference", prepare } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion });
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(`${path}: ${msg.text()}`);
  });
  page.on("pageerror", (err) => consoleErrors.push(`${path}: ${err.message}`));
  if (prepare) await prepare(page);
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  return { page, context };
}

const leadHeading = (page) => page.locator("#lead-headline");
let selectedStoryTitle = "";

try {
  // --- existing Command Center tabs --------------------------------------
  for (const [path, label] of [
    ["/x-studio", "X-Studio"],
    ["/agents", "Agents Lab"],
    ["/social", "Social Media"],
    ["/messages", "Messages"],
    ["/hermes", "Hermes OS"],
    ["/git", "Git"],
    ["/build", "Build"],
  ]) {
    await check(`tab ${label} renders and is marked current`, async () => {
      const { page, context } = await open(path);
      await page.getByRole("heading", { level: 1, name: label }).waitFor({ timeout: 10_000 });
      const current = await page.getByRole("link", { name: label, exact: true }).getAttribute("aria-current");
      assert(current === "page", `aria-current=${current}`);
      await context.close();
    });
  }

  await check("X-Studio shows the Jev process in the app", async () => {
    const { page, context } = await open("/x-studio");
    const studio = page.getByRole("region", { name: "Hermes Newsroom in X-Studio" });
    await studio.getByRole("heading", { name: "Jev Live Desk" }).waitFor({ timeout: 15_000 });
    assert(
      await studio.getByRole("link", { name: "Open full Live Wire" }).isVisible(),
      "Live Wire link missing",
    );
    await context.close();
  });

  await check("home redirects to Agents Lab", async () => {
    const { page, context } = await open("/");
    await page.waitForURL(/\/agents$/, { timeout: 10_000 });
    await context.close();
  });

  await check("tab purpose menu opens, navigates by arrow keys, closes with Escape", async () => {
    const { page, context } = await open("/agents");
    await page.getByRole("button", { name: "Git tools" }).click();
    const menu = page.getByRole("menu", { name: "Git tools" });
    await menu.waitFor();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Escape");
    assert(!(await menu.isVisible()), "menu still visible");
    await context.close();
  });

  await check("Hermes Newsroom tab navigates to the Newsroom", async () => {
    const { page, context } = await open("/agents");
    await page.getByRole("link", { name: "Hermes Newsroom", exact: true }).click();
    await page.waitForURL(/\/newsroom$/);
    await leadHeading(page).waitFor({ timeout: 10_000 });
    await context.close();
  });

  // --- Newsroom Front Page -----------------------------------------------
  const { page, context } = await open("/newsroom");
  await leadHeading(page).waitFor({ timeout: 15_000 });

  await check("Newsroom uses the desktop bar without a duplicate tab strip", async () => {
    assert(
      (await page.getByRole("navigation", { name: "Command Center tabs" }).count()) === 0,
      "duplicate strip visible",
    );
  });

  await check("sections: public navigation entries work", async () => {
    const labels = [
      "Live Wire",
      "Hermes Daily",
      "Weekly Chronicle",
      "Built With Hermes",
      "Trend Radar",
      "Content Desk",
      "Archive",
    ];
    for (const label of labels) {
      await page
        .getByRole("navigation", { name: "Newsroom sections" })
        .getByRole("link", { name: label, exact: true })
        .click();
      await page.getByRole("heading", { level: 2, name: label }).waitFor();
      assert(
        await page.getByText("Workspace", { exact: true }).isVisible(),
        `${label} missing Preview badge`,
      );
    }
    await page
      .getByRole("navigation", { name: "Newsroom sections" })
      .getByRole("link", { name: "Front Page" })
      .click();
    await leadHeading(page).waitFor();
  });

  await check("personal newspaper honors the configuration gate", async () => {
    const response = await page.request.get(BASE + "/api/newsroom");
    const feed = await response.json();
    const link = page.locator('nav a[href="/newsroom/personal-daily"]');
    if (!feed.personalDaily?.enabled) {
      assert((await link.count()) === 0, "disabled personal section is visible");
      const privateResponse = await page.request.get(BASE + "/api/newsroom/personal", {
        headers: { "X-Newsroom-Client": "1" },
      });
      assert(privateResponse.status() === 404, "disabled private API did not reject access");
      return;
    }
    await link.click();
    await page.getByRole("heading", { level: 2, name: feed.personalDaily.title }).waitFor();
    await page.getByText(/which may call a cloud model/).waitFor();
    assert(
      (await page.getByRole("button", { name: "Generate Daily", exact: true }).count()) === 0,
      "external brief controls remain in personal section",
    );
    await page
      .getByRole("navigation", { name: "Newsroom sections" })
      .getByRole("link", { name: "Front Page" })
      .click();
    await leadHeading(page).waitFor();
  });

  await check("search filters and persists in the URL", async () => {
    const title = (await leadHeading(page).textContent()).trim();
    await page.getByRole("searchbox", { name: "Search stories" }).fill(title);
    await page.waitForURL((url) => url.searchParams.get("q") === title);
    await page.getByRole("heading", { level: 2, name: title, exact: true }).waitFor();
    await page.getByRole("searchbox", { name: "Search stories" }).fill("");
    await page.waitForURL((url) => !url.searchParams.has("q"));
  });

  for (const [label, name, value] of [
    ["source", "Source", "reddit"],
    ["time range", "Time range", "week"],
    ["type", "Type", "developing"],
    ["sort", "Sort", "least-covered"],
  ]) {
    await check(`${label} dropdown filters and persists`, async () => {
      await page.getByRole("combobox", { name, exact: true }).selectOption(value);
      await page.waitForURL(new RegExp(`=${value}`));
      await page.getByRole("combobox", { name, exact: true }).selectOption({ index: 0 });
    });
  }

  await check("filters survive a reload", async () => {
    // The preceding dropdown check leaves the time range at Live (15 minutes).
    // Reset it before choosing a source from the currently available stories.
    await page.goto(`${BASE}/newsroom`);
    await leadHeading(page).waitFor();
    const sourceText = await page
      .getByRole("table")
      .getByRole("row")
      .nth(1)
      .getByRole("cell")
      .first()
      .innerText();
    const source = await page
      .getByRole("combobox", { name: "Source", exact: true })
      .locator("option")
      .evaluateAll(
        (options, text) =>
          options
            .map((o) => ({ value: o.value, label: o.textContent.trim() }))
            .find((o) => o.value !== "all" && text.includes(o.label)),
        sourceText,
      );
    assert(source, "no displayed source matches the filter options");
    try {
      await page.goto(`${BASE}/newsroom?source=${encodeURIComponent(source.value)}&sort=newest&range=custom`);
      const loaded = page
        .getByRole("table")
        .or(page.getByRole("heading", { name: "No stories match", exact: true }));
      await loaded.waitFor();
      await page.reload();
      await loaded.waitFor();
      assert(
        (await page.getByRole("combobox", { name: "Source", exact: true }).inputValue()) === source.value,
        "source lost",
      );
      if (await page.getByRole("table").count()) {
        const firstRow = await page.getByRole("table").getByRole("row").nth(1).innerText();
        assert(firstRow.includes(source.label), `first row does not match ${source.label}`);
      }
    } finally {
      await page.goto(`${BASE}/newsroom`);
      await leadHeading(page).waitFor();
    }
  });

  await check("flashcard expands", async () => {
    await page.getByRole("button", { name: "Expand" }).first().click();
    // The label flips to "Less" once expanded.
    const less = page.getByRole("button", { name: "Less", exact: true });
    assert((await less.getAttribute("aria-expanded")) === "true", "not expanded");
    await page.getByRole("heading", { level: 4, name: "Why it matters" }).waitFor();
    await less.click();
  });

  await check("intelligence file: opens, traps focus, closes on Escape, returns focus", async () => {
    const title = (await leadHeading(page).textContent()).trim();
    const opener = page.getByRole("button", { name: /Open Intelligence File/ });
    await opener.click();
    const dialog = page.getByRole("dialog", { name: title });
    await dialog.waitFor();
    for (let i = 0; i < 25; i++) await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => !!document.activeElement?.closest("dialog[open]"));
    assert(inside, "focus escaped the dialog");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    const focusedText = await page.evaluate(() => document.activeElement?.textContent ?? "");
    assert(/Open Intelligence File/i.test(focusedText), `focus returned to: ${focusedText}`);
  });

  await check("live list row opens its story", async () => {
    const row = page.getByRole("table").getByRole("button").first();
    selectedStoryTitle = (await row.textContent()).trim();
    await row.click();
    const dialog = page.getByRole("dialog", { name: selectedStoryTitle, exact: true });
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "Close intelligence file" }).click();
    await dialog.waitFor({ state: "hidden" });
  });

  const rail = page.getByRole("region", { name: "What should I do?" });
  await check("action Post opens an editable draft", async () => {
    await rail.getByRole("button", { name: /^Post/ }).click();
    const dialog = page.getByRole("dialog", { name: "Draft a post" });
    await dialog.waitFor();
    const text = await dialog.getByRole("textbox").inputValue();
    await page.keyboard.press("Escape");
    // The rail acts on the story opened last (the live-list row above).
    assert(
      text.startsWith(`**${selectedStoryTitle}**`) && text.includes("Source: "),
      "structured draft not prefilled",
    );
    await dialog.waitFor({ state: "hidden" });
  });
  await check("action Reply opens a reply draft", async () => {
    await rail.getByRole("button", { name: /^Reply/ }).click();
    const dialog = page.getByRole("dialog", { name: /Reply to/ });
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await dialog.waitFor({ state: "hidden" });
  });
  await check("action Test adds a testing task", async () => {
    await rail.getByRole("button", { name: /^Test/ }).click();
    await rail
      .getByText(/Test: /)
      .first()
      .waitFor();
  });
  await check("action Build saves a build idea", async () => {
    await rail.getByRole("button", { name: /^Build/ }).click();
    await rail
      .getByText(/Build idea: /)
      .first()
      .waitFor();
  });
  await check("action Track toggles tracking", async () => {
    await rail.getByRole("button", { name: /^Track/ }).click();
    await rail.getByRole("button", { name: /^Tracking/ }).waitFor();
    await rail.getByRole("button", { name: /^Tracking/ }).click();
  });
  await check("action Ignore dismisses with undo", async () => {
    await rail.getByRole("button", { name: /^Ignore/ }).click();
    await page.getByRole("button", { name: "Undo" }).click();
    await leadHeading(page).waitFor();
  });

  await check("content opportunity drafts a post and saves it locally", async () => {
    const opportunity = page.getByRole("button", { name: /Draft Post/ });
    // Sparse live feeds may have no separate content opportunity; exercise the desk action.
    if (await opportunity.count()) await opportunity.click();
    else await rail.getByRole("button", { name: /^Post/ }).click();
    const dialog = page.getByRole("dialog", { name: "Draft a post" });
    await dialog.getByRole("textbox").fill("Edited draft text");
    await dialog.getByRole("button", { name: "Save draft" }).click();
    await dialog.waitFor({ state: "hidden" });
    await rail
      .getByText(/Draft: /)
      .first()
      .waitFor();
  });

  await check("Generate Daily opens a brief", async () => {
    await page.getByRole("button", { name: "Generate Daily" }).click();
    const dialog = page.getByRole("dialog", { name: /Hermes Daily —/ });
    await dialog.waitFor();
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
  });

  await check("'/' focuses search", async () => {
    await page.locator("body").click({ position: { x: 5, y: 600 } });
    await page.keyboard.press("/");
    const id = await page.evaluate(() => document.activeElement?.id);
    assert(id === "newsroom-search", `focused ${id}`);
    await page.keyboard.press("Escape");
  });

  await check("keyboard focus is visible on controls", async () => {
    await page.getByRole("button", { name: "Refresh now" }).focus();
    await page.keyboard.press("Tab");
    const shadow = await page.evaluate(() => getComputedStyle(document.activeElement).boxShadow);
    assert(shadow && shadow !== "none", "no focus ring");
  });

  await check("refresh updates the timestamp without errors", async () => {
    await page.getByRole("button", { name: "Refresh now" }).click();
    await page.getByText(/Updated/).waitFor();
  });

  await check("Live/Paused toggle", async () => {
    const live = page.getByRole("button", { name: /Live/ }).first();
    await live.click();
    await page.getByRole("button", { name: /Paused/ }).waitFor();
    await page.getByRole("button", { name: /Paused/ }).click();
  });

  await check("ticker dismisses", async () => {
    const ticker = page.getByRole("region", { name: "Breaking intelligence" });
    // Live sources do not manufacture breaking stories merely to show a ticker.
    if (!(await ticker.count())) return;
    await ticker.getByRole("button", { name: "Dismiss breaking ticker" }).click();
    await ticker.waitFor({ state: "detached" });
  });
  await context.close();

  // Section controls must affect their actual contents, not only the URL.
  for (const [section, emptyText] of [
    ["live-wire", "No stories match the current filters."],
    ["weekly-chronicle", "No Hermes updates match this week's filters."],
    ["built-with-hermes", "No new builds right now."],
    ["content-desk", "No recommendations match the current filters."],
    ["archive", "No saved stories yet. Use the bookmark on any card or story."],
    ["trend-radar", "No topics in the current view."],
  ]) {
    await check(`${section}: search, evidence scope and mobile layout`, async () => {
      const s = await open(`/newsroom/${section}?q=zzzz-no-match`, { width: 390, height: 844 });
      try {
        await s.page.getByText(emptyText, { exact: true }).waitFor({ timeout: 10000 });
        const panel = s.page.locator("details").filter({ has: s.page.locator("#hermes-question") });
        await panel.locator("summary").click();
        await panel.getByText(/Reviews 0 current feed stories/).waitFor();
        assert(
          !(await panel.getByRole("button", { name: /Ask Hermes|Write weekly/ }).isEnabled()),
          "empty selection can invoke Hermes",
        );
        if (["weekly-chronicle", "built-with-hermes", "archive"].includes(section))
          assert(
            !(await s.page.getByRole("combobox", { name: "Time range", exact: true }).isEnabled()),
            "fixed section date is misleading",
          );
        assert(
          await s.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          "mobile section overflows",
        );
        await s.page.getByRole("button", { name: "Clear filters", exact: true }).click();
        await s.page.waitForURL((url) => !url.searchParams.has("q"));
      } finally {
        await s.context.close();
      }
    });
  }

  for (const section of ["weekly-chronicle", "built-with-hermes", "hermes-daily", "live-wire"]) {
    await check(`${section}: section heading and controls remain pinned without overlap`, async () => {
      const s = await open(`/newsroom/${section}`, { width: 1920, height: 700 });
      try {
        const content =
          section === "live-wire"
            ? s.page.getByRole("table")
            : section === "built-with-hermes"
              ? s.page
                  .getByRole("region", { name: "Popular community projects", exact: true })
                  .getByRole("article")
                  .first()
              : s.page.getByRole("article").first();
        await content.waitFor({ timeout: 15000 });
        for (const width of [1920, 390]) {
          await s.page.setViewportSize({ width, height: 700 });
          if (section === "live-wire")
            await content.evaluate((node) =>
              window.scrollTo(0, window.scrollY + node.getBoundingClientRect().top),
            );
          else await s.page.evaluate(() => window.scrollTo(0, 600));
          await s.page.waitForTimeout(100);
          const scroll = await s.page.evaluate(() => window.scrollY);
          assert(scroll > 100, `not enough content to check scrolling at ${width}px`);
          const bar = await s.page
            .locator("header")
            .filter({ has: s.page.getByRole("heading", { level: 1 }) })
            .boundingBox();
          const heading = await s.page.locator("[data-section-heading]").boundingBox();
          assert(
            Math.abs(heading.y - bar.height) <= 2,
            `section heading moved or overlaps: ${heading.y}, bar ${bar.height}`,
          );
          const toolbar =
            section === "live-wire"
              ? s.page.locator("header").filter({ has: s.page.locator("#live-heading") })
              : s.page.locator("[data-section-toolbar]").first();
          const box = await toolbar.boundingBox();
          assert(box.y >= heading.y + heading.height - 2, "toolbar overlaps title");
          assert(box.y + box.height < 650, "sticky controls consume the viewport");
          assert(
            await toolbar.evaluate((node) => {
              const rect = node.getBoundingClientRect();
              return node.contains(
                document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
              );
            }),
            `another layer blocks the sticky toolbar at ${width}px: ${await toolbar.evaluate((node) => {
              const r = node.getBoundingClientRect();
              const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
              return `${hit?.tagName} ${hit?.className} at ${JSON.stringify(r.toJSON())}`;
            })}`,
          );
        }
      } finally {
        await s.context.close();
      }
    });
  }

  await check("weekly recaps: compact cards, distinct desks and expandable sources", async () => {
    const s = await open("/newsroom/weekly-chronicle");
    try {
      const card = s.page.locator("[data-weekly-card]").first();
      await card.waitFor();
      for (const width of [1920, 390]) {
        await s.page.setViewportSize({ width, height: 800 });
        await s.page.waitForTimeout(100);
        const cards = await s.page.locator("[data-weekly-card]").evaluateAll((nodes) =>
          nodes
            .filter((n) => n.getBoundingClientRect().height > 0)
            .map((n) => ({
              height: n.getBoundingClientRect().height,
              points: n.querySelector("ul").children.length,
            })),
        );
        assert(
          cards.every((c) => c.height < 360 && c.points <= 2),
          "weekly cards are too tall or verbose",
        );
        assert(
          await s.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          "weekly grid overflows",
        );
      }
      for (const name of ["Shipped this week", "Inside Hermes Agent", "Community builds & reports"])
        assert(await s.page.getByRole("region", { name, exact: true }).isVisible(), `missing desk: ${name}`);
      await card.locator("summary").click();
      assert(await card.locator("details a").first().isVisible(), "expanded recap has no source");
      await card.locator("summary").click();
    } finally {
      await s.context.close();
    }
  });

  await check("Jev Live Desk: streamed demo, review, evidence download and mobile layout", async () => {
    const s = await open("/newsroom/live-wire");
    try {
      const desk = s.page.getByRole("region", { name: "Jev Live Desk", exact: true });
      await desk.getByRole("button", { name: "Watch demo · no API call", exact: true }).click();
      const processing = desk.getByRole("region", { name: "Processing", exact: true });
      await processing.getByRole("article").waitFor({ timeout: 5000 });
      assert(
        await desk.getByText("Run in progress", { exact: true }).isVisible(),
        "no visible running state",
      );
      await desk.getByText("Run complete", { exact: true }).waitFor({ timeout: 15000 });
      assert(
        await desk.getByText("DEMO — scripted examples, no model call", { exact: true }).isVisible(),
        "demo is not identified",
      );
      const results = desk.getByRole("region", { name: "Results & review", exact: true });
      assert((await results.getByRole("article").count()) === 3, "missing decisions");
      const first = results.getByRole("article").first();
      await first.getByRole("combobox").selectOption("Research");
      assert(
        await first.getByText("Research · your override", { exact: true }).isVisible(),
        "review choice not applied",
      );
      const downloadPromise = s.page.waitForEvent("download");
      await desk.getByRole("button", { name: "Download proof JSON", exact: true }).click();
      const download = await downloadPromise;
      const proof = JSON.parse(await readFile(await download.path(), "utf8"));
      assert(proof.mode === "demo" && proof.model.includes("no model"), "export hides demo provenance");
      assert(proof.humanOverrides["demo-release"] === "Research", "export omits human review");
      assert(
        proof.events.some((e) => e.message.startsWith("Processing:")),
        "event evidence missing",
      );
      await s.page.setViewportSize({ width: 390, height: 844 });
      assert(
        await s.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        "Jev board overflows mobile",
      );
      assert(
        !(await desk.getByRole("button", { name: "Run live Jev", exact: true }).isEnabled()),
        "paid run lacks explicit consent gate",
      );
    } finally {
      await s.context.close();
    }
  });

  await check(
    "live news collection preview streams selection without model consent and fits mobile",
    async () => {
      const s = await open("/newsroom/live-wire");
      try {
        const feed = await (await s.page.request.get(BASE + "/api/newsroom")).json();
        if (feed.mode !== "live") return;
        const desk = s.page.getByRole("region", { name: "Jev Live Desk", exact: true });
        await desk.getByRole("button", { name: "Fetch news · no Jev call", exact: true }).click();
        const flow = desk.getByRole("region", { name: "Live news process", exact: true });
        await flow.getByText(/Collection finished. No Jev call has started/).waitFor({ timeout: 20000 });
        assert(
          await flow.getByRole("list", { name: "News process stages" }).isVisible(),
          "missing process stages",
        );
        assert(
          await flow.getByText("X · saved browser sample", { exact: true }).isVisible(),
          "saved X is not labelled",
        );
        assert(
          !(await desk.getByRole("button", { name: "Fetch news + run Jev", exact: true }).isEnabled()),
          "preview bypassed model consent",
        );
        assert(
          (await desk.getByRole("region", { name: "Results & review", exact: true }).count()) === 0,
          "preview presents old model results",
        );
        await s.page.setViewportSize({ width: 390, height: 844 });
        assert(
          await s.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          "news process overflows mobile",
        );
      } finally {
        await s.context.close();
      }
    },
  );

  await check("live Trend Radar uses coverage counts rather than invented growth", async () => {
    const s = await open("/newsroom/trend-radar");
    try {
      const feed = await (await s.page.request.get(BASE + "/api/newsroom")).json();
      if (feed.mode !== "live") return;
      await s.page.getByRole("region", { name: "Coverage by topic", exact: true }).waitFor();
      const radar = s.page.getByRole("region", { name: "Top topics", exact: true });
      assert(!(await radar.innerText()).includes("↑ 0%"), "fake growth is displayed");
      assert(await radar.getByText(/Ranked by story count/).isVisible(), "ranking basis is missing");
    } finally {
      await s.context.close();
    }
  });

  await check("community build discovery exposes measured popularity", async () => {
    const s = await open("/newsroom/built-with-hermes");
    try {
      const response = await s.page.request.get(BASE + "/api/newsroom/builds");
      assert(response.ok(), `project API returned ${response.status()}`);
      const data = await response.json();
      const region = s.page.getByRole("region", { name: "Popular community projects", exact: true });
      await region.waitFor();
      if (data.state === "disabled") return;
      assert(data.projects.length > 0, "no community projects returned");
      await region.getByRole("article").first().waitFor();
      await region.getByRole("combobox", { name: "Rank builds" }).selectOption("forks");
      const firstName = await region.getByRole("article").first().getByRole("heading").innerText();
      const mostForks = [...data.projects].sort((a, b) => b.forks - a.forks)[0];
      assert(firstName === mostForks.name, "fork sort does not match source counts");
    } finally {
      await s.context.close();
    }
  });

  await check("Daily flashcards, newspaper switch and print layout", async () => {
    const s = await open("/newsroom/hermes-daily");
    try {
      await s.page.getByLabel("Daily flashcards").waitFor({ timeout: 10000 });
      assert(
        (await s.page
          .getByRole("button", { name: "Flashcards", exact: true })
          .getAttribute("aria-pressed")) === "true",
        "cards are not default",
      );
      const card = s.page.getByLabel("Daily flashcards").locator("article").first();
      await card.getByRole("button", { name: "Expand", exact: true }).click();
      await card.getByRole("heading", { name: "Why it matters" }).waitFor();
      await s.page.getByRole("button", { name: "Newspaper", exact: true }).click();
      assert(
        (await s.page.locator("[data-newspaper-sheet]:visible").count()) === 4,
        "not four visible pages",
      );
      await s.page.setViewportSize({ width: 390, height: 844 });
      assert(
        await s.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        "mobile newspaper overflows",
      );
      await s.page.getByRole("button", { name: "Flashcards", exact: true }).click();
      assert(
        await s.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        "mobile cards overflow",
      );
      await s.page.emulateMedia({ media: "print" });
      assert(
        (await s.page.locator("[data-newspaper-sheet]:visible").count()) === 4,
        "printing from cards misses paper",
      );
      assert(!(await s.page.getByLabel("Daily flashcards").isVisible()), "cards leaked into print");
      const heights = await s.page
        .locator("[data-newspaper-sheet]")
        .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
      assert(
        heights.every((height) => height <= 1047),
        `A4 page overflow: ${heights.join(",")}`,
      );
      if (process.env.SMOKE_PDF_PATH)
        await s.page.pdf({
          path: process.env.SMOKE_PDF_PATH,
          preferCSSPageSize: true,
          printBackground: true,
          displayHeaderFooter: false,
        });
    } finally {
      await s.context.close();
    }
  });

  await check(
    "personal edition: four A4 pages, source links and mobile layout using synthetic records",
    async () => {
      const snapshot = {
        date: "2026-09-21",
        timezone: "UTC",
        collectedAt: "2026-09-21T12:00:00Z",
        coverage: [{ profile: "synthetic", state: "ok", sessions: 1, omitted: 0 }],
        records: [
          {
            id: "S1",
            profile: "synthetic",
            sessionId: "synthetic-session",
            title: "Synthetic work record",
            source: "test",
            messages: 2,
            firstAt: "",
            lastAt: "",
            request: "Synthetic request",
            response: "Synthetic reported outcome",
          },
        ],
      };
      const edition = {
        id: "synthetic-edition",
        title: "My Hermes Daily",
        generatedAt: snapshot.collectedAt,
        headline: "A synthetic newspaper headline for four-page layout verification",
        snapshot,
        sections: Array.from({ length: 8 }, (_, index) => ({
          title: `Synthetic section ${index + 1}`,
          page: Math.floor(index / 2) + 1,
          bullets: Array.from({ length: 6 }, () => ({
            text: "A synthetic work result was reported with supporting records. ".repeat(14),
            sources: ["S1"],
          })),
        })),
      };
      let modelRequests = 0;
      const s = await open("/newsroom/personal-daily", {
        prepare: async (page) => {
          await page.route("**/api/newsroom/personal?*", (route) =>
            route.fulfill({ json: { title: edition.title, snapshot, edition, editions: [] } }),
          );
          await page.route("**/api/newsroom/personal", (route) => {
            modelRequests += 1;
            return route.fulfill({
              status: 500,
              json: { error: "Generation must not run during this test" },
            });
          });
        },
      });
      try {
        await s.page.locator("[data-personal-sheet]").first().waitFor();
        assert(
          (await s.page.locator("[data-personal-sheet]").count()) === 4,
          "personal newspaper does not have four sheets",
        );
        await s.page
          .locator("[data-personal-sheet]")
          .first()
          .getByRole("link", { name: "S1", exact: true })
          .first()
          .click();
        assert(
          (await s.page.locator("#work-S1").getAttribute("open")) !== null,
          "source reference did not open the record",
        );
        await s.page.setViewportSize({ width: 390, height: 844 });
        assert(
          await s.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          "personal mobile layout overflows",
        );
        await s.page.evaluate(() => window.scrollTo(0, 600));
        await s.page.waitForTimeout(100);
        const controls = await s.page.locator("[data-personal-controls]").boundingBox();
        const bar = await s.page
          .locator("header")
          .filter({ has: s.page.getByRole("heading", { level: 1 }) })
          .boundingBox();
        assert(Math.abs(controls.y - bar.height) <= 2, "personal edition controls moved while scrolling");
        await s.page.emulateMedia({ media: "print" });
        assert(
          (await s.page.locator("[data-personal-sheet]:visible").count()) === 4,
          "print hides a personal page",
        );
        assert(
          !(await s.page.getByRole("region", { name: "Work records" }).isVisible()),
          "raw records leaked into print",
        );
        const heights = await s.page
          .locator("[data-personal-sheet]")
          .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
        assert(
          heights.every((height) => height <= 1047),
          `personal A4 overflow: ${heights.join(",")}`,
        );
        assert(modelRequests === 0, "test invoked generation");
        if (process.env.SMOKE_PERSONAL_PDF_PATH)
          await s.page.pdf({
            path: process.env.SMOKE_PERSONAL_PDF_PATH,
            preferCSSPageSize: true,
            printBackground: true,
            displayHeaderFooter: false,
          });
      } finally {
        await s.context.close();
      }
    },
  );

  // --- states ------------------------------------------------------------
  // Production builds ignore ?scenario= (unless NEWSROOM_ENABLE_SCENARIOS=1).
  if (process.env.SMOKE_PRODUCTION === "1") {
    await check("production ignores development scenarios", async () => {
      const s = await open("/newsroom?scenario=error");
      await leadHeading(s.page).waitFor({ timeout: 10_000 });
      await s.context.close();
    });
  }
  for (const [scenario, text] of process.env.SMOKE_PRODUCTION === "1"
    ? []
    : [
        ["empty", "No intelligence yet"],
        ["error", "Sources are not responding"],
        ["partial", "1 of 3 sources unavailable."],
        ["stale", "This feed may be out of date."],
        ["offline", "You are offline"],
      ]) {
    await check(`state: ${scenario}`, async () => {
      const s = await open(`/newsroom?scenario=${scenario}`);
      await s.page.getByText(text).first().waitFor({ timeout: 10_000 });
      await s.context.close();
    });
  }

  if (process.env.SMOKE_PRODUCTION !== "1")
    await check("state: loading skeleton appears first", async () => {
      const s = await open("/newsroom?scenario=slow");
      await s.page.getByLabel("Loading intelligence").waitFor({ timeout: 5_000 });
      await leadHeading(s.page).waitFor({ timeout: 10_000 });
      await s.context.close();
    });

  await check("state: no results", async () => {
    const s = await open("/newsroom?q=zzzz-no-match");
    await s.page.getByText("No stories match").waitFor({ timeout: 10_000 });
    await s.context.close();
  });

  await check("reduced motion: ticker offers no auto-rotation and does not advance", async () => {
    const s = await open("/newsroom", { reducedMotion: "reduce" });
    const ticker = s.page.getByRole("region", { name: "Breaking intelligence" });
    await leadHeading(s.page).waitFor({ timeout: 10_000 });
    if (!(await ticker.count())) {
      await s.context.close();
      return;
    }
    await ticker.waitFor({ timeout: 10_000 });
    assert((await ticker.getByRole("button", { name: /Pause ticker/ }).count()) === 0, "pause shown");
    await s.page.waitForTimeout(9_000);
    assert((await ticker.innerText()).includes("1/2"), "ticker advanced");
    await s.context.close();
  });

  // --- responsive --------------------------------------------------------
  for (const [w, h] of [
    [2560, 1440],
    [1920, 1080],
    [1440, 900],
    [1024, 768],
    [390, 844],
  ]) {
    await check(`layout ${w}×${h}: no overflow, readable text, pinned header`, async () => {
      const s = await open("/newsroom", { width: w, height: h });
      await leadHeading(s.page).waitFor({ timeout: 10_000 });
      const { overflow, small } = await s.page.evaluate(() => {
        const overflow = document.documentElement.scrollWidth - window.innerWidth;
        const small = [...document.querySelectorAll("body *")]
          .filter(
            (el) =>
              el.childNodes.length &&
              [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()),
          )
          .filter((el) => {
            const cs = getComputedStyle(el);
            return cs.display !== "none" && cs.visibility !== "hidden" && el.getClientRects().length;
          })
          .filter((el) => !el.closest(".visually-hidden"))
          .map((el) => [el.textContent.trim().slice(0, 30), parseFloat(getComputedStyle(el).fontSize)])
          .filter(([, size]) => size < 11.5);
        return { overflow, small };
      });
      assert(overflow <= 1, `horizontal overflow ${overflow}px`);
      assert(small.length === 0, `tiny text: ${JSON.stringify(small.slice(0, 3))}`);
      await s.page.evaluate(() => window.scrollTo(0, 600));
      await s.page.waitForTimeout(100);
      const header = s.page.locator("header").filter({ has: s.page.getByRole("heading", { level: 1 }) });
      const headerBox = await header.boundingBox();
      assert((await s.page.evaluate(() => window.scrollY)) > 100, "page did not scroll");
      assert(headerBox && Math.abs(headerBox.y) <= 1, `header moved to ${headerBox?.y}`);
      if (w >= 1200) {
        const navBox = await s.page.getByRole("navigation", { name: "Newsroom sections" }).boundingBox();
        assert(navBox && navBox.y >= headerBox.height, "header covers section navigation");
      }
      // The pinned controls must remain clickable, with dialogs above the header.
      await s.page.getByRole("button", { name: "Generate Daily", exact: true }).click();
      await s.page.getByRole("dialog", { name: /Hermes Daily/ }).waitFor();
      await s.page.keyboard.press("Escape");
      if (w < 1200) {
        await s.page.getByRole("button", { name: "Toggle Newsroom navigation" }).click();
        await s.page
          .getByRole("navigation", { name: "Newsroom sections" })
          .getByRole("link", { name: "Archive" })
          .click();
        await s.page.waitForURL(/archive/);
      }
      await s.context.close();
    });
  }
} finally {
  await browser.close();
}

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok ? "" : `  — ${r.error}`}`);
const relevantErrors = consoleErrors.filter((e) => !/Download the React DevTools/.test(e));
console.log(`\nconsole errors: ${relevantErrors.length}`);
for (const e of relevantErrors.slice(0, 20)) console.log(`  ${e}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed || relevantErrors.length ? 1 : 0);
