import styles from "./news-bullets.module.css";

const sentences = new Intl.Segmenter("en", { granularity: "sentence" });

/** Display source prose as plain-text points without interpreting source HTML. */
function points(text: string): string[] {
  const plain = text
    .replace(/\r\n?/g, "\n")
    .replace(/^\s*#{1,6}\s+.*$/gm, "")
    .replace(/^\s*```[^\n]*$/gm, "")
    .replace(/!?\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/(^|\s)\*([^*\n]+)\*(?=\s|[.,;:]|$)/g, "$1$2")
    .replace(/^\s*(?:[-*+•]|\d+[.)])\s+/gm, "")
    .replace(/^\s*>\s?/gm, "");
  return plain
    .split(/\n\s*\n|\n(?=\S)|;\s+/)
    .flatMap((block) => Array.from(sentences.segment(block), (part) => part.segment))
    .map((point) => point.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function NewsBullets({ text, className = "" }: { text: string; className?: string }) {
  return (
    <ul className={`${styles.list} ${className}`}>
      {points(text).map((point, index) => (
        <li key={index}>{point}</li>
      ))}
    </ul>
  );
}
