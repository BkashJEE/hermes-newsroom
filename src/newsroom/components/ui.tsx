"use client";

import { useEffect, useRef, type ReactNode } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  CircleDot,
  FlaskConical,
  Hammer,
  Lightbulb,
  Minus,
  Newspaper,
  RotateCcw,
  TrendingDown,
  TrendingUp,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  SOURCE_LABELS,
  STORY_TYPE_LABELS,
  momentumLabel,
  type Momentum,
  type SourceId,
  type StoryType,
} from "../model/story";
import styles from "./ui.module.css";

const TYPE_ICONS: Record<StoryType, LucideIcon> = {
  breaking: Zap,
  verified: BadgeCheck,
  developing: CircleDot,
  community: Users,
  build: Hammer,
  research: FlaskConical,
  "pain-point": AlertTriangle,
  opportunity: Lightbulb,
  correction: RotateCcw,
};

/** Small colored label for a story type. Always shows text, never color alone. */
export function TypeLabel({ type, size = "sm" }: { type: StoryType; size?: "sm" | "md" }) {
  const Icon = TYPE_ICONS[type];
  return (
    <span className={styles.typeLabel} data-type={type} data-size={size}>
      <Icon size={size === "md" ? 14 : 12} aria-hidden />
      {STORY_TYPE_LABELS[type]}
    </span>
  );
}

const SOURCE_MARKS: Partial<Record<SourceId, string>> = {
  bluesky: "B",
  reddit: "R",
  hackernews: "Y",
  x: "X",
  facebook: "f",
  github: "GH",
};

const SOURCE_ICONS: Partial<Record<SourceId, LucideIcon>> = {
  "official-blog": Newspaper,
  research: FlaskConical,
  "hermes-community": Users,
};

/** Neutral source badge (letter or generic icon — no third-party logos). */
export function SourceMark({ source }: { source: SourceId }) {
  const Icon = SOURCE_ICONS[source];
  return (
    <span className={styles.sourceMark} data-source={source} aria-hidden>
      {Icon ? <Icon size={13} /> : SOURCE_MARKS[source]}
    </span>
  );
}

export function SourceName({ source, withMark = true }: { source: SourceId; withMark?: boolean }) {
  return (
    <span className={styles.sourceName}>
      {withMark ? <SourceMark source={source} /> : null}
      {SOURCE_LABELS[source]}
    </span>
  );
}

export function MomentumIndicator({
  momentum,
  showValue = false,
}: {
  momentum: Momentum;
  showValue?: boolean;
}) {
  const Icon =
    momentum.direction === "rising" ? TrendingUp : momentum.direction === "falling" ? TrendingDown : Minus;
  return (
    <span className={styles.momentum} data-direction={momentum.direction}>
      <Icon size={14} aria-hidden />
      <span>{momentumLabel(momentum)}</span>
      {showValue && momentum.measured !== false ? (
        <span className={styles.momentumValue}>{momentum.score}</span>
      ) : null}
    </span>
  );
}

export function RelativeTime({ iso, label }: { iso: string; label: string }) {
  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString()}>
      {label}
    </time>
  );
}

interface DialogProps {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  variant?: "drawer" | "modal";
  children: ReactNode;
  className?: string;
}

/**
 * Native <dialog> as a modal or right-hand drawer: focus is trapped by the
 * browser, Escape closes, the page behind is inert, and focus returns to the
 * element that opened it.
 */
export function Dialog({ open, onClose, labelledBy, variant = "modal", children, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleClose = () => {
      opener.current?.focus?.();
      onClose();
    };
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className={`${styles.dialog} ${className ?? ""}`}
      data-variant={variant}
      aria-labelledby={labelledBy}
      onClick={(event) => {
        // Clicking the backdrop (the dialog element itself) closes it.
        if (event.target === ref.current) ref.current?.close();
      }}
    >
      {open ? children : null}
    </dialog>
  );
}

export function DialogClose({ label = "Close" }: { label?: string }) {
  return (
    <button
      type="button"
      className={styles.iconButton}
      aria-label={label}
      onClick={(event) => event.currentTarget.closest("dialog")?.close()}
    >
      <X size={18} aria-hidden />
    </button>
  );
}

export function ScoreChip({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <span className={styles.chip}>
      {Icon ? <Icon size={14} aria-hidden /> : null}
      <span className={styles.chipValue}>{value}</span>
      <span className={styles.chipLabel}>{label}</span>
    </span>
  );
}
