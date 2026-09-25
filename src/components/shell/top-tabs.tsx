"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { ChevronDown, ChevronUp, Command } from "lucide-react";
import { APP } from "@/config/app";
import { WORKSPACES, type Workspace } from "@/config/workspaces";
import { PurposeMenu } from "./purpose-menu";
import styles from "./top-tabs.module.css";

function isActive(pathname: string, workspace: Workspace) {
  return pathname === workspace.href || pathname.startsWith(`${workspace.href}/`);
}

/** The Command Center tab strip — a web twin of the Omarchy bar workspaces. */
export function TopTabs() {
  const pathname = usePathname() ?? "/";
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const toggles = useRef<Record<string, HTMLButtonElement | null>>({});

  function closeMenu(returnFocus: boolean) {
    const id = openMenu;
    setOpenMenu(null);
    if (returnFocus && id) toggles.current[id]?.focus();
  }

  // The persistent desktop bar already provides workspace navigation here.
  if (pathname === "/newsroom" || pathname.startsWith("/newsroom/")) return null;

  return (
    <header className={styles.bar}>
      <Link href="/" className={styles.brand} aria-label={`${APP.name} home`}>
        <Command size={15} aria-hidden />
        <span>{APP.shortName}</span>
      </Link>
      <nav aria-label="Command Center tabs" className={styles.tabs}>
        <ul>
          {WORKSPACES.map((workspace) => {
            const active = isActive(pathname, workspace);
            const open = openMenu === workspace.id;
            const Icon = workspace.icon;
            return (
              <li key={workspace.id} className={styles.item}>
                <Link
                  href={workspace.href}
                  className={styles.tab}
                  data-active={active || undefined}
                  aria-current={active ? "page" : undefined}
                  aria-label={workspace.label}
                  title={workspace.label}
                >
                  <Icon size={14} aria-hidden />
                  <span>{workspace.label}</span>
                </Link>
                <button
                  ref={(node) => {
                    toggles.current[workspace.id] = node;
                  }}
                  type="button"
                  className={styles.caret}
                  aria-expanded={open}
                  aria-haspopup="menu"
                  aria-label={`${workspace.label} tools`}
                  onClick={() => setOpenMenu(open ? null : workspace.id)}
                >
                  {open ? <ChevronUp size={13} aria-hidden /> : <ChevronDown size={13} aria-hidden />}
                </button>
                {open ? <PurposeMenu workspace={workspace} onClose={closeMenu} /> : null}
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
