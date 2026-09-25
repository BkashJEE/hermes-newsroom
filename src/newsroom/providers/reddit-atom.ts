import "server-only";
import { DOMParser, type Element, type Node } from "@xmldom/xmldom";

const ATOM = "http://www.w3.org/2005/Atom";
const invalid = () => new Error("Invalid Reddit Atom response.");
function children(element: Element, name: string): Element[] {
  return Array.from(element.childNodes).filter(
    (node): node is Element =>
      node.nodeType === 1 && (node as Element).namespaceURI === ATOM && (node as Element).localName === name,
  );
}
function field(element: Element, name: string) {
  return children(element, name)[0]?.textContent?.trim() ?? "";
}

/** Parse HTML as inert text. Only the post's md body, never Reddit's submission footer. */
function bodyText(html: string): string {
  const doc = new DOMParser({ onError: () => {} }).parseFromString(`<div>${html}</div>`, "text/html");
  const body = Array.from(doc.getElementsByTagName("div")).find((node) =>
    node.getAttribute("class")?.split(/\s+/).includes("md"),
  );
  if (!body) return "";
  function text(node: Node): string {
    if (node.nodeType === 3 || node.nodeType === 4) return node.nodeValue ?? "";
    if (node.nodeType !== 1) return "";
    const name = (node as Element).localName?.toLowerCase();
    if (["script", "style", "iframe", "noscript"].includes(name ?? "")) return "";
    return (
      Array.from(node.childNodes).map(text).join("") +
      (/^(p|div|li|br|h[1-6]|pre|blockquote)$/.test(name ?? "") ? " " : "")
    );
  }
  return text(body).replace(/\s+/g, " ").trim();
}

/** Strict, namespace-aware Atom parsing; no DTDs, external entities or embedded requests. */
export function redditAtomPosts(xml: string) {
  if (xml.length > 1_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw invalid();
  try {
    const doc = new DOMParser({
      onError: () => {
        throw invalid();
      },
    }).parseFromString(xml, "application/xml");
    const root = doc.documentElement;
    if (!root || root.localName !== "feed" || root.namespaceURI !== ATOM) throw invalid();
    return children(root, "entry")
      .slice(0, 100)
      .flatMap((entry) => {
        const id = /^t3_([a-z0-9]+)$/.exec(field(entry, "id"))?.[1];
        const title = field(entry, "title");
        const link = children(entry, "link")
          .find((node) => !node.getAttribute("rel") || node.getAttribute("rel") === "alternate")
          ?.getAttribute("href");
        const publishedAt = field(entry, "published"); // updated is not publication time.
        if (!id || !title || !link || !publishedAt) return [];
        let url: URL;
        try {
          url = new URL(link);
        } catch {
          return [];
        }
        if (
          url.protocol !== "https:" ||
          url.hostname !== "www.reddit.com" ||
          url.port ||
          url.username ||
          url.password ||
          new RegExp(`^/r/[A-Za-z0-9_]+/comments/${id}/[A-Za-z0-9_%~-]*/?$`).test(url.pathname) === false
        )
          return [];
        const content = children(entry, "content")[0];
        const body = content?.getAttribute("type") === "html" ? bodyText(content.textContent ?? "") : "";
        if (["[removed]", "[deleted]"].includes(body)) return [];
        return [{ id, title, text: body || title, publishedAt, url: `${url.origin}${url.pathname}` }];
      });
  } catch {
    throw invalid();
  }
}
