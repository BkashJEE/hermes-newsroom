import type { Metadata } from "next";

/* The archive is its own public site, so this tab frames it rather than
   reimplementing it — one source of truth, and the shelves stay in step with
   whatever the archive ships. */
const ARCHIVE_URL = process.env.NEXT_PUBLIC_ARCHIVE_URL ?? "https://hermes-agent-archive.vercel.app";

export const metadata: Metadata = {
  title: "Hermes Archive",
  description: "What people actually build with Hermes, quoted and credited.",
};

const SHELVES = [
  { id: "use-cases", label: "User stories" },
  { id: "commands", label: "Commands" },
  { id: "trending", label: "Trending" },
  { id: "toolkit", label: "Works with" },
  { id: "my-work", label: "My work" },
];

export default function ArchivePage() {
  return (
    <main id="main" style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <nav
        aria-label="Archive shelves"
        style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "12px var(--margin)" }}
      >
        {SHELVES.map((shelf) => (
          <a
            key={shelf.id}
            href={`${ARCHIVE_URL}/#${shelf.id}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 13, opacity: 0.8 }}
          >
            {shelf.label}
          </a>
        ))}
        <a
          href={ARCHIVE_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ marginLeft: "auto", fontSize: 13 }}
        >
          Open in a browser ↗
        </a>
      </nav>
      <iframe
        title="Hermes Agent Archive"
        src={ARCHIVE_URL}
        loading="lazy"
        style={{ flex: 1, width: "100%", border: 0, minHeight: 0 }}
      />
    </main>
  );
}
