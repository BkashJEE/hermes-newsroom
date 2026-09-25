"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useNewsroom } from "../state/newsroom-store";
import { askHermes } from "../hermes/client";
import { readJSON, writeJSON } from "../state/storage";
import styles from "./hermes-panel.module.css";
import { useSectionStories } from "../state/use-section-stories";

export function HermesPanel() {
  const path = usePathname() ?? "/newsroom";
  return <Panel key={path} path={path} />;
}
function Panel({ path }: { path: string }) {
  const { announce, feed, scenario } = useNewsroom();
  const section = path.split("/").pop() ?? "front-page";
  const sectionSelection = useSectionStories(section);
  const availableIds = new Set(feed?.stories.map((story) => story.id));
  const selected = sectionSelection.filter((story) => availableIds.has(story.id)).slice(0, 40);
  const [status, setStatus] = useState("Checking Hermes…");
  const [question, setQuestion] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = `newsroom:hermes:${path}`;
  useEffect(() => {
    let mounted = true;
    if (scenario !== "offline" && navigator.onLine !== false)
      fetch("/api/newsroom/hermes")
        .then((r) => r.json())
        .then((s) => {
          if (mounted) setStatus(typeof s.message === "string" ? s.message : "Hermes status unavailable");
        })
        .catch(() => {
          if (mounted) setStatus("Hermes unavailable");
        });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore this section's saved response
    setText(readJSON<string>(key, ""));
    return () => {
      mounted = false;
    };
  }, [key, scenario]);
  const task = path.endsWith("hermes-daily")
    ? "daily"
    : path.endsWith("weekly-chronicle")
      ? "weekly"
      : "analyze";
  async function run() {
    setBusy(true);
    setError("");
    try {
      const result = await askHermes(
        task,
        question ||
          `Review the ${path.split("/").pop()} section. Give a concise ${task === "analyze" ? "evidence-based assessment and next actions" : task + " brief"}.`,
        selected.map((s) => s.id),
      );
      const output = `${result.composedBy} · ${new Date(result.generatedAt).toLocaleString()} · ${result.feedMode} data\n\n${result.text}`;
      setText(output);
      writeJSON(key, output);
      setStatus("Hermes connected");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className={styles.panel}>
      <summary>
        Hermes Agent <span>{status}</span>
      </summary>
      <p>
        Ask Hermes to review this section, write a brief, or suggest your next steps.{" "}
        {feed?.mode === "fixture"
          ? "The current feed contains example stories."
          : "Uses the current source feed."}
      </p>
      <p>
        Reviews {selected.length} current feed stories from this section (maximum 40).
        {section === "weekly-chronicle"
          ? " Reviews Hermes feed stories only; the separate weekly GitHub activity catalog is not included."
          : ""}
        {section === "built-with-hermes" ? " The separate GitHub project catalog is not included." : ""}
        {section === "content-desk"
          ? " Saved draft text stays on this device; this reviews the filtered story recommendations."
          : ""}
        {section === "archive"
          ? " Older retained stories no longer in the current feed are not included."
          : ""}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <label htmlFor="hermes-question">Instructions for Hermes</label>
        <textarea
          id="hermes-question"
          rows={2}
          maxLength={4000}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What matters here, and what should I do next?"
        />
        <button disabled={busy || !feed || selected.length === 0} type="submit">
          {busy ? "Hermes is working…" : task === "analyze" ? "Ask Hermes" : `Write ${task} with Hermes`}
        </button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      {text ? (
        <>
          <pre className={styles.output}>{text}</pre>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text);
                announce("Hermes response copied.");
              } catch {
                announce("Select the response to copy it manually.");
              }
            }}
          >
            Copy Hermes response
          </button>
        </>
      ) : null}
    </details>
  );
}
