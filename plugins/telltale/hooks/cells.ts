// Ticket 10: pure-function base for band cells. SDD §1.1a, §2.6260, §2.6a.
// Pure functions only: no `claude-code` import, no `$`.
import { displayWidth } from "./width";

export type Step = { name: string; detail?: string; t0: number; t1?: number };
export type Cell = {
  id: string;
  kind: "main" | "sub" | "bg";
  label: string;
  model?: string;
  desc: string;
  status: "running" | "completed" | "failed" | "killed" | "orphan";
  firstAt: number;
  endAt?: number;
  updatedAt: number;
  steps: Step[];
  dismissed?: true;
};

// Time and layout constants — sole source of truth (DESIGN §5).
export const TRANSIT_MS = 600;
export const BIRTH_MS = 400;
export const BREATHE_MS = 600;
export const SLIDE_MS = 500;
export const COLLAPSE_AFTER_MS = 3000;
export const VANISH_AFTER_MS = 60_000;
export const FLASH_MS = 1000;
export const CAMERA_MARGIN = 28;
export const CAMERA_GAIN = 0.25;
export const MARQUEE_STEP_MS = 300;
export const STEPS_MAX = 64;
export const LONG_RUN_MS = 30 * 60 * 1000; // derived, not a second literal
export const ORPHAN_MS = 2 * 60 * 60 * 1000; // derived, not a second literal
export const NODE_W = 12;
export const EDGE_W = 4;
export const STRIP_W = 8;

// Symbol table — sole source of truth for DESIGN §2/§3 glyphs.
export const SYMBOLS = {
  current: "◉", // current node (running, breathing)
  walked: "●", // node already visited
  pending: "·", // placeholder for a not-yet-arrived node
  packet: "◆", // traveling light dot
  packetTail: "·", // packet's trailing dots (same glyph as pending, DESIGN §3)
  done: "✓", // cell / main history: completed
  failed: "✗", // cell or node: failed
  orphan: "?", // background task orphaned
  edgeDash: "─",
  edgeArrow: "▸",
  boxTL: "┌",
  boxTR: "┐",
  boxBL: "└",
  boxBR: "┘",
  boxV: "│",
  spinner: "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏", // running cell title glyph; renderCell uses spinner[frame % spinner.length]
  ellipsis: "…",
  moreSep: " +", // prefix of "… +N more" (paired with fitCells)
} as const;

/** Format an elapsed duration. Negative or zero clamps to "0s". */
export const formatElapsed = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const totalMinutes = Math.floor(totalSeconds / 60);
  const remSeconds = totalSeconds % 60;
  if (totalMinutes < 60) {
    // Compute the padded remainder unconditionally so a tampered pad
    // (e.g. treating 0 as truthy) is observable even on an exact minute.
    const ss = String(remSeconds).padStart(2, "0");
    return ss === "00" ? `${totalMinutes}m` : `${totalMinutes}m${ss}`;
  }

  const totalHours = Math.floor(totalMinutes / 60);
  const remMinutes = totalMinutes % 60;
  return remMinutes > 0 ? `${totalHours}h${String(remMinutes).padStart(2, "0")}` : `${totalHours}h`;
};

// Pad `s` with trailing spaces to display-width `w`. Caller guarantees
// displayWidth(s) <= w.
const padRight = (s: string, w: number): string => s + " ".repeat(Math.max(0, w - displayWidth(s)));

/** Scroll `text` within a window of display-width `w`, driven by `now`. */
export const marquee = (text: string, w: number, now: number): string => {
  if (displayWidth(text) <= w) return padRight(text, w);

  const loop = [...`${text}   ·   `];
  const total = loop.reduce((n, ch) => n + displayWidth(ch), 0);
  const offset = Math.floor(now / MARQUEE_STEP_MS) % total;

  let skipped = 0;
  let i = 0;
  while (skipped < offset) {
    skipped += displayWidth(loop[i % loop.length] as string);
    i++;
  }

  let out = "";
  let used = 0;
  while (used < w) {
    const ch = loop[i % loop.length] as string;
    const chWidth = displayWidth(ch);
    if (used + chWidth > w) break;
    out += ch;
    used += chWidth;
    i++;
  }
  return padRight(out, w);
};

/** Sort cells: running first, then firstAt ascending, then id ascending. Does not mutate input. */
export const sortCells = (cells: readonly Cell[]): Cell[] =>
  [...cells].sort((a, b) => {
    const runningDiff = (a.status === "running" ? 0 : 1) - (b.status === "running" ? 0 : 1);
    if (runningDiff !== 0) return runningDiff;
    if (a.firstAt !== b.firstAt) return a.firstAt - b.firstAt;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

/** Split cells into shown/hidden by count, after sorting. `budget` is a cell count, not rows/columns. */
export const fitCells = (cells: readonly Cell[], budget: number): { shown: Cell[]; hidden: Cell[] } => {
  const sorted = sortCells(cells);
  if (budget <= 0) return { shown: [], hidden: sorted };
  return { shown: sorted.slice(0, budget), hidden: sorted.slice(budget) };
};

/** Only `completed` cells auto-collapse (DESIGN §3); failed/killed/orphan stay until dismissed. */
export const isCollapsed = (cell: Cell, now: number): boolean =>
  cell.status === "completed" && cell.endAt !== undefined && now - cell.endAt > COLLAPSE_AFTER_MS;

/** Only `completed` cells auto-vanish (DESIGN §3). */
export const isVanished = (cell: Cell, now: number): boolean =>
  cell.status === "completed" && cell.endAt !== undefined && now - cell.endAt > VANISH_AFTER_MS;

const MERGED_HEAD = /^… ×(\d+)$/;

/** Storage-layer compression: cap `steps` at STEPS_MAX by merging the oldest overflow into one step. */
export const compressSteps = (steps: readonly Step[]): Step[] => {
  if (steps.length <= STEPS_MAX) return [...steps];

  const overflowCount = steps.length - (STEPS_MAX - 1);
  const overflow = steps.slice(0, overflowCount);
  const kept = steps.slice(overflowCount);

  const firstOverflow = overflow[0] as Step;
  const lastOverflow = overflow[overflow.length - 1] as Step;
  const alreadyMerged = MERGED_HEAD.exec(firstOverflow.name);
  const mergedCount = (alreadyMerged ? Number(alreadyMerged[1]) : 1) + (overflow.length - 1);

  const merged: Step = {
    name: `… ×${mergedCount}`,
    t0: firstOverflow.t0,
    ...(lastOverflow.t1 !== undefined ? { t1: lastOverflow.t1 } : {}),
  };

  return [merged, ...kept];
};

