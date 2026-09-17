// Ticket 14: renderCell (v1/v2/v4 static layout). SDD §1.1a, §2.6260. Evaluation: exact + property.
import { expect, test } from "bun:test";
import {
  NODE_W,
  STRIP_W,
  SYMBOLS,
  isCollapsed,
  type Cell,
  type CellLine,
} from "../../plugins/telltale/hooks/cells";
import { renderCell, renderMainHistory, type CameraState, type Tone2 } from "../../plugins/telltale/hooks/cells";
import { displayWidth } from "../../plugins/telltale/hooks/width";

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

const text = (line: CellLine): string => line.spans.map((s) => s.text).join("");
const tones = (line: CellLine): Tone2[] => line.spans.map((s) => s.tone);
const NO_CAM: CameraState = { offset: 0 };

// The one hand-computable fixture: a single-step, finished, model-less cell.
// firstAt=0, endAt=500 -> formatElapsed(500) = "0s". No model chunk. `now` is
// chosen well inside the not-yet-collapsed window (500ms after endAt < COLLAPSE_AFTER_MS).
const fixture: Cell = {
  id: "c1",
  kind: "main",
  label: "main",
  desc: "hello",
  status: "completed",
  firstAt: 0,
  endAt: 500,
  updatedAt: 500,
  steps: [{ name: "prompt", t0: 0, t1: 500 }],
};
const NOW = 1000;

test("renderCell v1: header + 3-row box for a single settled step, w=30 (exact)", () => {
  const { lines } = renderCell(fixture, "v1", 30, 12, NOW, 0, NO_CAM);
  expect(lines).toHaveLength(4);
  expect(text(lines[0]!)).toBe("✓ main 0s · hello".padEnd(30));
  expect(text(lines[1]!)).toBe("┌──────────┐".padEnd(30));
  expect(text(lines[2]!)).toBe("│● prompt  │".padEnd(30));
  expect(text(lines[3]!)).toBe("└──────────┘".padEnd(30));
  // finished cell: every span on every line is greyDeep (DESIGN §3 "整個 cell 降到極暗灰")
  for (const line of lines) for (const tone of tones(line)) expect(tone).toBe("greyDeep");
});

test("renderCell v4: header + single chain line, w=30 (exact)", () => {
  const { lines } = renderCell(fixture, "v4", 30, 12, NOW, 0, NO_CAM);
  expect(lines).toHaveLength(2);
  expect(text(lines[0]!)).toBe("✓ main 0s · hello".padEnd(30));
  expect(text(lines[1]!).trimEnd()).toBe(" ● prompt");
  expect(displayWidth(text(lines[1]!))).toBeLessThanOrEqual(30);
});

test("renderCell v2: framed header + node row, w=20 h=5 (prefix exact; trailing pad is implementation's choice)", () => {
  const { lines } = renderCell(fixture, "v2", 20, 5, NOW, 0, NO_CAM);
  expect(lines.length).toBeLessThanOrEqual(5);
  expect(text(lines[0]!)).toStartWith("┌ ✓ main 0s");
  expect(text(lines[1]!)).toStartWith("│ hello");
  const nodeRow = lines.find((l) => text(l).includes("prompt"));
  expect(nodeRow).toBeDefined();
  expect(text(nodeRow!)).toContain("●");
  for (const line of lines) expect(displayWidth(text(line))).toBeLessThanOrEqual(20);
});

// ── collapsed forms: one test per style ──
test("renderCell v1: collapsed cell (completed, > COLLAPSE_AFTER_MS) is a single header line", () => {
  const done: Cell = { ...fixture, endAt: 0 };
  const now = 10_000; // well past COLLAPSE_AFTER_MS = 3000
  expect(isCollapsed(done, now)).toBe(true);
  const { lines } = renderCell(done, "v1", 30, 12, now, 0, NO_CAM);
  expect(lines).toHaveLength(1);
});

test("renderCell v4: collapsed cell is a single header line", () => {
  const done: Cell = { ...fixture, endAt: 0 };
  const { lines } = renderCell(done, "v4", 30, 12, 10_000, 0, NO_CAM);
  expect(lines).toHaveLength(1);
});

test("renderCell v2: collapsed cell renders as an 8-column strip (renderStrip)", () => {
  const done: Cell = { ...fixture, endAt: 0, steps: [{ name: "prompt", t0: 0, t1: 100 }, { name: "reply", t0: 100, t1: 200 }] };
  const { lines } = renderCell(done, "v2", 20, 6, 10_000, 0, NO_CAM);
  for (const line of lines) expect(displayWidth(text(line))).toBe(STRIP_W);
  expect(text(lines[0]!)).toContain("main");
});

