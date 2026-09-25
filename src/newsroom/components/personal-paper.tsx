"use client";

import { personalPages } from "../personal/paper";
import type { PersonalEdition, WorkSnapshot } from "../personal/types";
import styles from "./personal-paper.module.css";

export function PersonalPaper({
  title,
  edition,
  snapshot,
}: {
  title: string;
  edition: PersonalEdition | null;
  snapshot: WorkSnapshot;
}) {
  const pages = personalPages(edition);
  return (
    <div className={styles.reader} data-personal-paper>
      <nav className={styles.navigation} aria-label="Personal newspaper pages">
        {pages.map((page, index) => (
          <a key={page.title} href={`#personal-page-${index + 1}`}>
            {index + 1}. {page.title}
          </a>
        ))}
      </nav>
      <p className={styles.printNote}>
        Four-page reading edition with concise excerpts. Full edition text and work records remain below;
        Print / Save PDF prints only these four pages.
      </p>
      {pages.map((page, index) => (
        <article
          key={page.title}
          id={`personal-page-${index + 1}`}
          className={styles.sheet}
          data-personal-sheet
          aria-label={`Personal newspaper page ${index + 1}: ${page.title}`}
        >
          <header className={styles.masthead}>
            <p>Your work. Your agents. Your newspaper.</p>
            <h3>{title}</h3>
            <div>
              <span>
                {snapshot.date} · {snapshot.timezone}
              </span>
              <span>{edition ? "Saved work edition" : "Edition preview · not yet written"}</span>
            </div>
          </header>
          <div className={styles.sectionHead}>
            <h4>{page.title}</h4>
            <p>{page.subtitle}</p>
          </div>
          {index === 0 && (
            <h5 className={styles.lead}>
              {edition?.headline ?? "Your day, drawn from your own work records"}
            </h5>
          )}
          {index === 0 && (
            <p className={styles.byline}>
              {snapshot.records.length} recorded sessions ·{" "}
              {snapshot.coverage.filter((profile) => profile.sessions > 0).length} profiles with work ·
              Outcomes are reported, not independently verified.
            </p>
          )}
          <div className={styles.columns}>
            {page.sections.length ? (
              page.sections.map((section, sectionIndex) => (
                <section key={sectionIndex}>
                  <h5>{section.title}</h5>
                  <ul>
                    {section.bullets.map((bullet, bulletIndex) => (
                      <li key={bulletIndex}>
                        {bullet.text}{" "}
                        <span className={styles.citations}>
                          {bullet.sources.map((id) => (
                            <a
                              key={id}
                              href={`#work-${id}`}
                              onClick={() => {
                                const target = document.getElementById(`work-${id}`);
                                if (target instanceof HTMLDetailsElement) target.open = true;
                              }}
                            >
                              {id}
                            </a>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            ) : (
              <section className={styles.missing}>
                <h5>{edition ? "No sourced items" : "Awaiting your edition"}</h5>
                <p>{page.empty}</p>
              </section>
            )}
            {index === 3 && (
              <section className={styles.reflection}>
                <h5>Notebook prompts</h5>
                <p>Questions for reflection, not claims about your day.</p>
                <ul>
                  <li>What should you carry forward?</li>
                  <li>What needs evidence before calling it finished?</li>
                  <li>What deserves your attention tomorrow?</li>
                </ul>
              </section>
            )}
          </div>
          {page.omitted > 0 && (
            <p className={styles.byline}>
              {page.omitted} additional points remain in the full edition below. Long excerpts are shortened
              for this reading layout.
            </p>
          )}
          <footer>
            <span>
              Record cutoff: {snapshot.collectedAt}. Source IDs refer to the local work records.{" "}
              {snapshot.coverage.some((p) => p.state !== "ok" || p.omitted)
                ? "Coverage is partial."
                : "Coverage follows the selected records."}
            </span>
            <strong>{index + 1} / 4</strong>
          </footer>
        </article>
      ))}
    </div>
  );
}
