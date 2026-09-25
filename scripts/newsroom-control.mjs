/** Local, bounded controls for the dedicated Newsroom desktop profile. */
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright-core";
const base = "http://127.0.0.1:3520";
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
};
const [action = "status", arg, extra] = process.argv.slice(2);
const out = (value) => console.log(JSON.stringify(value, null, 2));
async function get(path) {
  const r = await fetch(base + path, { headers: { "X-Newsroom-Client": "1" } });
  if (!r.ok) throw new Error(`Newsroom HTTP ${r.status}`);
  return r.json();
}
async function desktop(run) {
  execFileSync(join(homedir(), ".local/bin/studio-workspace-action"), ["newsroom", "startup"], {
    timeout: 30000,
    stdio: "ignore",
  });
  const port = Number(
    (
      await readFile(join(homedir(), ".local/share/omarchy-newsroom-browser/DevToolsActivePort"), "utf8")
    ).split("\n")[0],
  );
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid browser port");
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 10000 });
  try {
    const page = browser
      .contexts()
      .flatMap((c) => c.pages())
      .find((p) => {
        const u = new URL(p.url());
        return u.origin === base && /^\/newsroom(?:\/|$)/.test(u.pathname);
      });
    if (!page) throw new Error("Dedicated Newsroom window unavailable");
    await page.waitForLoadState("domcontentloaded");
    return await run(page);
  } finally {
    await browser.close();
  }
}
try {
  if (action === "status") {
    let installation = {};
    try {
      installation = JSON.parse(
        await readFile(join(homedir(), ".local/state/omarchy-command-center/installation.json"), "utf8"),
      );
    } catch {
      /* optional */
    }
    const feed = await get("/api/newsroom");
    out({
      ...installation,
      url: base + "/newsroom",
      workspace: 8,
      mode: feed.mode,
      stories: feed.stories.length,
      providers: feed.providers,
      hermes: await get("/api/newsroom/hermes"),
      sections: routes,
    });
  } else if (action === "personal") {
    if (arg && !/^\d{4}-\d{2}-\d{2}$/.test(arg)) throw new Error("Use YYYY-MM-DD");
    out(await get("/api/newsroom/personal" + (arg ? "?date=" + arg : "")));
  } else if (action === "personal-generate") {
    if (!arg || !/^\d{4}-\d{2}-\d{2}$/.test(arg)) throw new Error("Supply YYYY-MM-DD");
    const response = await fetch(base + "/api/newsroom/personal", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Newsroom-Client": "1" },
      body: JSON.stringify({ date: arg }),
      signal: AbortSignal.timeout(190000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    out({
      saved: true,
      id: result.edition.id,
      date: result.edition.snapshot.date,
      title: result.edition.title,
    });
  } else if (action === "stories") {
    const feed = await get("/api/newsroom");
    out(feed.stories.filter((s) => !arg || JSON.stringify(s).toLowerCase().includes(arg.toLowerCase())));
  } else if (action === "open") {
    if (!Object.hasOwn(routes, arg))
      throw new Error("Choose front/updates/livewire/daily/personal/weekly/built/trends/archive");
    execFileSync(
      join(homedir(), ".local/bin/studio-workspace-action"),
      ["newsroom", arg === "personal" ? "front" : arg],
      {
        timeout: 30000,
        stdio: "ignore",
      },
    );
    if (arg === "personal") await desktop((page) => page.goto(base + "/newsroom/personal-daily"));
    out({ opened: arg });
  } else if (action === "state") {
    out(
      await desktop((page) =>
        page.evaluate(() => ({
          url: location.href,
          overlays: JSON.parse(localStorage.getItem("newsroom:v1:overlays") || "{}"),
        })),
      ),
    );
  } else if (
    [
      "save",
      "unsave",
      "dismiss",
      "restore",
      "track",
      "untrack",
      "desk-add",
      "desk-edit",
      "desk-remove",
    ].includes(action)
  ) {
    const feed = await get("/api/newsroom");
    const story = feed.stories.find((s) => s.id === arg);
    if (!arg || (!story && !["desk-edit", "desk-remove", "restore", "unsave", "untrack"].includes(action)))
      throw new Error("Supply an existing story ID from stories, or a desk ID from state.");
    if (["desk-add", "desk-edit"].includes(action) && (!extra || extra.length > 20000))
      throw new Error("Supply the draft text (maximum 20000 characters).");
    out(
      await desktop(async (page) => {
        const result = await page.evaluate(
          ({ action, arg, extra, story }) => {
            const key = "newsroom:v1:overlays";
            const o = {
              saved: [],
              unsaved: [],
              dismissed: [],
              tracked: [],
              desk: [],
              snapshots: {},
              ...JSON.parse(localStorage.getItem(key) || "{}"),
            };
            const set = (name, add) => {
              o[name] = o[name].filter((id) => id !== arg);
              if (add) o[name].push(arg);
            };
            if (story) o.snapshots[arg] = story;
            if (action === "save" || action === "unsave") {
              set("saved", action === "save");
              set("unsaved", action === "unsave");
            }
            if (action === "dismiss" || action === "restore") set("dismissed", action === "dismiss");
            if (action === "track" || action === "untrack") set("tracked", action === "track");
            if (action === "desk-add")
              o.desk.unshift({
                id: crypto.randomUUID(),
                kind: "draft",
                storyId: story.id,
                title: `Draft: ${story.title}`,
                body: extra,
                createdAt: new Date().toISOString(),
              });
            if (action === "desk-edit") {
              const item = o.desk.find((d) => d.id === arg);
              if (!item) throw new Error("Desk item not found");
              item.body = extra;
            }
            if (action === "desk-remove") o.desk = o.desk.filter((d) => d.id !== arg);
            o.desk = o.desk.slice(0, 50);
            localStorage.setItem(key, JSON.stringify(o));
            return {
              action,
              id: arg,
              desk: o.desk,
              saved: o.saved,
              dismissed: o.dismissed,
              tracked: o.tracked,
            };
          },
          { action, arg, extra, story },
        );
        await page.reload({ waitUntil: "domcontentloaded" });
        return result;
      }),
    );
  } else if (action === "ask") {
    if (!arg) throw new Error('Usage: hermes-newsroom ask "question"');
    const r = await fetch(base + "/api/newsroom/hermes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Newsroom-Client": "1" },
      body: JSON.stringify({ task: "analyze", question: arg }),
      signal: AbortSignal.timeout(190000),
    });
    const result = await r.json();
    if (!r.ok) throw new Error(result.error);
    out(result);
  } else
    throw new Error(
      "Commands: status, stories [search], state, open SECTION, save/unsave/dismiss/restore/track/untrack STORY_ID, desk-add STORY_ID TEXT, desk-edit DESK_ID TEXT, desk-remove DESK_ID, ask QUESTION",
    );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
