// Ticket 06: hit testing for the band (pure). SDD §1.5.
// No `claude-code` import, no `$`.

import { MIN_COLUMNS } from "./layout";
import type { PanelLine } from "./panel";

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
