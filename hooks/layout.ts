// layout(): pure function, framework core. SDD §1.2. Only decides row counts — never touches columns.

export const BAND_ROWS_MAX = 9; // sole source of truth; title 1 + content + status 1
export const FIXED_ROWS = 2; // title row + status row
export const CONTENT_ROWS_MAX = BAND_ROWS_MAX - FIXED_ROWS; // derived, not a second literal
export const MIN_COLUMNS = 20; // narrower than this: whole band draws as a single row (§1.5)
export const PANEL_TITLE_ROWS = 1; // every drawn panel spends one row on its `─ label ─` title (§1.5)

export type Want = { id: string; minRows: number; wantRows: number };
export type Slot = { id: string; rows: number };
export type Layout = { slots: Slot[]; dropped: string[]; total: number };

export const layout = (panels: readonly Want[], maxRows: number): Layout => {
  if (panels.length === 0) {
    return { slots: [], dropped: [], total: 1 };
  }

  // Rule 1: budget is computed once — a constant, never re-judged as rows get allocated.
  const budget = Math.min(maxRows, BAND_ROWS_MAX) - FIXED_ROWS;

  if (budget < 1) {
    // Rule 2: everything is dropped whole; only the fixed rows remain (collapsed to 1 if maxRows <= 1).
    return {
      slots: [],
      dropped: panels.map((p) => p.id),
      total: Math.max(1, Math.min(maxRows, FIXED_ROWS)),
    };
  }

  // Rule 3: first pass — each panel claims its title row + minRows in input order, or is dropped whole (never half).
  const slots: Slot[] = [];
  const dropped: string[] = [];
  let remaining = budget;
  const wantRowsById = new Map<string, number>();
  for (const p of panels) {
    if (PANEL_TITLE_ROWS + p.minRows <= remaining) {
      slots.push({ id: p.id, rows: p.minRows });
      remaining -= PANEL_TITLE_ROWS + p.minRows;
      wantRowsById.set(p.id, p.wantRows);
    } else {
      dropped.push(p.id);
    }
  }

  // Rule 4: second pass — top up surviving slots toward wantRows, in order, until leftover runs out.
  for (const slot of slots) {
    if (remaining <= 0) break;
    const want = wantRowsById.get(slot.id) ?? slot.rows;
    const extra = Math.min(want - slot.rows, remaining);
    if (extra > 0) {
      slot.rows += extra;
      remaining -= extra;
    }
  }

  // Rule 5: total counts the fixed rows plus, per drawn panel, its title row and its content rows.
  const total = FIXED_ROWS + slots.reduce((n, s) => n + PANEL_TITLE_ROWS + s.rows, 0);
  return { slots, dropped, total };
};
