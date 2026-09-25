"use client";

import { useEffect } from "react";

/**
 * Accepts a host theme when Newsroom is embedded (Hermes Desktop frames this page
 * cross-origin, so it cannot style us from outside). Values arrive as query params
 * on first paint and as postMessage when the host theme changes.
 *
 * Only colours and a font stack are accepted, each validated against a strict
 * pattern before it reaches the DOM: a host — or anything pretending to be one —
 * must not be able to smuggle `url(...)` or further declarations into our CSS.
 * Standalone browser use is untouched: with no params and no host, nothing runs.
 */

// Host token -> the Newsroom variable it drives.
const COLOUR_TOKENS: Record<string, readonly string[]> = {
  bg: ["--bg"],
  raised: ["--bg-raised"],
  panel: ["--panel", "--shell-menu"],
  panel2: ["--panel-2"],
  panel3: ["--panel-3"],
  line: ["--line", "--shell-menu-line"],
  lineStrong: ["--line-strong", "--shell-pill-line"],
  text: ["--text"],
  text2: ["--text-2"],
  text3: ["--text-3"],
  accent: ["--green", "--shell-accent"],
  accentStrong: ["--green-strong"],
  shellBar: ["--shell-bar"],
  shellPill: ["--shell-pill"],
  // Signal-type colours: categorical, so they keep their own identity but follow
  // the host palette rather than staying on Newsroom's standalone hues.
  cyan: ["--cyan"],
  purple: ["--purple"],
  amber: ["--amber"],
  red: ["--red"],
  blue: ["--blue"],
};

const FONT_TOKENS: Record<string, readonly string[]> = {
  fontUi: ["--font-ui", "--font-shell"],
  fontMono: ["--font-mono"],
};

// rgb()/rgba() only: the host resolves every token through a probe element first.
const COLOUR = /^rgba?\(\s*\d{1,3}(\s*,\s*\d{1,3}){2}(\s*,\s*(0|1|0?\.\d+))?\s*\)$/;
const FONT = /^[A-Za-z0-9 ,'"._-]{1,200}$/;

export type HostTheme = Record<string, string>;

export function applyHostTheme(theme: HostTheme, root: HTMLElement): string[] {
  const applied: string[] = [];
  for (const [key, variables] of Object.entries(COLOUR_TOKENS)) {
    const value = theme[key];
    if (typeof value !== "string" || !COLOUR.test(value)) continue;
    for (const variable of variables) root.style.setProperty(variable, value);
    applied.push(key);
  }
  for (const [key, variables] of Object.entries(FONT_TOKENS)) {
    const value = theme[key];
    if (typeof value !== "string" || !FONT.test(value)) continue;
    for (const variable of variables) root.style.setProperty(variable, value);
    applied.push(key);
  }
  if (applied.length) root.dataset.hostTheme = "on";
  return applied;
}

export function themeFromSearch(search: string): HostTheme {
  const params = new URLSearchParams(search);
  if (params.get("embed") !== "hermes") return {};
  const theme: HostTheme = {};
  for (const key of [...Object.keys(COLOUR_TOKENS), ...Object.keys(FONT_TOKENS)]) {
    const value = params.get(key);
    if (value) theme[key] = value;
  }
  return theme;
}

export function EmbedTheme() {
  useEffect(() => {
    const root = document.documentElement;
    const initial = themeFromSearch(window.location.search);
    if (Object.keys(initial).length) applyHostTheme(initial, root);
    // Only the framing window may retheme us, and only with this exact shape.
    if (window.parent === window) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      const data = event.data as { type?: unknown; theme?: unknown } | null;
      if (!data || data.type !== "hermes-theme" || typeof data.theme !== "object" || !data.theme) return;
      applyHostTheme(data.theme as HostTheme, root);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  return null;
}
