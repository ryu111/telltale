// Ticket 10: hooks/cells.ts base pure functions. SDD §1.1a, §2.6260. Evaluation: exact + property.
// No `claude-code` import, no `$` — pure functions only.
import { expect, test } from "bun:test";
import {
  ORPHAN_MS,
  LONG_RUN_MS,
  MARQUEE_STEP_MS,
  STRIP_W,
  NODE_W,
  EDGE_W,
  SYMBOLS,
  TRANSIT_MS,
  BIRTH_MS,
  BREATHE_MS,
  SLIDE_MS,
  COLLAPSE_AFTER_MS,
  VANISH_AFTER_MS,
  FLASH_MS,
  CAMERA_MARGIN,
  CAMERA_GAIN,
  STEPS_MAX,
  compressSteps,
  fitCells,
  formatElapsed,
  isCollapsed,
  isVanished,
  marquee,
  sortCells,
  type Cell,
  type Step,
} from "../../plugins/telltale/hooks/cells";
import { displayWidth } from "../../plugins/telltale/hooks/width";

// ── tiny deterministic PRNG for property tests (no fast-check per 00-共同規則) ──
const mulberry32 = (seed: number) => {
  let a = seed;
  return (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const SEED = 20260917;

const cell = (over: Partial<Cell> = {}): Cell => ({
  id: "c1",
  kind: "main",
  label: "main",
  desc: "hello",
  status: "completed",
  firstAt: 0,
  endAt: 500,
  updatedAt: 500,
  steps: [{ name: "prompt", t0: 0, t1: 500 }],
  ...over,
});

// ── constants: sole source of truth (DESIGN §5) ──
test("time and layout constants match DESIGN §5 / §1", () => {
  expect(TRANSIT_MS).toBe(600);
  expect(BIRTH_MS).toBe(400);
  expect(BREATHE_MS).toBe(600);
  expect(SLIDE_MS).toBe(500);
  expect(COLLAPSE_AFTER_MS).toBe(3000);
  expect(VANISH_AFTER_MS).toBe(60_000);
  expect(FLASH_MS).toBe(1000);
  expect(CAMERA_MARGIN).toBe(28);
  expect(CAMERA_GAIN).toBe(0.25);
  expect(MARQUEE_STEP_MS).toBe(300);
  expect(STEPS_MAX).toBe(64);
  expect(LONG_RUN_MS).toBe(30 * 60 * 1000);
  expect(ORPHAN_MS).toBe(2 * 60 * 60 * 1000);
  expect(NODE_W).toBe(12);
  expect(EDGE_W).toBe(4);
  expect(STRIP_W).toBe(8);
});

test("SYMBOLS: every glyph used elsewhere in this suite comes from this table", () => {
  expect(SYMBOLS.walked).toBe("●");
  expect(SYMBOLS.current).toBe("◉");
  expect(SYMBOLS.failed).toBe("✗");
  expect(SYMBOLS.done).toBe("✓");
  expect(SYMBOLS.packet).toBe("◆");
  expect(SYMBOLS.spinner).toHaveLength(10);
});

// ── formatElapsed: the four literal examples ARE the spec ──
test("formatElapsed: 12s / 1m04 / 12m / 1h02", () => {
  expect(formatElapsed(12_000)).toBe("12s");
  expect(formatElapsed(64_000)).toBe("1m04");
  expect(formatElapsed(720_000)).toBe("12m");
  expect(formatElapsed(3_720_000)).toBe("1h02");
});

test("formatElapsed: negative or zero clamps to 0s", () => {
  expect(formatElapsed(-500)).toBe("0s");
  expect(formatElapsed(0)).toBe("0s");
});

// ── marquee: three cases (fits, scrolls, wide chars) ──
test("marquee: text that fits is padded, not scrolled", () => {
  expect(marquee("hi", 6, 0)).toBe("hi    ");
  expect(displayWidth(marquee("hi", 6, 12_345))).toBe(6);
});

test("marquee: text that overflows scrolls with now, same offset within one MARQUEE_STEP_MS window", () => {
  const long = "implement ticket 06 in a worktree";
  const base = 3 * MARQUEE_STEP_MS; // aligned to a step boundary: the window is [base, base + step)
  const a = marquee(long, 10, base);
  const b = marquee(long, 10, base + MARQUEE_STEP_MS - 1);
  expect(a).toBe(b);
  expect(displayWidth(a)).toBe(10);
});

test("marquee: overflow position changes once now crosses a MARQUEE_STEP_MS boundary", () => {
  const long = "implement ticket 06 in a worktree";
  const a = marquee(long, 10, 0);
  const b = marquee(long, 10, MARQUEE_STEP_MS);
  expect(a).not.toBe(b);
});

test("marquee: CJK text never splits a wide char across the window edge", () => {
  const zh = "寬 W 欄 · 高 R 列這是一段很長的中文說明文字";
  for (let now = 0; now < MARQUEE_STEP_MS * 8; now += MARQUEE_STEP_MS) {
    const out = marquee(zh, 9, now);
    expect(displayWidth(out)).toBe(9);
  }
});

// ── sortCells: running first, then firstAt, then id — property (I15) ──
test("sortCells: running-first / firstAt / id, exact case", () => {
  const cells = [
    cell({ id: "b", status: "completed", firstAt: 10 }),
    cell({ id: "a", status: "running", firstAt: 20, endAt: undefined }),
    cell({ id: "z", status: "running", firstAt: 5, endAt: undefined }),
  ];
  expect(sortCells(cells).map((c) => c.id)).toEqual(["z", "a", "b"]);
});

test("sortCells: property — any shuffle of the same set sorts identically (I15)", () => {
  const rand = mulberry32(SEED);
  const base: Cell[] = Array.from({ length: 12 }, (_, i) =>
    cell({
      id: `id${i % 4}-${i}`, // some collide on firstAt to exercise the id tiebreak
      status: rand() < 0.4 ? "running" : "completed",
      firstAt: Math.floor(rand() * 5), // small range: forces ties
      endAt: 1000,
    }),
  );
  const canonical = sortCells(base).map((c) => c.id);
  for (let trial = 0; trial < 50; trial++) {
    const shuffled = [...base];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    expect(sortCells(shuffled).map((c) => c.id)).toEqual(canonical);
  }
});

test("sortCells: does not mutate its input", () => {
  const cells = [cell({ id: "b" }), cell({ id: "a" })];
  const copy = [...cells];
  sortCells(cells);
  expect(cells).toEqual(copy);
});

// ── fitCells: budget is a cell COUNT, not rows/columns ──
test("fitCells: shown/hidden split by count after sorting", () => {
  const cells = [cell({ id: "a", firstAt: 0 }), cell({ id: "b", firstAt: 1 }), cell({ id: "c", firstAt: 2 })];
  const { shown, hidden } = fitCells(cells, 2);
  expect(shown.map((c) => c.id)).toEqual(["a", "b"]);
  expect(hidden.map((c) => c.id)).toEqual(["c"]);
});

test("fitCells: budget <= 0 hides everything", () => {
  const cells = [cell({ id: "a" })];
  expect(fitCells(cells, 0).shown).toEqual([]);
  expect(fitCells(cells, -1).hidden).toHaveLength(1);
});

// ── isCollapsed / isVanished: only `completed` cells auto-transition ──
test("isCollapsed: completed cell collapses only after COLLAPSE_AFTER_MS", () => {
  const c = cell({ status: "completed", endAt: 1000 });
  expect(isCollapsed(c, 1000 + COLLAPSE_AFTER_MS - 1)).toBe(false);
  expect(isCollapsed(c, 1000 + COLLAPSE_AFTER_MS + 1)).toBe(true);
});

test("isCollapsed: failed/killed/orphan never auto-collapse (stays until dismissed, DESIGN §3)", () => {
  for (const status of ["failed", "killed", "orphan"] as const) {
    const c = cell({ status, endAt: 0 });
    expect(isCollapsed(c, 10_000_000)).toBe(false);
  }
});

test("isVanished: completed cell vanishes only after VANISH_AFTER_MS, not before", () => {
  const c = cell({ status: "completed", endAt: 0 });
  expect(isVanished(c, VANISH_AFTER_MS - 1)).toBe(false);
  expect(isVanished(c, VANISH_AFTER_MS + 1)).toBe(true);
});

test("isVanished: running/failed cells never vanish via this function", () => {
  expect(isVanished(cell({ status: "running", endAt: undefined }), 10_000_000)).toBe(false);
  expect(isVanished(cell({ status: "failed", endAt: 0 }), 10_000_000)).toBe(false);
});

// ── compressSteps: storage-layer merge of the oldest steps once STEPS_MAX is exceeded ──
const step = (name: string, t0: number, t1?: number): Step => ({ name, t0, ...(t1 !== undefined ? { t1 } : {}) });

test("compressSteps: at or under STEPS_MAX, nothing changes", () => {
  const steps = Array.from({ length: STEPS_MAX }, (_, i) => step(`s${i}`, i));
  expect(compressSteps(steps)).toEqual(steps);
});

test("compressSteps: over STEPS_MAX, the oldest overflow merges into one \"… ×N\" step, total length STEPS_MAX", () => {
  const steps = Array.from({ length: STEPS_MAX + 5 }, (_, i) => step(`s${i}`, i, i + 1));
  const out = compressSteps(steps);
  expect(out).toHaveLength(STEPS_MAX);
  expect(out[0]!.name).toBe("… ×6"); // 6 oldest steps (s0..s5) merged so the remaining 63 newest + 1 merged = 64
  expect(out[0]!.t0).toBe(0); // oldest original t0
  expect(out[0]!.t1).toBe(6); // t1 of the last merged step (s5)
  expect(out[1]!.name).toBe("s6"); // newest-of-the-merged-away boundary: first untouched step
  expect(out[out.length - 1]!.name).toBe(`s${STEPS_MAX + 4}`);
});

test("compressSteps: re-compressing an already-merged head accumulates the count, not nested \"×N ×M\"", () => {
  const already = [step("… ×6", 0, 6), ...Array.from({ length: STEPS_MAX - 1 }, (_, i) => step(`t${i}`, 10 + i))];
  expect(already).toHaveLength(STEPS_MAX);
  const withOneMore = [...already, step("new", 9999)];
  const out = compressSteps(withOneMore);
  expect(out).toHaveLength(STEPS_MAX);
  expect(out[0]!.name).toBe("… ×7");
  expect(out[0]!.name).not.toContain("×6 ×");
});
