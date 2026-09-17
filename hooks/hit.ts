// Ticket 06: hit testing for the band (pure). SDD §1.5.
// No `claude-code` import, no `$`.

import { MIN_COLUMNS } from "./layout";
import type { BandProps } from "./register";

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
