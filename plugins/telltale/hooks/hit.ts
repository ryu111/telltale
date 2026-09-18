// Ticket 06: hit testing for the band (pure). SDD §1.5.
// No `claude-code` import, no `$`.

import { MIN_COLUMNS } from "./layout";
import type { Stage } from "./layout";
import type { PanelLine } from "./panel";
import { displayWidth } from "./width";

// SDD §1.5 defines these alongside `hooks/band.tsx`; the ticket's own
// "相關檔案" line says to import them from `./register`, but ticket 05 never
// exported them there (register.tsx has no `BandProps`/`BandPanel`; a plain
// `import type` from it is only silently fine because bun erases type-only
// imports without checking the target — `make check` has no `tsc` step to
// catch it). SDD wins on a ticket/SDD conflict (00-共同規則); defined here,
// pure, matching the SDD code block verbatim, and re-exported from band.tsx.
export type BandPanel = {
  id: string;
  label: string;
  rows: number;
  lines: PanelLine[];
  at: number | null;
  error: string | null;
  stages?: boolean; // NEW: does this panel support stages (summary/compact/full)?
  buttons?: TitleButtons; // ticket 24: only the agents panel carries this
};
export type BandProps = {
  columnsHint: number;
  total: number;
  panels: BandPanel[];
  dropped: string[];
  now: number;
  status: boolean; // ticket 23: whether the last row is the status row (dropped or a panel error)
};

// What kind of message a title click should post: staged panels cycle their
// stage, everything else just toggles on/off (SDD §1.5 v0.2 addition).
export const titleClickKind = (id: string, props: BandProps): "stage" | "toggle" =>
  props.panels.find((p) => p.id === id)?.stages ? "stage" : "toggle";

// The real engine draws a `[-]` collapse control over the rightmost 3 columns
// of a Client's title row; +1 column of buffer so a click just left of it
// still misses. Don't "fix" this to 3 — the buffer is intentional.
const ENGINE_CONTROL_COLUMNS = 3;
const BUFFER_COLUMNS = 1;
export const TITLE_RESERVE = ENGINE_CONTROL_COLUMNS + BUFFER_COLUMNS;

// Ticket 24 (SDD §2.8 "標題列按鍵"): the agents panel's title-row button
// strip. `edge` is only present once ticket 27 adds the `[R B RB]` group —
// this ticket's own panels never set it, so `buttonStrip` below only ever
// draws the style/size/clear groups for now, but the group is written
// generically so ticket 27 doesn't have to touch this function's shape.
export type TitleButtons = { style: "v1" | "v2" | "v4"; size: Stage; edge?: "right" | "bottom" | "both" };
export type ButtonMessage =
  | { kind: "style"; id: string; value: "v1" | "v2" | "v4" }
  | { kind: "size"; id: string; value: Stage }
  | { kind: "clear"; id: string }
  | { kind: "edge"; id: string; value: "right" | "bottom" | "both" };
// `x1` is inclusive — the button's own display column plus one buffer
// column to its right (a "1" occupies x, x+1; a "RB" occupies two columns
// plus one more) so a click just past a narrow glyph still registers.
export type ButtonSpan = { x0: number; x1: number; text: string; active: boolean; message: ButtonMessage };
export type ButtonStrip = { x0: number; text: string; spans: ButtonSpan[] };

const DASH = "─";

type ButtonDef = { text: string; message: ButtonMessage; active: boolean };

const styleGroup = (id: string, buttons: TitleButtons): ButtonDef[] => [
  { text: "1", message: { kind: "style", id, value: "v1" }, active: buttons.style === "v1" },
  { text: "2", message: { kind: "style", id, value: "v2" }, active: buttons.style === "v2" },
  { text: "3", message: { kind: "style", id, value: "v4" }, active: buttons.style === "v4" },
];

const sizeGroup = (id: string, buttons: TitleButtons): ButtonDef[] => [
  { text: "S", message: { kind: "size", id, value: "summary" }, active: buttons.size === "summary" },
  { text: "C", message: { kind: "size", id, value: "compact" }, active: buttons.size === "compact" },
  { text: "F", message: { kind: "size", id, value: "full" }, active: buttons.size === "full" },
];

const edgeGroup = (id: string, buttons: TitleButtons): ButtonDef[] => [
  { text: "R", message: { kind: "edge", id, value: "right" }, active: buttons.edge === "right" },
  { text: "B", message: { kind: "edge", id, value: "bottom" }, active: buttons.edge === "bottom" },
  { text: "RB", message: { kind: "edge", id, value: "both" }, active: buttons.edge === "both" },
];