// ── failed cells never auto-collapse (DESIGN §3 "留到點掉") ──
test("a failed cell is never collapsed, however old", () => {
  const failed: Cell = { ...fixture, status: "failed", endAt: 0 };
  expect(isCollapsed(failed, 10_000_000)).toBe(false);
  const { lines } = renderCell(failed, "v1", 30, 12, 10_000_000, 0, NO_CAM);
  expect(lines.length).toBeGreaterThan(1);
});

// ── renderMainHistory ──
test("renderMainHistory: exact merged-row text", () => {
  const line = renderMainHistory(4, "把 README 的 validate 區塊更新到 2.1.274", 40);
  expect(text(line)).toStartWith("✓ 4 turns · ");
  expect(displayWidth(text(line))).toBeLessThanOrEqual(40);
});

// ── symbol table: every character renderCell ever emits is accounted for ──
const SYMBOL_CHARS = new Set<string>([
  ...Object.values(SYMBOLS).flatMap((v) => (typeof v === "string" ? [...v] : [])),
]);
const isAscii = (ch: string): boolean => ch.codePointAt(0)! < 0x80;

const randomCell = (rand: () => number, id: string): Cell => {
  const NAME_POOL = ["think", "Read", "Bash make check", "Edit", "Grep", "reply", "Agent", "prompt", "寬 W 欄 · 高 R 列", "審查"];
  const stepCount = 1 + Math.floor(rand() * 64);
  const steps = Array.from({ length: stepCount }, (_, i) => ({
    name: NAME_POOL[Math.floor(rand() * NAME_POOL.length)]!,
    t0: i * 1000,
    t1: i * 1000 + 500,
  }));
  const status = (["running", "completed", "failed", "killed", "orphan"] as const)[Math.floor(rand() * 5)]!;
  return {
    id,
    kind: (["main", "sub", "bg"] as const)[Math.floor(rand() * 3)]!,
    label: NAME_POOL[Math.floor(rand() * NAME_POOL.length)]!,
    desc: NAME_POOL[Math.floor(rand() * NAME_POOL.length)]! + " " + NAME_POOL[Math.floor(rand() * NAME_POOL.length)]!,
    status,
    firstAt: 0,
    endAt: status === "running" ? undefined : (stepCount + 1) * 1000,
    updatedAt: stepCount * 1000,
    steps,
  };
};

test("property: every character renderCell emits is a SYMBOLS value, ASCII, or drawn from the cell's own text", () => {
  const rand = mulberry32(20260917);
  const allowedFromCell = (c: Cell): Set<string> =>
    new Set([...c.label, ...c.desc, ...(c.model ?? ""), ...c.steps.flatMap((s) => [...s.name, ...(s.detail ?? "")])]);
  for (let i = 0; i < 40; i++) {
    const cell = randomCell(rand, `c${i}`);
    const w = 20 + Math.floor(rand() * 180);
    const h = 2 + Math.floor(rand() * 38);
    const style = (["v1", "v2", "v4"] as const)[Math.floor(rand() * 3)]!;
    const allowed = allowedFromCell(cell);
    const { lines } = renderCell(cell, style, w, h, cell.updatedAt + 100_000, i, NO_CAM);
    for (const line of lines) {
      for (const ch of text(line)) {
        const ok = SYMBOL_CHARS.has(ch) || isAscii(ch) || allowed.has(ch);
        expect(ok).toBe(true);
      }
    }
  }
});

// ── property: I4 — displayWidth(line) <= w and lines.length <= h, for any cell/size/style ──
test("property: I4 — every rendered line fits w, every cell fits h (random cells, fixed seed)", () => {
  const rand = mulberry32(42);
  for (let i = 0; i < 60; i++) {
    const cell = randomCell(rand, `p${i}`);
    const w = 20 + Math.floor(rand() * 180);
    const h = 2 + Math.floor(rand() * 38);
    const style = (["v1", "v2", "v4"] as const)[Math.floor(rand() * 3)]!;
    const now = cell.updatedAt + 100_000; // settled: no in-flight transit/birth for this ticket's contract
    const { lines } = renderCell(cell, style, w, h, now, i, NO_CAM);
    expect(lines.length).toBeLessThanOrEqual(h);
    for (const line of lines) expect(displayWidth(text(line))).toBeLessThanOrEqual(w);
  }
});

// ── left for implementation + code-review to pin against the live docs/設計/試衣間.html reference ──
test.todo("v1 exact fixture: multi-step cell with a strip wider than w (camera hard-cut to newest node)");
test.todo("v2 exact fixture: node list taller than h (hard-locked scroll, newest row always last)");
test.todo("v4 exact fixture: chain wider than w (right-edge windowing)");
test.todo("running cell: current-node tones (\"current\" / \"currentFailed\") and walked-node symbol keeps kind-tone (DESIGN §2)");
