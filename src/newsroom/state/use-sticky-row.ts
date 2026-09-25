"use client";
import { useEffect, useRef } from "react";

/** Share the actual wrapped row height with the next sticky row and anchor targets. */
export function useStickyRow(variable: string, key = "") {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const row = ref.current;
    const parent = row?.parentElement;
    if (!row || !parent) return;
    const measure = () => parent.style.setProperty(variable, `${row.getBoundingClientRect().height}px`);
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(row);
    return () => {
      observer?.disconnect();
      parent.style.removeProperty(variable);
    };
  }, [variable, key]);
  return ref;
}
