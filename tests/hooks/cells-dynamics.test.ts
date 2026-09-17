// Ticket 15: cells.ts dynamics (packet, curIx, birth, breathe, camera, slide). SDD I18 (v0.2).
// Evaluation: exact + property. All functions are pure over (cell, now/frame) — no real clock.
import { expect, test } from "bun:test";
import {
  BREATHE_MS,
  CAMERA_GAIN,
  CAMERA_MARGIN,
  EDGE_W,
  FLASH_MS,
  NODE_W,
  SLIDE_MS,
  TRANSIT_MS,
  type Cell,
} from "../../plugins/telltale/hooks/cells";
import {
  cameraTarget,
  curIx,
  easeCamera,
  isBreathing,
  isFlashing,
  packetAt,
  renderCell,
  slideOffset,
  typewriterProgress,
} from "../../plugins/telltale/hooks/cells";

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

// A running cell whose newest step ("Edit") arrives at t0=1000; still in transit until 1000+TRANSIT_MS.
const arriving = (t0: number): Cell => ({
  id: "r1",
  kind: "main",
  label: "main",
  desc: "work",
  status: "running",
  firstAt: 0,
  updatedAt: t0,
  steps: [
    { name: "prompt", t0: 0, t1: 200 },
    { name: "Bash", t0: 200, t1: t0 },
    { name: "Edit", t0 },
  ],
});

// ── curIx ──
test("curIx: before the transit window ends, the previous node is still current", () => {
  const c = arriving(1000);
  expect(curIx(c, 1000)).toBe(1); // "Bash" (index 1), not "Edit" (index 2) yet
  expect(curIx(c, 1000 + TRANSIT_MS - 1)).toBe(1);
});

test("curIx: once the transit window ends, the new node is current", () => {
  const c = arriving(1000);
  expect(curIx(c, 1000 + TRANSIT_MS)).toBe(2);
  expect(curIx(c, 1000 + TRANSIT_MS + 5000)).toBe(2);
});

test("curIx: a completed cell's current node is always the last one", () => {
  const c: Cell = { ...arriving(1000), status: "completed", endAt: 2000 };
  expect(curIx(c, 2000)).toBe(2);
});

// ── packetAt ──
test("packetAt: null before arrival begins is moot — null once arrived, non-null strictly inside the window", () => {
  const c = arriving(1000);
  expect(packetAt(c, EDGE_W, 1000)).not.toBeNull();
  expect(packetAt(c, EDGE_W, 1000 + TRANSIT_MS - 1)).not.toBeNull();
  expect(packetAt(c, EDGE_W, 1000 + TRANSIT_MS)).toBeNull(); // arrived: packet gone, node lit instead
});

test("packetAt: a cell with only one step (no edge yet) never has a packet", () => {
  const c: Cell = { ...arriving(1000), steps: [{ name: "prompt", t0: 0 }] };
  expect(packetAt(c, EDGE_W, 0)).toBeNull();
});

test("packetAt: a completed cell (nothing in transit) never has a packet", () => {
  const c: Cell = { ...arriving(1000), status: "completed", endAt: 2000 };
  expect(packetAt(c, EDGE_W, 1000)).toBeNull();
});

// ── I18 property: at most one line has a packet, and only the last edge; position moves within the window ──
test("property (I18): packetAt is non-null iff the cell is in-transit on its last edge", () => {
  const rand = mulberry32(20260917);
  for (let trial = 0; trial < 50; trial++) {
    const t0 = Math.floor(rand() * 5000);
    const c = arriving(t0);
    const now = Math.floor(rand() * (t0 + TRANSIT_MS * 3));
    const packet = packetAt(c, EDGE_W, now);
    const inTransit = now >= t0 && now < t0 + TRANSIT_MS;
    expect(packet !== null).toBe(inTransit);
    if (inTransit) expect(curIx(c, now)).toBe(c.steps.length - 2);
  }
});

