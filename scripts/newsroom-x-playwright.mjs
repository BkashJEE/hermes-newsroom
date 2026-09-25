/** Public search DOM only. Post text is data, never code, instructions, or log output. */
import { mkdir, chmod } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { transport } from "./newsroom-x-collector.mjs";

export const SEARCH_URL = "https://x.com/search?q=%22Hermes%20Agent%22&src=typed_query&f=live";
export const PROFILE = join(homedir(), ".local/state/omarchy-command-center/browser-x-profile");

export class CollectionError extends Error {
  constructor(state, code) {
    super(code);
    this.state = state;
    this.code = code;
  }
}

// Runs in the page. Check the URL before inspecting any DOM. Never read a whole
// page, sidebar, input value, cookies, storage, requests, or response bodies.
export function searchState({ searchUrl }) {
  if (location.href !== searchUrl) return "unavailable";
  const visible = (node) => !!node?.getClientRects().length;
  if (
    [
      ...document.querySelectorAll(
        '[data-testid="loginButton"], [data-testid="LoginForm_Login_Button"], ' +
          '[role="dialog"] a[href="/i/flow/login"], [role="dialog"] input[type="password"]',
      ),
    ].some(visible)
  )
    return "unavailable";
  const column = document.querySelector('[data-testid="primaryColumn"]');
  if (!column) return false;
  // These are search UI notices only; never interpret text inside a post.
  for (const node of column.querySelectorAll(
    '[role="alert"], [data-testid="error-detail"], [data-testid="emptyState"]',
  )) {
    if (!visible(node) || node.closest("article")) continue;
    const notice = node.innerText;
    if (/rate limit|too many requests|sign in|log in|verify|unusual activity|access denied/i.test(notice))
      return "unavailable";
    if (/something went wrong|try again|cannot retrieve|could not load/i.test(notice)) return "failed";
    if (node.matches('[data-testid="emptyState"]') && /no results/i.test(notice)) return "empty";
  }
  return [...column.querySelectorAll('article[data-testid="tweet"]')].some(visible) ? "results" : false;
}

// A self-contained DOM function so the exact same extraction can be tested in a
// real Chromium page using synthetic HTML. No post content leaves this function
// except the three transport fields. Quoted posts/media-only posts are skipped.
export function extractPosts({ searchUrl, now, seenIds, limit }) {
  if (location.href !== searchUrl) return [];
  const column = document.querySelector('[data-testid="primaryColumn"]');
  if (!column) return [];
  const seen = new Set(seenIds);
  const posts = [];
  for (const article of column.querySelectorAll('article[data-testid="tweet"]')) {
    if (posts.length >= Math.min(20, limit)) break;
    if (!article.getClientRects().length || article.parentElement.closest("article")) continue;
    if (
      article.closest('[data-testid="placementTracking"]') ||
      article.querySelector(
        '[data-testid="promotedIndicator"], [data-testid="icon-lock"], [data-testid="iconLock"], ' +
          '[aria-label*="protected" i], [title*="protected" i]',
      )
    )
      continue;
    const header = article.querySelector('[data-testid="User-Name"]');
    if (!header?.getClientRects().length) continue;
    // The first timestamp must belong to the outer author's header, not a quote.
    const time = article.querySelector("time[datetime]");
    if (!time || !header.contains(time)) continue;
    const link = time.closest("a[href]");
    if (!link) continue;
    const url = new URL(link.getAttribute("href"), "https://x.com");
    const match = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d{10,25})\/?$/);
    if (url.origin !== "https://x.com" || url.username || url.password || url.port || !match) continue;
    if (seen.has(match[2])) continue;
    const author = [...header.querySelectorAll("a[href]")].some((a) => {
      const href = new URL(a.getAttribute("href"), "https://x.com");
      return href.origin === "https://x.com" && href.pathname.toLowerCase() === `/${match[1].toLowerCase()}`;
    });
    if (!author) continue;
    const textNode = article.querySelector('[data-testid="tweetText"]');
    if (!textNode?.getClientRects().length || textNode.closest("article") !== article) continue;
    // X renders quoted cards as a nested role=link container.
    if (textNode.closest('[role="link"]')) continue;
    const text = textNode.innerText.trim().slice(0, 1200);
    const timestamp = Date.parse(time.getAttribute("datetime"));
    if (!text || !Number.isFinite(timestamp) || timestamp > now + 300000 || timestamp < now - 30 * 86400000)
      continue;
    seen.add(match[2]);
    posts.push({
      url: `https://x.com/${match[1]}/status/${match[2]}`,
      text,
      publishedAt: new Date(timestamp).toISOString(),
    });
  }
  return posts;
}

