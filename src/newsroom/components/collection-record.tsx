"use client";

import { ExternalLink, Filter } from "lucide-react";
import { useNewsroom } from "../state/newsroom-store";
import styles from "./collection-record.module.css";

/**
 * What the editorial gate did, in the open.
 *
 * A feed that quietly filters itself is indistinguishable from a feed that found
 * nothing, and a reader cannot tell an editorial judgement from a broken source.
 * This states both numbers and names the rule behind every exclusion, with the
 * excluded items linked so the decision can be checked rather than trusted.
 */
export function CollectionRecord() {
  const { feed } = useNewsroom();
  if (!feed) return null;
  const record = feed.collection;

  // Fixture data is shown exactly as authored, so there is no decision to report.
  // Say that, rather than printing zeroes that look like a gate finding nothing.
  if (!record) {
    return (
      <section className={styles.panel} aria-labelledby="collection-heading">
        <h2 id="collection-heading" className={styles.title}>
          <Filter size={15} aria-hidden /> Collection record
        </h2>
        <p className={styles.summary}>
          Demo data is shown exactly as authored. With live sources on, this reports every signal collected,
          how many survived the editorial gate, and the rule that excluded each of the rest.
        </p>
      </section>
    );
  }

  return (
    <section className={styles.panel} aria-labelledby="collection-heading">
      <h2 id="collection-heading" className={styles.title}>
        <Filter size={15} aria-hidden /> Collection record
      </h2>
      <p className={styles.summary}>
        <strong>{record.collected}</strong> signals collected · <strong>{record.kept}</strong> reported an
        event · <strong>{record.excluded}</strong> excluded
      </p>
      {record.excluded === 0 ? (
        <p className={styles.clean}>Every collected signal reported an event. Nothing was excluded.</p>
      ) : (
        <ul className={styles.reasons}>
          {record.reasons.map((reason) => (
            <li key={reason.reason}>
              <details className={styles.reason}>
                <summary className={styles.reasonHead}>
                  <span className={styles.count}>{reason.count}</span>
                  <span className={styles.label}>{reason.label}</span>
                  <span className={styles.rule}>{reason.rule}</span>
                </summary>
                <ul className={styles.examples}>
                  {reason.examples.map((example) => (
                    <li key={example.id}>
                      <a href={example.sourceUrl} target="_blank" rel="noreferrer noopener">
                        {example.title}
                        <ExternalLink size={12} aria-hidden />
                      </a>
                      <span className={styles.source}>{example.sourceLabel}</span>
                    </li>
                  ))}
                  {reason.count > reason.examples.length ? (
                    <li className={styles.more}>
                      and {reason.count - reason.examples.length} more under the same rule
                    </li>
                  ) : null}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      )}
      <p className={styles.note}>
        Every rule above is deterministic and runs before anything is ranked. No model decides what you see.
      </p>
    </section>
  );
}