test("property (I18): two different `now` inside the same TRANSIT_MS window give different packet positions", () => {
  const rand = mulberry32(7);
  for (let trial = 0; trial < 30; trial++) {
    const t0 = Math.floor(rand() * 5000);
    const c = arriving(t0);
    const a = packetAt(c, EDGE_W, t0);
    const b = packetAt(c, EDGE_W, t0 + TRANSIT_MS - 1);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a).not.toBe(b);
  }
});

test("property (I18): after arrival, the previous node's name renders greyDim (running cell, DESIGN §2)", () => {
  const rand = mulberry32(99);
  for (let trial = 0; trial < 15; trial++) {
    const t0 = 1000 + Math.floor(rand() * 3000);
    const c = arriving(t0);
    const now = t0 + TRANSIT_MS + 10; // just after arrival
    const { lines } = renderCell(c, "v1", 60, 12, now, 0, { offset: 0 });
    const allTones = lines.flatMap((l) => l.spans.map((s) => s.tone));
    expect(allTones).toContain("greyDim");
  }
});

// ── cameraTarget / easeCamera ──
test("cameraTarget: strip narrower than w needs no scroll", () => {
  expect(cameraTarget(NODE_W * 2, 200)).toBe(0);
});

test("cameraTarget: strip wider than w scrolls to keep CAMERA_MARGIN of breathing room past the newest node", () => {
  const stripW = NODE_W * 10;
  const w = 80;
  expect(cameraTarget(stripW, w)).toBe(Math.max(0, stripW - w + CAMERA_MARGIN));
});

test("easeCamera: converges toward target by CAMERA_GAIN per step, snaps within 1", () => {
  let cur = 0;
  const target = 100;
  const first = easeCamera(cur, target);
  expect(first).toBeCloseTo(target * CAMERA_GAIN, 5);
  cur = first;
  for (let i = 0; i < 200; i++) cur = easeCamera(cur, target);
  expect(cur).toBe(target); // snapped once within 1
});

test("easeCamera: already at target stays put", () => {
  expect(easeCamera(50, 50)).toBe(50);
});

// ── typewriterProgress / isBreathing / isFlashing / slideOffset ──
test("typewriterProgress: 0 right at arrival, 1 once BIRTH_MS has passed since arrival", () => {
  const t0 = 1000;
  expect(typewriterProgress(t0, t0 + TRANSIT_MS)).toBe(0);
  expect(typewriterProgress(t0, t0 + TRANSIT_MS - 1)).toBe(0); // still in transit: clamped at 0, not negative
  const BIRTH_MS = 400;
  expect(typewriterProgress(t0, t0 + TRANSIT_MS + BIRTH_MS)).toBe(1);
  expect(typewriterProgress(t0, t0 + TRANSIT_MS + BIRTH_MS + 10_000)).toBe(1);
});

test("isBreathing: toggles every BREATHE_MS", () => {
  expect(isBreathing(0)).toBe(true);
  expect(isBreathing(BREATHE_MS - 1)).toBe(true);
  expect(isBreathing(BREATHE_MS)).toBe(false);
  expect(isBreathing(BREATHE_MS * 2)).toBe(true);
});

test("isFlashing: true for FLASH_MS after cell.updatedAt, false after", () => {
  const c: Cell = { ...arriving(1000), updatedAt: 5000 };
  expect(isFlashing(c, 5000)).toBe(true);
  expect(isFlashing(c, 5000 + FLASH_MS - 1)).toBe(true);
  expect(isFlashing(c, 5000 + FLASH_MS)).toBe(false);
});

test("slideOffset: full offset at birth, zero once SLIDE_MS has passed", () => {
  expect(slideOffset(0, 0)).toBe(NODE_W + 2);
  expect(slideOffset(0, SLIDE_MS)).toBe(0);
  expect(slideOffset(0, SLIDE_MS * 2)).toBe(0);
});

test.todo("renderCell v1/v4: current node box grows 3 -> NODE_W columns over BIRTH_MS after arrival (typewriterProgress wired in)");
test.todo("renderCell: current node uses \"currentFailed\" tone when cell.status === \"failed\"");
test.todo("renderCell v2: vertical camera is hard-locked (no easeCamera call), newest row always last");
