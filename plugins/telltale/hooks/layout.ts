// layout(): pure function, framework core. SDD §1.2. Only decides row counts — never touches columns.

export const BAND_ROWS_MAX = 9; // sole source of truth; title 1 + content + status 1
export const TITLE_ROWS = 1; // the band's own title row — always drawn
export const STATUS_ROWS = 1; // the status row — only drawn when there's something to say (ticket 23)
export const FIXED_ROWS = TITLE_ROWS + STATUS_ROWS; // fixed rows when the status row is showing (existing name kept)
export const CONTENT_ROWS_MAX = BAND_ROWS_MAX - TITLE_ROWS; // derived: how many rows are left for panels when there's no status row
export const MIN_COLUMNS = 20; // narrower than this: whole band draws as a single row (§1.5)
export const PANEL_TITLE_ROWS = 1; // every drawn panel spends one row on its `─ label ─` title (§1.5)

export type Want = { id: string; minRows: number; wantRows: number };
export type Slot = { id: string; rows: number };
export type Layout = { slots: Slot[]; dropped: string[]; total: number; status: boolean };

// SDD §1.2 rule 8 (v0.2, stages): a panel may declare `stages` (the shape a
// panel author writes; the values themselves don't feed the mapping below —
// they only mark "this panel supports stages").
export type Stage = "summary" | "compact" | "full";
export type Stages = { summary: 0; compact: number; full: "rest" };
export const STAGE_ORDER: readonly Stage[] = ["summary", "compact", "full"];
export const nextStage = (stage: Stage): Stage =>
  STAGE_ORDER[(STAGE_ORDER.indexOf(stage) + 1) % STAGE_ORDER.length]!;
export const rowsForStage = (stage: Stage): { minRows: number; wantRows: number } => {
  switch (stage) {
    case "summary":
      return { minRows: 0, wantRows: 0 };
    case "compact":
      return { minRows: 2, wantRows: 3 };
    case "full":
      return { minRows: 3, wantRows: CONTENT_ROWS_MAX };
  }
};

// Rules 1–4 + 6, parameterized by how many fixed rows (title, or title+status)
// are reserved this pass — `layout` runs this once or twice (see below) with
// only that number differing.
const computeWithFixed = (
  panels: readonly Want[],
  maxRows: number,
  fixed: number,
): { slots: Slot[]; dropped: string[]; total: number } => {
  // Rule 1: budget is computed once — a constant, never re-judged as rows get allocated.
  const budget = Math.min(maxRows, BAND_ROWS_MAX) - fixed;

  if (budget < 1) {
    // Rule 2: everything is dropped whole; only the fixed rows remain (collapsed to 1 if maxRows <= fixed).
    return {
      slots: [],
      dropped: panels.map((p) => p.id),
      total: Math.max(1, Math.min(maxRows, fixed)),
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
  const total = fixed + slots.reduce((n, s) => n + PANEL_TITLE_ROWS + s.rows, 0);
  return { slots, dropped, total };
};

// SDD §1.2 (ticket 23, "有事才出現"): the status row only exists when there's
// something to report — a panel got dropped for height, or a panel is
// erroring (`opts.status`, which the framework passes when it already knows
// about an error rows/layout itself can't see). `opts.status === true` forces
// it on outright. Otherwise this runs the same rules 1–6 twice at most: once
// assuming no status row (fixed = TITLE_ROWS), and — only if that pass
// actually dropped something — again with the status row's row reserved
// (fixed = FIXED_ROWS), since dropping needs the status row to say what got
// dropped.
export const layout = (panels: readonly Want[], maxRows: number, opts?: { status?: boolean }): Layout => {
  if (panels.length === 0) {
    return { slots: [], dropped: [], total: 1, status: false };
  }

  if (opts?.status === true) {
    const r = computeWithFixed(panels, maxRows, FIXED_ROWS);
    return { ...r, status: true };
  }

  const first = computeWithFixed(panels, maxRows, TITLE_ROWS);
  if (first.dropped.length === 0) {
    return { ...first, status: false };
  }

  const second = computeWithFixed(panels, maxRows, FIXED_ROWS);
  return { ...second, status: true };
};
