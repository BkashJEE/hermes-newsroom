import type { Workspace } from "@/config/workspaces";
import type { ReactNode } from "react";
import styles from "./workspace-overview.module.css";

/**
 * Overview page for a tab that mirrors an Omarchy bar workspace. The actions
 * are listed honestly: they run from the bar today, and nothing here pretends
 * to launch desktop apps from the browser.
 */
export function WorkspaceOverview({ workspace, featured }: { workspace: Workspace; featured?: ReactNode }) {
  const Icon = workspace.icon;
  return (
    <main id="main" className={styles.page}>
      <header className={styles.header}>
        <span className={styles.icon}>
          <Icon size={22} aria-hidden />
        </span>
        <div>
          <p className={styles.eyebrow}>{workspace.eyebrow}</p>
          <h1 className={styles.title}>{workspace.label}</h1>
          <p className={styles.description}>{workspace.description}</p>
        </div>
      </header>

      {featured}

      <p className={styles.notice} role="note">
        <strong>Desktop workspace {workspace.desktopWorkspace}.</strong>{" "}
        {featured
          ? "The Jev Live Desk above runs in this app. The workspace tools below still run from the Omarchy bar."
          : "These tools run from the Omarchy bar today. Hermes-driven control from this page is planned; nothing on this page launches apps yet."}
      </p>

      <ul className={styles.grid}>
        {workspace.actions.map((action) => {
          const ActionIcon = action.icon;
          return (
            <li key={action.id} id={action.id} className={styles.card} tabIndex={-1}>
              <ActionIcon size={18} className={styles.glyph} aria-hidden />
              <div>
                <h2 className={styles.cardTitle}>{action.title}</h2>
                <p className={styles.cardHint}>{action.hint}</p>
                <p className={styles.status}>
                  <span className={styles.dot} aria-hidden /> Runs from the bar
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
