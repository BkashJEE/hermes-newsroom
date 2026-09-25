import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" style={{ padding: "64px var(--margin)" }}>
      <h1 style={{ fontFamily: "var(--font-display)", textTransform: "uppercase" }}>Page not found</h1>
      <p style={{ color: "var(--text-2)" }}>That tab does not exist in this Command Center.</p>
      <Link href="/">Back to the Command Center</Link>
    </main>
  );
}
