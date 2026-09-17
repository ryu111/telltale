// Ticket 10: pure-function base for band cells. SDD §1.1a, §2.6260, §2.6a.
// Ticket 14: renderCell v1/v2/v4 static layout. SDD §1.1a, §2.6260.
// Pure functions only: no `claude-code` import, no `$`.
import { displayWidth, fit } from "./width";

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
const pad = (s: string, w: number): string => s + " ".repeat(Math.max(0, w - displayWidth(s)));

/** Scroll `text` within a window of display-width `w`, driven by `now`. */
export const marquee = (text: string, w: number, now: number): string => {
  if (displayWidth(text) <= w) return pad(text, w);

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
  return pad(out, w);
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

// ============================================================================
// Ticket 14: renderCell — v1/v2/v4 static layout. SDD §1.1a, §2.6260;
// DESIGN.md §1/§2/§3. This ticket's fixtures are always "settled" (now is
// well past every step's t0 + TRANSIT_MS + BIRTH_MS): no packet, no
// typewriter reveal, no breathing, no eased camera (cam is hard-locked to
// its target — ticket 15 swaps that for easeCamera). `frame` only feeds the
// running-cell spinner glyph.
// ============================================================================

export type Tone2 =
  | "green"
  | "greenDim"
  | "blue"
  | "violet"
  | "amber"
  | "red"
  | "grey"
  | "greyDim"
  | "greyDeep"
  | "white"
  | "current"
  | "currentFailed";

export type CellLine = { spans: { text: string; tone: Tone2 }[] };
export type CameraState = { offset: number };

// A single display column: one Unicode code point plus the tone painting it.
// This is the working representation for every row — width-aware, so a
// two-column (CJK) glyph never gets sliced in half by pad/window/truncate.
type Col = { ch: string; tone: Tone2 };

const toCols = (text: string, tone: Tone2): Col[] => [...text].map((ch) => ({ ch, tone }));
const colsWidth = (cols: readonly Col[]): number => cols.reduce((n, c) => n + displayWidth(c.ch), 0);

// Pad/truncate `cols` to exactly `width` display columns, keeping the LEFT
// (prefix) side: used for left-to-right reading content (header, v2 rows)
// where "what fits first" matters more than "what's newest".
const fitLeft = (cols: readonly Col[], width: number, padTone: Tone2): Col[] => {
  const w = colsWidth(cols);
  if (w === width) return [...cols];
  if (w < width) return [...cols, ...toCols(" ".repeat(width - w), padTone)];
  let acc = 0;
  const kept: Col[] = [];
  for (const c of cols) {
    const cw = displayWidth(c.ch);
    if (acc + cw > width) break;
    kept.push(c);
    acc += cw;
  }
  return acc < width ? [...kept, ...toCols(" ".repeat(width - acc), padTone)] : kept;
};

// Keep the RIGHT (newest) `width` display columns of `cols`, dropping the
// left/oldest side. This is this ticket's hard-locked stand-in for the
// camera: "跳到硬鎖位置：右緣對齊最新節點" (ticket 15 eases it instead).
const windowRight = (cols: readonly Col[], width: number): Col[] => {
  const w = colsWidth(cols);
  if (w <= width) return [...cols];
  let acc = 0;
  const kept: Col[] = [];
  for (let i = cols.length - 1; i >= 0; i--) {
    const cw = displayWidth(cols[i]!.ch);
    if (acc + cw > width) break;
    kept.unshift(cols[i]!);
    acc += cw;
  }
  return kept;
};

const colsToLine = (cols: readonly Col[]): CellLine => {
  const spans: { text: string; tone: Tone2 }[] = [];
  for (const { ch, tone } of cols) {
    const last = spans[spans.length - 1];
    if (last && last.tone === tone) last.text += ch;
    else spans.push({ text: ch, tone });
  }
  return { spans: spans.length > 0 ? spans : [{ text: "", tone: "greyDeep" }] };
};

// Node kind -> tone, per the Tone2 table (DESIGN §2). Falls through to
// "blue" (tool) for anything that isn't one of the four named kinds.
const kindTone = (stepName: string): Tone2 =>
  stepName === "think" ? "violet" : stepName === "Agent" ? "amber" : stepName === "reply" ? "green" : stepName === "prompt" ? "grey" : "blue";

// Symbol + tones for step `i` of `cell`. The last step is always "current"
// (this ticket never models an arriving/pending node — see file header).
// Priority, per the ticket's Tone2 table: "整個 cell 降到極暗灰" beats
// "符號保留種類色" whenever the cell isn't running, EXCEPT the current
// node of a failed cell, which stays the dedicated "currentFailed" red.
const nodeGlyph = (cell: Cell, i: number): { symbol: string; symbolTone: Tone2; nameTone: Tone2 } => {
  const isCurrent = i === cell.steps.length - 1;
  if (cell.status !== "running") {
    if (cell.status === "failed" && isCurrent) {
      // Tone2 table: the failed glyph itself is "red" (same as the border);
      // "currentFailed" names the current *node* specifically (its label).
      return { symbol: SYMBOLS.failed, symbolTone: "red", nameTone: "currentFailed" };
    }
    return { symbol: SYMBOLS.walked, symbolTone: "greyDeep", nameTone: "greyDeep" };
  }
  if (isCurrent) return { symbol: SYMBOLS.current, symbolTone: "current", nameTone: "current" };
  return { symbol: SYMBOLS.walked, symbolTone: kindTone(cell.steps[i]!.name), nameTone: "greyDim" };
};

const borderTone = (cell: Cell): Tone2 => (cell.status === "running" ? "greenDim" : cell.status === "failed" ? "red" : "greyDeep");
const edgeTone = (cell: Cell): Tone2 => (cell.status === "running" ? "green" : "greyDeep");

// Header row shared by v1/v4 (bare) and v2 (framed, same text). "整行覆蓋規
// 則": once the cell isn't running, every chunk but the failed symbol dims
// to greyDeep — `dim` below is exactly that rule.
const headerCols = (cell: Cell, w: number, now: number, frame: number): Col[] => {
  const running = cell.status === "running";
  const dim = (tone: Tone2): Tone2 => (cell.status !== "running" ? "greyDeep" : tone);
  const symbol =
    cell.status === "running"
      ? SYMBOLS.spinner[frame % SYMBOLS.spinner.length]!
      : cell.status === "failed" || cell.status === "killed"
        ? SYMBOLS.failed
        : SYMBOLS.done;
  const symbolTone: Tone2 = running ? "green" : cell.status === "failed" ? "red" : "greyDeep";
  const nameTone = dim(cell.kind === "main" ? "amber" : "violet");

  const fixed: Col[] = [
    ...toCols(`${symbol} `, symbolTone),
    ...toCols(cell.label, nameTone),
    ...(cell.model !== undefined ? toCols(` ${cell.model}`, dim("grey")) : []),
    ...toCols(` ${formatElapsed((cell.endAt ?? now) - cell.firstAt)}`, dim("blue")),
    ...toCols(" · ", dim("grey")),
  ];
  const fixedWidth = colsWidth(fixed);
  const remaining = w - fixedWidth;
  const marqueeText = remaining > 0 ? marquee(cell.desc, remaining, now) : "";
  const full = [...fixed, ...toCols(marqueeText, dim("grey"))];
  // Safety net for I4: if the fixed prefix alone already overruns `w` (only
  // possible at very small w with a long label), fitLeft trims the tail.
  return fitLeft(full, w, dim("grey"));
};

// ---------- v1: header + 3-row horizontal box chain ----------

const buildV1Chain = (cell: Cell, w: number): { top: Col[]; mid: Col[]; bot: Col[] } => {
  let top: Col[] = [];
  let mid: Col[] = [];
  let bot: Col[] = [];
  const bt = borderTone(cell);
  cell.steps.forEach((step, i) => {
    const { symbol, symbolTone, nameTone } = nodeGlyph(cell, i);
    const name = step.name;
    const nodeName = pad(fit(name, NODE_W - 4), NODE_W - 4);
    top = [...top, ...toCols(`${SYMBOLS.boxTL}${SYMBOLS.edgeDash.repeat(NODE_W - 2)}${SYMBOLS.boxTR}`, bt)];
    mid = [
      ...mid,
      ...toCols(SYMBOLS.boxV, bt),
      ...toCols(`${symbol} `, symbolTone),
      ...toCols(nodeName, nameTone),
      ...toCols(SYMBOLS.boxV, bt),
    ];
    bot = [...bot, ...toCols(`${SYMBOLS.boxBL}${SYMBOLS.edgeDash.repeat(NODE_W - 2)}${SYMBOLS.boxBR}`, bt)];
    if (i < cell.steps.length - 1) {
      top = [...top, ...toCols(" ".repeat(EDGE_W), bt)];
      mid = [...mid, ...toCols(`${SYMBOLS.edgeDash.repeat(EDGE_W - 1)}${SYMBOLS.edgeArrow}`, edgeTone(cell))];
      bot = [...bot, ...toCols(" ".repeat(EDGE_W), bt)];
    }
  });
  return {
    top: fitLeft(windowRight(top, w), w, "greyDeep"),
    mid: fitLeft(windowRight(mid, w), w, "greyDeep"),
    bot: fitLeft(windowRight(bot, w), w, "greyDeep"),
  };
};

const renderV1 = (cell: Cell, w: number, h: number, now: number, frame: number): CellLine[] => {
  const header = colsToLine(headerCols(cell, w, now, frame));
  if (isCollapsed(cell, now)) return [header];
  const { top, mid, bot } = buildV1Chain(cell, w);
  return [header, colsToLine(top), colsToLine(mid), colsToLine(bot)].slice(0, Math.max(0, h));
};

// v4's header + single ticker chain is built directly in `renderCell` below
// (it needs `h` for the length guard, which the other styles don't).

// ---------- v2: framed header + vertical node list (hard-locked scroll) ----------

const v2NodeRow = (cell: Cell, i: number, inner: number, now: number): Col[] => {
  const step = cell.steps[i]!;
  const { symbol, symbolTone, nameTone } = nodeGlyph(cell, i);
  const running = cell.status === "running";
  const name = pad(fit(step.name, 10), 10);
  const detailW = Math.max(0, inner - 22);
  const detail = pad(fit(step.detail ?? "", detailW), detailW);
  const elapsed = pad(formatElapsed((step.t1 ?? now) - step.t0), 7);
  const row: Col[] = [
    ...toCols(" ", symbolTone),
    ...toCols(symbol, symbolTone),
    ...toCols(" ", symbolTone),
    ...toCols(name, nameTone),
    ...toCols(detail, running ? "grey" : "greyDeep"),
    ...toCols(elapsed, running ? "blue" : "greyDeep"),
  ];
  return fitLeft(row, inner, "greyDeep");
};

const v2EdgeRow = (cell: Cell, inner: number): Col[] => fitLeft([...toCols(" ", edgeTone(cell)), ...toCols(SYMBOLS.boxV, edgeTone(cell))], inner, "greyDeep");

const renderV2Layout = (cell: Cell, w: number, h: number, now: number, frame: number): CellLine[] => {
  if (isCollapsed(cell, now)) return renderStrip(cell, h);
  const inner = Math.max(0, w - 2);
  const bt = borderTone(cell);

  const headerContent = fitLeft([...toCols(" ", bt), ...headerCols(cell, Math.max(0, inner - 1), now, frame)], inner, bt);
  const top = colsToLine([...toCols(SYMBOLS.boxTL, bt), ...headerContent, ...toCols(SYMBOLS.boxTR, bt)]);

  const descTone: Tone2 = cell.status === "running" ? "grey" : "greyDeep";
  const descContent = fitLeft([...toCols(" ", bt), ...toCols(marquee(cell.desc, Math.max(0, inner - 1), now), descTone)], inner, bt);
  const desc = colsToLine([...toCols(SYMBOLS.boxV, bt), ...descContent, ...toCols(SYMBOLS.boxV, bt)]);

  const raw: Col[][] = [];
  cell.steps.forEach((_step, i) => {
    raw.push(v2NodeRow(cell, i, inner, now));
    if (i < cell.steps.length - 1) raw.push(v2EdgeRow(cell, inner));
  });
  const body = Math.max(0, h - 3);
  const offset = Math.max(0, raw.length - body);
  const shown = raw.slice(offset, offset + body);

  const bottom = colsToLine([...toCols(SYMBOLS.boxBL, bt), ...toCols(SYMBOLS.edgeDash.repeat(inner), bt), ...toCols(SYMBOLS.boxBR, bt)]);

  const lines = [top, desc, ...shown.map((row) => colsToLine([...toCols(SYMBOLS.boxV, bt), ...row, ...toCols(SYMBOLS.boxV, bt)])), bottom];
  return lines.slice(0, Math.max(0, h));
};

/** Collapsed v2: `STRIP_W`-wide vertical strip — label, then each step name, then "+N" if it overflows `h - 1`. */
export const renderStrip = (cell: Cell, h: number): CellLine[] => {
  const failed = cell.status === "failed";
  const headTone: Tone2 = failed ? "red" : "greyDeep";
  const out: string[] = [`${failed ? SYMBOLS.failed : SYMBOLS.done} ${pad(fit(cell.label, STRIP_W - 2), STRIP_W - 2)}`];
  const tones: Tone2[] = [headTone];
  const names = cell.steps.map((s) => s.name);
  const room = h - 1;
  const shown = names.length > room ? names.slice(0, Math.max(0, room - 1)) : names;
  for (const n of shown) {
    out.push(`  ${pad(fit(n, STRIP_W - 2), STRIP_W - 2)}`);
    tones.push("greyDeep");
  }
  if (names.length > room) {
    out.push(`+${names.length - shown.length}`);
    tones.push("greyDeep");
  }
  while (out.length < h) {
    out.push(" ".repeat(STRIP_W));
    tones.push("greyDeep");
  }
  return out.slice(0, h).map((line, i) => ({ spans: [{ text: pad(line, STRIP_W), tone: tones[i]! }] }));
};

/** Independent of `renderCell`: main history's merged row (DESIGN §2.6260 "main 歷史合併"). Always a completed-looking row. */
export const renderMainHistory = (count: number, recentDesc: string, w: number): CellLine => {
  const prefix = `✓ ${count} turns · `;
  const remaining = Math.max(0, w - displayWidth(prefix));
  return { spans: [{ text: prefix + fit(recentDesc, remaining), tone: "greyDeep" }] };
};

/**
 * Static layout for a cell in one of the three styles. `frame` only drives
 * the running-cell spinner glyph; `cam` is accepted for the ticket-15
 * signature but this ticket always hard-locks it to the settled target
 * (see file header) instead of easing toward it.
 */
export const renderCell = (
  cell: Cell,
  style: "v1" | "v2" | "v4",
  w: number,
  h: number,
  now: number,
  frame: number,
  cam: CameraState,
): { lines: CellLine[]; cam: CameraState } => {
  if (style === "v1") {
    const stripW = cell.steps.length * NODE_W + Math.max(0, cell.steps.length - 1) * EDGE_W;
    return { lines: renderV1(cell, w, h, now, frame), cam: { offset: Math.max(0, stripW - w) } };
  }
  if (style === "v4") {
    const header = colsToLine(headerCols(cell, w, now, frame));
    if (isCollapsed(cell, now)) return { lines: [header], cam: { offset: 0 } };
    let chain: Col[] = toCols(" ", "greyDeep");
    cell.steps.forEach((step, i) => {
      const { symbol, symbolTone, nameTone } = nodeGlyph(cell, i);
      chain = [...chain, ...toCols(symbol, symbolTone), ...toCols(` ${step.name}`, nameTone)];
      if (i < cell.steps.length - 1) chain = [...chain, ...toCols(` ${SYMBOLS.edgeDash}${SYMBOLS.edgeArrow} `, edgeTone(cell))];
    });
    const line2 = colsToLine(fitLeft(windowRight(chain, w), w, "greyDeep"));
    const chainW = colsWidth(chain);
    return { lines: [header, line2].slice(0, Math.max(0, h)), cam: { offset: Math.max(0, chainW - w) } };
  }
  return { lines: renderV2Layout(cell, w, h, now, frame), cam };
};

