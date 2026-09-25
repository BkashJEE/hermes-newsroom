/**
 * Guarded browser storage. Storage can be missing or throw (private windows,
 * blocked site data), so every access is wrapped and the Newsroom works
 * without it. Only per-viewer conveniences are stored here.
 */

export function readJSON<T>(key: string, fallback: T, store: "local" | "session" = "local"): T {
  try {
    const raw = (store === "local" ? window.localStorage : window.sessionStorage).getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown, store: "local" | "session" = "local"): void {
  try {
    (store === "local" ? window.localStorage : window.sessionStorage).setItem(key, JSON.stringify(value));
  } catch {
    // Ignore: storage is optional.
  }
}
