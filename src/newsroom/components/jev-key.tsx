"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, KeyRound, Loader2, ShieldAlert, Trash2 } from "lucide-react";
import styles from "./jev-key.module.css";

/**
 * Set the Jev key without editing a file.
 *
 * The field is write-only. Nothing here ever receives the stored key — the
 * server reports only that one exists and its last four characters, so the page
 * can confirm which key is in use without being able to read it back.
 */
interface Status {
  configured: boolean;
  source: "saved" | "environment" | null;
  hint: string | null;
  environmentOverridden: boolean;
}

const HEADERS = { "Content-Type": "application/json", "x-newsroom-client": "1" };

async function call(body: object) {
  const response = await fetch("/api/newsroom/credentials", {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  return { ok: response.ok, data: (await response.json()) as Record<string, unknown> };
}

export function JevKey() {
  const [status, setStatus] = useState<Status | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<"save" | "verify" | "clear" | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const load = useCallback(async (): Promise<Status | null> => {
    try {
      const response = await fetch("/api/newsroom/credentials", { headers: { "x-newsroom-client": "1" } });
      return response.ok ? ((await response.json()) as Status) : null;
    } catch {
      // The panel is still useful without this; each action reports its own errors.
      return null;
    }
  }, []);

  useEffect(() => {
    let live = true;
    void load().then((next) => {
      if (live && next) setStatus(next);
    });
    return () => {
      live = false;
    };
  }, [load]);

  async function run(action: "save" | "verify" | "clear") {
    setBusy(action);
    setMessage(null);
    try {
      const { ok, data } = await call(action === "save" ? { action, key } : { action });
      if (action === "verify") {
        setMessage({ tone: data.ok ? "ok" : "bad", text: String(data.message ?? "") });
      } else if (!ok) {
        setMessage({ tone: "bad", text: String(data.error ?? "That did not work.") });
      } else {
        setStatus(data as unknown as Status);
        // The key is in the store now; it has no reason to stay in the page.
        if (action === "save") setKey("");
        setMessage({ tone: "ok", text: action === "save" ? "Key saved." : "Key removed." });
      }
      if (action === "verify") {
        const next = await load();
        if (next) setStatus(next);
      }
    } catch {
      setMessage({ tone: "bad", text: "Could not reach the local Newsroom server." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="jev-key-heading">
      <h2 id="jev-key-heading" className={styles.title}>
        <KeyRound size={15} aria-hidden /> Jev API key
      </h2>
      <p className={styles.lead}>
        The Jev Live Desk classifies collected stories through TypeSafe. Without a key it runs its demo, which
        calls nothing. Get a key from{" "}
        <a href="https://typesafe.ai" target="_blank" rel="noreferrer noopener">
          typesafe.ai
        </a>
        .
      </p>

      <p className={styles.state} data-configured={status?.configured || undefined}>
        {status === null ? (
          "Checking…"
        ) : status.configured ? (
          <>
            <Check size={14} aria-hidden /> In use: the{" "}
            {status.source === "saved" ? "key saved here" : "TYPESAFE_API_KEY environment variable"}, ending{" "}
            <code>…{status.hint}</code>
          </>
        ) : (
          <>
            <ShieldAlert size={14} aria-hidden /> No key configured. The desk will run its demo only.
          </>
        )}
      </p>
      {status?.environmentOverridden ? (
        <p className={styles.note}>
          <code>TYPESAFE_API_KEY</code> is also set in the environment and is being ignored. Remove the key
          saved here to go back to it.
        </p>
      ) : null}

      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void run("save");
        }}
      >
        <label className={styles.label} htmlFor="jev-key-input">
          {status?.configured ? "Replace the key" : "Paste your key"}
        </label>
        <input
          id="jev-key-input"
          className={styles.input}
          type="password"
          value={key}
          onChange={(event) => setKey(event.target.value)}
          placeholder="ts_…"
          autoComplete="off"
          spellCheck={false}
          // Keep it out of the browser's form history and out of any saved session.
          data-1p-ignore
          name="jev-api-key"
        />
        <div className={styles.actions}>
          <button type="submit" className={styles.primary} disabled={!key.trim() || busy !== null}>
            {busy === "save" ? <Loader2 size={14} className={styles.spin} aria-hidden /> : null} Save key
          </button>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => void run("verify")}
            disabled={!status?.configured || busy !== null}
          >
            {busy === "verify" ? <Loader2 size={14} className={styles.spin} aria-hidden /> : null} Test it
          </button>
          {status?.source === "saved" ? (
            <button
              type="button"
              className={styles.danger}
              onClick={() => void run("clear")}
              disabled={busy !== null}
            >
              <Trash2 size={14} aria-hidden /> Remove
            </button>
          ) : null}
        </div>
      </form>

      {message ? (
        <p className={styles.message} data-tone={message.tone} role="status">
          {message.text}
        </p>
      ) : null}

      <p className={styles.note}>
        The key is stored on this computer only, in a file in your user account&rsquo;s application data, and
        is sent to TypeSafe and nowhere else. It is never shown again after saving — only its last four
        characters.
      </p>
    </section>
  );
}
