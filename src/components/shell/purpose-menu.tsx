"use client";

import Link from "next/link";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { ArrowUpRight } from "lucide-react";
import type { Workspace } from "@/config/workspaces";
import styles from "./purpose-menu.module.css";

interface PurposeMenuProps {
  workspace: Workspace;
  onClose: (returnFocus: boolean) => void;
}

/**
 * Web version of the Omarchy bar purpose menu (PurposeMenu.qml): eyebrow,
 * description, action rows with a hint, then a footer section.
 */
export function PurposeMenu({ workspace, onClose }: PurposeMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    function onPointer(event: PointerEvent) {
      const root = ref.current;
      if (root && !root.parentElement?.contains(event.target as Node)) onClose(false);
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [onClose]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.preventDefault();
      onClose(true);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      items[event.key === "Home" ? 0 : items.length - 1]?.focus();
    } else if (event.key === "Tab") {
      onClose(false);
    }
  }

  return (
    <div
      ref={ref}
      className={styles.menu}
      role="menu"
      aria-label={`${workspace.label} tools`}
      onKeyDown={onKeyDown}
    >
      <p className={styles.eyebrow}>{workspace.eyebrow}</p>
      <p className={styles.description}>{workspace.description}</p>
      <p className={styles.live}>
        {workspace.kind === "desktop"
          ? `Desktop workspace ${workspace.desktopWorkspace}`
          : "Runs in this app"}
      </p>
      <div className={styles.rows}>
        {workspace.actions.map((action) => {
          const Icon = action.icon;
          const href = action.href ?? `${workspace.href}#${action.id}`;
          return (
            <Link
              key={action.id}
              href={href}
              role="menuitem"
              className={styles.row}
              onClick={() => onClose(false)}
            >
              <Icon size={16} className={styles.glyph} aria-hidden />
              <span className={styles.text}>
                <span className={styles.title}>{action.title}</span>
                <span className={styles.hint}>{action.hint}</span>
              </span>
            </Link>
          );
        })}
      </div>
      <hr className={styles.rule} />
      <p className={styles.section}>Open here</p>
      <Link href={workspace.href} role="menuitem" className={styles.openRow} onClick={() => onClose(false)}>
        <ArrowUpRight size={14} className={styles.glyph} aria-hidden />
        <span>{workspace.label} overview</span>
      </Link>
    </div>
  );
}
