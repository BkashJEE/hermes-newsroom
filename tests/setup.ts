import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());

// jsdom lacks <dialog> methods; a minimal polyfill matching browser behavior.
if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.show = HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// Node 25+ ships its own (file-backed) localStorage global that can shadow
// jsdom's. Give each test run a working in-memory Storage instead.
function memoryStorage(): Storage {
  let data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => {
      data = new Map();
    },
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  };
}

for (const name of ["localStorage", "sessionStorage"] as const) {
  let works = false;
  try {
    works = typeof window[name]?.clear === "function";
  } catch {
    works = false;
  }
  if (!works) Object.defineProperty(window, name, { value: memoryStorage(), configurable: true });
}
