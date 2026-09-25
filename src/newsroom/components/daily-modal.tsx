"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { askHermes } from "../hermes/client";
import { localBridge, type DailyBrief } from "../hermes/bridge";
import { useNewsroom } from "../state/newsroom-store";
import { Dialog, DialogClose } from "./ui";
import styles from "./dialogs.module.css";

/** Hermes Daily preview, composed through the Hermes bridge (local in v1). */
export function DailyModal() {
  const { dailyOpen, setDailyOpen, filtered: stories, now, openFile, announce } = useNewsroom();
  const [brief, setBrief] = useState<DailyBrief | null>(null);

  useEffect(() => {
    if (!dailyOpen) return;
    let cancelled = false;
    void localBridge.composeDaily(stories, now).then((result) => {
      if (!cancelled) setBrief(result);
    });
    return () => {
      cancelled = true;
    };
    // Compose once per opening; later feed refreshes should not rewrite an open brief.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyOpen]);

  const [agentText, setAgentText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function generate() {
    setBusy(true);
    setError("");
    try {
      const result = await askHermes(
        "daily",
        "Write a concise daily brief with source links and next actions.",
        stories.filter((s) => !s.dismissed).map((s) => s.id),
      );
      setAgentText(result.text);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Hermes request failed.");
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    if (!brief) return;
    try {
      await navigator.clipboard.writeText(agentText || brief.text);
      announce("Daily brief copied to the clipboard.");
    } catch {
      announce("Copy failed. Select the text and copy it manually.");
    }
  }

  return (
    <Dialog open={dailyOpen} onClose={() => setDailyOpen(false)} labelledBy="daily-title">
      <div className={styles.modal}>
        <header className={styles.modalHeader}>
          <div>
            <span className={styles.eyebrow}>Hermes Daily</span>
            <h2 id="daily-title" className={styles.modalTitle}>
              {brief?.title ?? "Composing…"}
            </h2>
          </div>
          <DialogClose label="Close daily brief" />
        </header>
        <p className={styles.notice}>{brief?.composedBy ?? "Composing the brief…"}</p>
        {brief && brief.items.length === 0 ? (
          <p className={styles.muted}>No stories to include yet.</p>
        ) : null}
        <button type="button" className={styles.primary} disabled={busy} onClick={generate}>
          {busy ? "Hermes is writing…" : "Write daily with Hermes"}
        </button>
        {error ? <p role="alert">{error}</p> : null}
        {agentText ? <div style={{ whiteSpace: "pre-wrap" }}>{agentText}</div> : null}
        <ol className={styles.brief}>
          {brief?.items.map((item) => (
            <li key={item.storyId}>
              <button
                type="button"
                className={styles.briefHeadline}
                onClick={() => {
                  setDailyOpen(false);
                  openFile(item.storyId);
                }}
              >
                {item.headline}
              </button>
              <p>{item.line}</p>
            </li>
          ))}
        </ol>
        <footer className={styles.modalFooter}>
          <Link
            href="/newsroom/hermes-daily"
            className={styles.secondary}
            onClick={() => setDailyOpen(false)}
          >
            Read the newspaper
          </Link>
          <button type="button" className={styles.primary} onClick={copy} disabled={!brief?.items.length}>
            <Copy size={16} aria-hidden /> Copy brief
          </button>
        </footer>
      </div>
    </Dialog>
  );
}
