import { useSyncExternalStore } from "react";

/** A reactive stand-in for next/navigation so URL-driven state can be tested. */
let url = new URL("http://localhost/newsroom");
const listeners = new Set<() => void>();
let snapshot = new URLSearchParams(url.search);

export function setUrl(path: string) {
  url = new URL(path, "http://localhost");
  snapshot = new URLSearchParams(url.search);
  listeners.forEach((l) => l());
}

export function currentUrl() {
  return url;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const navigationMock = {
  useSearchParams: () => useSyncExternalStore(subscribe, () => snapshot),
  usePathname: () => useSyncExternalStore(subscribe, () => url.pathname),
  useRouter: () => ({ replace: (to: string) => setUrl(to), push: (to: string) => setUrl(to) }),
  notFound: () => {
    throw new Error("notFound");
  },
  redirect: () => {
    throw new Error("redirect");
  },
};