export async function collectSearch(page, searchUrl, signal) {
  if (searchUrl !== SEARCH_URL) throw new CollectionError("failed", "unexpected-search-url");
  signal?.throwIfAborted();
  let initial;
  try {
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    const handle = await page.waitForFunction(searchState, { searchUrl }, { timeout: 25000 });
    initial = await handle.jsonValue();
    await handle.dispose();
  } catch (error) {
    // Login redirects can destroy the search execution context during the wait.
    // Check only the URL; never inspect the redirected page's DOM.
    if (/^https:\/\/x\.com\/(?:i\/flow\/|login(?:[/?]|$)|account\/access)/.test(page.url()))
      throw new CollectionError("unavailable", "session-or-access-required");
    throw error;
  }
  if (initial === "unavailable") throw new CollectionError("unavailable", "session-or-access-required");
  if (initial === "failed") throw new CollectionError("failed", "search-error");
  if (initial === "empty") return [];
  const posts = [];
  for (let pass = 0; pass < 3; pass++) {
    signal?.throwIfAborted();
    const state = await page.evaluate(searchState, { searchUrl });
    if (state === "unavailable") throw new CollectionError("unavailable", "session-or-access-required");
    if (state !== "results") throw new CollectionError("failed", "search-layout-unrecognized");
    const batch = await page.evaluate(extractPosts, {
      searchUrl,
      now: Date.now(),
      seenIds: posts.map((p) => p.url.split("/").at(-1)),
      limit: 20 - posts.length,
    });
    posts.push(...batch);
    if (posts.length >= 20 || pass === 2) break;
    await page.mouse.wheel(0, 1100);
    // Bounded wait for lazy-rendered rows; no network inspection or interception.
    await page.waitForTimeout(2000);
  }
  // An unfamiliar layout must not refresh the timestamp with a false empty capture.
  if (!posts.length) throw new CollectionError("failed", "no-eligible-public-posts");
  return posts;
}

async function openProfile(headless) {
  await mkdir(PROFILE, { recursive: true, mode: 0o700 });
  await chmod(PROFILE, 0o700);
  const { chromium } = await import("playwright-core");
  return chromium.launchPersistentContext(PROFILE, {
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless,
    chromiumSandbox: true,
    acceptDownloads: false,
    locale: "en-US",
    viewport: { width: 1440, height: 1000 },
    timeout: 30000,
  });
}

export async function runCollection({
  api = transport,
  open = openProfile,
  collect = collectSearch,
  log = console.log,
  signal,
} = {}) {
  let jobId;
  let context;
  let stage = "status";
  const close = () => {
    void context?.close().catch(() => {});
  };
  signal?.addEventListener("abort", close, { once: true });
  try {
    signal?.throwIfAborted();
    const status = await api("status");
    if (!status.enabled) {
      log("X collector: disabled in Newsroom; skipped.");
      return 0;
    }
    if (status.job?.state === "collecting") {
      log("X collector: another lease is active; skipped.");
      return 0;
    }
    stage = "claim";
    const claim = await api("claim");
    if (!claim.job?.id || claim.job.state !== "collecting")
      throw new CollectionError("failed", "invalid-claim");
    jobId = claim.job.id;
    if (claim.searchUrl !== SEARCH_URL) throw new CollectionError("failed", "unexpected-search-url");
    signal?.throwIfAborted();
    stage = "browser-start";
    context = await open(true);
    signal?.throwIfAborted();
    // Never inspect restored pages. Use only a fresh tab at the fixed public search.
    const page = await context.newPage();
    for (const other of context.pages()) if (other !== page) await other.close();
    stage = "public-search";
    const posts = await collect(page, claim.searchUrl, signal);
    signal?.throwIfAborted();
    stage = "browser-close";
    await context.close();
    context = undefined;
    stage = "complete";
    await api("complete", jobId, posts);
    log(`X collector: complete (${posts.length} public posts).`);
    return 0;
  } catch (error) {
    const state = error instanceof CollectionError ? error.state : "failed";
    const code = signal?.aborted
      ? "interrupted-or-deadline"
      : error instanceof CollectionError
        ? error.code
        : `${stage}-error`;
    if (jobId) {
      try {
        await api(state, jobId);
      } catch {
        log(
          "X collector: could not report failure; inspect Newsroom status (lease expires after 10 minutes).",
        );
      }
    }
    log(`X collector: ${state} (${code}); previous posts retained.`);
    if (state === "unavailable")
      log("X collector: run scripts/newsroom-x-browser.sh login, sign in manually, then close that browser.");
    return 1;
  } finally {
    signal?.removeEventListener("abort", close);
    await context?.close().catch(() => {});
  }
}

async function login() {
  // Manual login only. No DOM inspection, autofill, credential handling, or API call.
  const context = await openProfile(false);
  const stop = () => {
    void context.close().catch(() => {});
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    const page = await context.newPage();
    for (const other of context.pages()) if (other !== page) await other.close();
    const closed = new Promise((resolve) => context.once("close", resolve));
    await page.goto("https://x.com/i/flow/login", { waitUntil: "domcontentloaded", timeout: 30000 });
    console.log(
      "Sign in to X in the dedicated browser, then close the entire browser window. No pages are collected during login.",
    );
    await closed;
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    await context.close().catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.umask(0o077);
  const [mode] = process.argv.slice(2);
  if (process.env.NEWSROOM_X_PROFILE_LOCK !== "held" || !["run", "login"].includes(mode)) {
    console.error("Use scripts/newsroom-x-browser.sh run|login (it locks the dedicated profile).");
    process.exitCode = 1;
  } else if (mode === "login") {
    await login().catch(() => {
      console.error(
        "X login browser could not open; check the graphical session, Chromium and profile lock.",
      );
      process.exitCode = 1;
    });
  } else {
    const controller = new AbortController();
    const abort = () => controller.abort();
    const deadline = setTimeout(abort, 120000);
    process.once("SIGINT", abort);
    process.once("SIGTERM", abort);
    process.exitCode = await runCollection({ signal: controller.signal });
    clearTimeout(deadline);
    process.removeListener("SIGINT", abort);
    process.removeListener("SIGTERM", abort);
  }
}