const clearGroup = (id: string): ButtonDef[] => [{ text: "x", message: { kind: "clear", id }, active: false }];

// Sole coordinate source for both drawing (band.tsx) and hit-testing
// (resolveTitleClick below) — same rule `rowsOf` follows for panel title
// rows. Right-aligned so it always sits just left of the TITLE_RESERVE dead
// zone; returns null (not a truncated strip) when the whole thing can't fit
// next to the panel's own head text (SDD §2.8: "放不下整條就不畫，不畫半條").
export const buttonStrip = (id: string, buttons: TitleButtons, label: string, columns: number): ButtonStrip | null => {
  const groups: ButtonDef[][] = [styleGroup(id, buttons), sizeGroup(id, buttons)];
  if (buttons.edge !== undefined) groups.push(edgeGroup(id, buttons));
  groups.push(clearGroup(id));

  const text = groups.map((g) => `[${g.map((b) => b.text).join(" ")}]`).join(" ");
  const x1 = columns - TITLE_RESERVE - 1;
  const x0 = x1 - (displayWidth(text) - 1);

  const head = `${DASH} ${label} ${DASH}`;
  if (x0 < displayWidth(head) + 1) return null;

  const spans: ButtonSpan[] = [];
  let cursor = x0;
  for (const group of groups) {
    let offset = cursor + 1; // skip the group's opening "["
    for (const btn of group) {
      const w = displayWidth(btn.text);
      spans.push({ x0: offset, x1: offset + 1, text: btn.text, active: btn.active, message: btn.message });
      offset += w + 1; // the button text, then the following " " or "]"
    }
    cursor += displayWidth(`[${group.map((b) => b.text).join(" ")}]`) + 1; // +1: the space before the next group
  }

  return { x0, text, spans };
};

// Row 0 is the band's own title row. Each panel then takes one title row
// followed by `rows` content rows. This is the single source of truth for
// row positions — band.tsx must draw from this, not recompute it.
export const rowsOf = (props: BandProps): Record<string, number> => {
  const rows: Record<string, number> = {};
  let y = 1;
  for (const panel of props.panels) {
    rows[panel.id] = y;
    y += 1 + panel.rows;
  }
  return rows;
};

export const hitPanel = (y: number, x: number, props: BandProps, columns: number): string | null => {
  if (props.total <= 1) return null;
  if (columns < MIN_COLUMNS) return null;
  if (x < 0 || x >= columns - TITLE_RESERVE) return null;

  const rows = rowsOf(props);
  for (const [id, titleY] of Object.entries(rows)) {
    if (titleY === y) return id;
  }
  return null;
};

// Ticket 24 (SDD §2.8): what a click at (y, x) resolves to. A miss on
// `hitPanel` (band title, content rows, or the TITLE_RESERVE dead zone) is
// null; a hit inside a button span is that button's own message; any other
// hit on a title row falls back to the pre-existing rule (`titleClickKind`).
export type TitleClick = ButtonMessage | { kind: "stage" | "toggle"; id: string } | null;

export const resolveTitleClick = (y: number, x: number, props: BandProps, columns: number): TitleClick => {
  const id = hitPanel(y, x, props, columns);
  if (id === null) return null;

  const panel = props.panels.find((p) => p.id === id);
  if (panel?.buttons) {
    const strip = buttonStrip(id, panel.buttons, panel.label, columns);
    const span = strip?.spans.find((s) => x >= s.x0 && x <= s.x1);
    if (span) return span.message;
  }

  return { kind: titleClickKind(id, props), id };
};

export const isClick = (down: { x: number; y: number } | null, ev: { type: string; x: number; y: number }): boolean => {
  if (!down) return false;
  return ev.type === "up" && ev.x === down.x && ev.y === down.y;
};

// Ticket 16: which cell (of the `agents` panel's `kind: "cells"` view, once
// ticket 17 wires it up) a click at row `y` lands in — one entry per cell,
// `rows` is how many rows `band.tsx` gave that cell (its own title/border
// rows included). Rows outside every cell's span (padding, or a panel with
// no cells) return null.
export type CellRowSpan = { cellId: string; rows: number };

export const hitCell = (y: number, x: number, cellRowsStartY: number, spans: readonly CellRowSpan[], columns: number): string | null => {
  if (x < 0 || x >= columns || y < cellRowsStartY) return null;
  let cursor = cellRowsStartY;
  for (const span of spans) {
    if (y >= cursor && y < cursor + span.rows) return span.cellId;
    cursor += span.rows;
  }
  return null;
};
