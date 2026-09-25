"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import {
  BarChart3,
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  FileText,
  MoreHorizontal,
  ShieldCheck,
} from "lucide-react";
import { STORY_TYPE_LABELS, type Story, type StoryType } from "../model/story";
import { timeAgo } from "../model/derive";
import { useNewsroom } from "../state/newsroom-store";
import { MomentumIndicator, RelativeTime, SourceMark, TypeLabel } from "./ui";
import { NewsBullets } from "./news-bullets";
import styles from "./flashcard.module.css";

interface OverflowItem {
  label: string;
  onSelect: () => void;
}

export function OverflowMenu({ label, items }: { label: string; items: OverflowItem[] }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    wrap.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  function onKeyDown(event: KeyboardEvent) {
    const nodes = Array.from(wrap.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
    const index = nodes.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      toggle.current?.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      nodes[(index + (event.key === "ArrowDown" ? 1 : -1) + nodes.length) % nodes.length]?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div className={styles.overflow} ref={wrap}>
      <button
        ref={toggle}
        type="button"
        className={styles.iconButton}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(!open)}
      >
        <MoreHorizontal size={17} aria-hidden />
      </button>
      {open ? (
        <div id={menuId} role="menu" aria-label={label} className={styles.menu} onKeyDown={onKeyDown}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={() => {
                setOpen(false);
                item.onSelect();
                toggle.current?.focus();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function useStoryMenu(story: Story): OverflowItem[] {
  const { openFile, toggleSave, toggleTrack, tracked, dismiss, restore } = useNewsroom();
  return [
    { label: "Open intelligence file", onSelect: () => openFile(story.id) },
    { label: story.saved ? "Remove from saved" : "Save story", onSelect: () => toggleSave(story.id) },
    { label: tracked.has(story.id) ? "Stop tracking" : "Track story", onSelect: () => toggleTrack(story.id) },
    story.dismissed
      ? { label: "Restore story", onSelect: () => restore(story.id) }
      : { label: "Dismiss story", onSelect: () => dismiss(story.id) },
  ];
}

interface FlashcardProps {
  story: Story;
  /** Heading level inside the page outline. */
  headingLevel?: 2 | 3;
}

/**
 * Compact intelligence card. The variant comes from the story type and only
 * changes the small label and the edge strip — never the whole card.
 */
export function Flashcard({ story, headingLevel = 3 }: FlashcardProps) {
  const { now, toggleSave, openFile, tracked } = useNewsroom();
  const [expanded, setExpanded] = useState(false);
  const menu = useStoryMenu(story);
  const bodyId = useId();
  const Heading = `h${headingLevel}` as const;

  return (
    <article className={styles.card} data-type={story.type} data-dismissed={story.dismissed || undefined}>
      <header className={styles.top}>
        <TypeLabel type={story.type} />
        <span className={styles.meta}>
          <RelativeTime iso={story.publishedAt} label={timeAgo(story.publishedAt, now)} />
        </span>
        <span className={styles.flags}>
          {tracked.has(story.id) ? <span className={styles.flag}>Tracking</span> : null}
          {story.saved ? <span className={styles.flag}>Saved</span> : null}
          {story.dismissed ? <span className={styles.flag}>Dismissed</span> : null}
        </span>
      </header>

      <div className={styles.body}>
        <div className={styles.text}>
          <Heading className={styles.headline}>
            <button type="button" className={styles.headlineButton} onClick={() => openFile(story.id)}>
              {story.title}
            </button>
          </Heading>
          <NewsBullets className={styles.summary} text={story.summary} />
        </div>
        {story.image ? (
          <Image
            className={styles.thumb}
            src={story.image.src}
            alt={story.image.alt}
            width={112}
            height={84}
            unoptimized
          />
        ) : null}
      </div>

      <p className={styles.source}>
        <SourceMark source={story.source} />
        {story.sourceLabel}
      </p>

      <dl className={styles.stats}>
        <div>
          <dt>
            <FileText size={15} aria-hidden />
            <span className="visually-hidden">Independent sources</span>
          </dt>
          <dd>
            {story.sourceCount} <span className={styles.unit}>sources</span>
          </dd>
        </div>
        <div>
          <dt>
            <BarChart3 size={15} aria-hidden />
            <span className="visually-hidden">Hermes relevance</span>
          </dt>
          <dd>
            {story.relevanceScore} <span className={styles.unit}>rel</span>
          </dd>
        </div>
        <div>
          <dt>
            <ShieldCheck size={15} aria-hidden />
            <span className="visually-hidden">Evidence score</span>
          </dt>
          <dd>
            {story.evidenceMeasured === false ? "Unmeasured" : story.evidenceScore}{" "}
            <span className={styles.unit}>evid</span>
          </dd>
        </div>
        <div>
          <dt className="visually-hidden">Momentum</dt>
          <dd>
            <MomentumIndicator momentum={story.momentum} />
          </dd>
        </div>
      </dl>

      {expanded ? (
        <div id={bodyId} className={styles.expanded}>
          <h4 className={styles.subhead}>Why it matters</h4>
          <p>{story.file.whyItMatters}</p>
          <p className={styles.topics}>
            {story.topics.map((t) => (
              <span key={t}>{t}</span>
            ))}
          </p>
          <button type="button" className={styles.linkButton} onClick={() => openFile(story.id)}>
            Open intelligence file →
          </button>
        </div>
      ) : null}

      <footer className={styles.actions}>
        <button
          type="button"
          className={styles.iconButton}
          aria-pressed={story.saved}
          aria-label={story.saved ? `Remove “${story.title}” from saved` : `Save “${story.title}”`}
          onClick={() => toggleSave(story.id)}
        >
          {story.saved ? <BookmarkCheck size={17} aria-hidden /> : <Bookmark size={17} aria-hidden />}
        </button>
        <button
          type="button"
          className={styles.expand}
          aria-expanded={expanded}
          aria-controls={expanded ? bodyId : undefined}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Less" : "Expand"}
          <ChevronDown size={15} aria-hidden data-open={expanded || undefined} />
        </button>
        <OverflowMenu label={`More actions for “${story.title}”`} items={menu} />
      </footer>
    </article>
  );
}

export function EmptyFlashcard({ type }: { type: StoryType }) {
  return (
    <article className={styles.card} data-type={type} data-empty>
      <header className={styles.top}>
        <TypeLabel type={type} />
      </header>
      <p className={styles.emptyText}>
        No {STORY_TYPE_LABELS[type].toLowerCase()} stories match the current filters.
      </p>
    </article>
  );
}
