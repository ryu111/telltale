// Ticket 03: layout(). SDD §1.2 rules 1–7, invariants I2/I3. Evaluation: exact match.
import { expect, test } from "bun:test";
import { BAND_ROWS_MAX, CONTENT_ROWS_MAX, FIXED_ROWS, MIN_COLUMNS, PANEL_TITLE_ROWS, layout } from "./layout";

const P = (id: string, minRows: number, wantRows: number) => ({ id, minRows, wantRows });

test("constants: one source of truth", () => {
  expect(BAND_ROWS_MAX).toBe(9);
  expect(FIXED_ROWS).toBe(2);
  expect(CONTENT_ROWS_MAX).toBe(BAND_ROWS_MAX - FIXED_ROWS);
  expect(MIN_COLUMNS).toBe(20);
  expect(PANEL_TITLE_ROWS).toBe(1);
});

test("rule 1/5: total never exceeds min(maxRows, BAND_ROWS_MAX)", () => {
  const tall = layout([P("a", 1, 9), P("b", 1, 9)], 40);
  expect(tall.total).toBe(BAND_ROWS_MAX);
  // content rows + one title row per drawn panel fill the content budget exactly
  expect(tall.slots.reduce((n, s) => n + PANEL_TITLE_ROWS + s.rows, 0)).toBe(CONTENT_ROWS_MAX);
  const short = layout([P("a", 1, 9)], 5);
  expect(short.total).toBe(5);
});

test("rule 3: a panel that cannot get minRows is dropped whole, never half", () => {
  // a costs 1 title + 3 = 4 rows and fits exactly; b would need 4 more and is dropped whole
  const r = layout([P("a", 3, 3), P("b", 3, 3)], FIXED_ROWS + 4);
  expect(r.slots).toEqual([{ id: "a", rows: 3 }]);
  expect(r.dropped).toEqual(["b"]);
  expect(r.total).toBe(FIXED_ROWS + 1 + 3);
});

test("rule 3: a later, smaller panel still fits after an earlier drop", () => {
  const r = layout([P("big", 5, 5), P("small", 1, 1)], FIXED_ROWS + 2);
  expect(r.slots).toEqual([{ id: "small", rows: 1 }]);
  expect(r.dropped).toEqual(["big"]);
});

test("rule 1: budget is computed once, not re-judged per panel", () => {
  // budget 3: a takes 1 + 2 = 3 and leaves 0; b (needs 2) is dropped — not "budget < 1 → everything dropped"
  const r = layout([P("a", 2, 2), P("b", 1, 1)], FIXED_ROWS + 3);
  expect(r.slots).toEqual([{ id: "a", rows: 2 }]);
  expect(r.dropped).toEqual(["b"]);
  expect(r.total).toBe(FIXED_ROWS + 1 + 2);
});

test("rule 4: leftover rows top up to wantRows in order; slack is allowed", () => {
  // budget 6: first pass spends (1+1) + (1+1) = 4; the 2 left top up a to 2, then b to 2
  const r = layout([P("a", 1, 2), P("b", 1, 3)], FIXED_ROWS + 6);
  expect(r.slots).toEqual([
    { id: "a", rows: 2 },
    { id: "b", rows: 2 },
  ]);
  expect(r.total).toBe(FIXED_ROWS + (1 + 2) + (1 + 2));
  const slack = layout([P("a", 1, 1)], 40);
  expect(slack.total).toBe(FIXED_ROWS + 1 + 1);
});

test("rule 2: budget < 1 drops everything and keeps only the fixed rows", () => {
  const r = layout([P("a", 1, 1), P("b", 1, 1)], FIXED_ROWS);
  expect(r.slots).toEqual([]);
  expect(r.dropped).toEqual(["a", "b"]);
  expect(r.total).toBe(FIXED_ROWS);
});

test("rule 2: maxRows 1 or 0 collapses to a single row", () => {
  expect(layout([P("a", 1, 1)], 1).total).toBe(1);
  expect(layout([P("a", 1, 1)], 0).total).toBe(1);
  expect(layout([P("a", 1, 1)], 0).dropped).toEqual(["a"]);
});

test("no panels wanted: one row, nothing dropped", () => {
  expect(layout([], 40)).toEqual({ slots: [], dropped: [], total: 1 });
});

test("rule 6: deterministic, order-preserving", () => {
  const w = [P("z", 1, 1), P("a", 1, 1), P("m", 9, 9)];
  expect(layout(w, 40)).toEqual(layout(w, 40));
  expect(layout(w, 40).slots.map((s) => s.id)).toEqual(["z", "a"]);
  expect(layout(w, 40).dropped).toEqual(["m"]);
});

test("rule 5: every drawn panel costs its title row: total = FIXED + Σ(1 + rows)", () => {
  for (const maxRows of [3, 4, 5, 7, 9, 40]) {
    const r = layout([P("a", 1, 2), P("b", 1, 1)], maxRows);
    expect(r.total).toBe(FIXED_ROWS + r.slots.reduce((n, s) => n + PANEL_TITLE_ROWS + s.rows, 0));
  }
  // maxRows 3 → budget 1: not even one panel (title + 1) fits
  expect(layout([P("a", 1, 1)], 3)).toEqual({ slots: [], dropped: ["a"], total: FIXED_ROWS });
});

test("rule 2/5: every slot gets at least its minRows", () => {
  for (const maxRows of [0, 1, 2, 3, 4, 5, 9, 14, 40]) {
    const r = layout([P("a", 1, 2), P("b", 2, 3), P("c", 1, 1)], maxRows);
    for (const s of r.slots) {
      const want = [P("a", 1, 2), P("b", 2, 3), P("c", 1, 1)].find((p) => p.id === s.id)!;
      expect(s.rows).toBeGreaterThanOrEqual(want.minRows);
      expect(s.rows).toBeLessThanOrEqual(want.wantRows);
    }
    expect(r.total).toBeLessThanOrEqual(Math.max(1, Math.min(maxRows, BAND_ROWS_MAX)));
  }
});

test("layout.ts is pure: no imports at all (never claude-code, never $)", async () => {
  const src = await Bun.file(new URL("./layout.ts", import.meta.url)).text();
  expect(src).not.toMatch(/^\s*import\b/m);
  expect(src).not.toContain("claude-code");
});
