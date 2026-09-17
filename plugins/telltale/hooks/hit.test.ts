// Ticket 06: hit testing for the band (pure). SDD §1.5. Exact match.
// Band() itself runs on the drawing thread and has no automated test; tmux covers it (ticket text).
import { expect, test } from "bun:test";
import { TITLE_RESERVE, hitPanel, isClick, rowsOf } from "./hit";
import { MIN_COLUMNS } from "./layout";
import type { BandProps } from "./register";

const P = (id: string, rows: number) => ({
  id,
  label: id,
  rows,
  lines: Array.from({ length: rows }, () => ({ text: id })),
  at: null,
  error: null,
});
const props = (panels: ReturnType<typeof P>[]): BandProps => ({
  columnsHint: 80,
  total: 2 + panels.reduce((n, p) => n + 1 + p.rows, 0),
  panels,
  dropped: [],
  now: 0,
});
const two = props([P("hello", 2), P("clock", 1)]); // rows: 0 title, 1 hello-title, 2-3 hello, 4 clock-title, 5 clock, 6 status

test("TITLE_RESERVE is 4 (3 covered by the engine's [-] plus 1 buffer)", () => {
  expect(TITLE_RESERVE).toBe(4);
});

test("rowsOf: title rows follow from each panel's rows", () => {
  expect(rowsOf(two)).toEqual({ hello: 1, clock: 4 });
  expect(rowsOf(props([]))).toEqual({});
});

test("hitPanel: a panel's title row hits that panel", () => {
  expect(hitPanel(1, 0, two, 80)).toBe("hello");
  expect(hitPanel(4, 10, two, 80)).toBe("clock");
});

test("hitPanel: band title, content rows and status row hit nothing", () => {
  expect(hitPanel(0, 0, two, 80)).toBeNull();
  expect(hitPanel(2, 0, two, 80)).toBeNull();
  expect(hitPanel(3, 0, two, 80)).toBeNull();
  expect(hitPanel(5, 0, two, 80)).toBeNull();
  expect(hitPanel(6, 0, two, 80)).toBeNull();
  expect(hitPanel(-1, 0, two, 80)).toBeNull();
  expect(hitPanel(99, 0, two, 80)).toBeNull();
});

test("hitPanel: the last TITLE_RESERVE columns are a dead zone", () => {
  expect(hitPanel(1, 80 - TITLE_RESERVE, two, 80)).toBeNull();
  expect(hitPanel(1, 80 - TITLE_RESERVE - 1, two, 80)).toBe("hello");
  expect(hitPanel(1, -1, two, 80)).toBeNull();
});

test("hitPanel: collapsed band (total 1) or too-narrow columns hit nothing", () => {
  expect(hitPanel(1, 0, { ...two, total: 1 }, 80)).toBeNull();
  expect(hitPanel(1, 0, two, MIN_COLUMNS - 1)).toBeNull();
  expect(hitPanel(1, 0, two, MIN_COLUMNS)).toBe("hello");
});

test("isClick: down then up on the same cell, nothing else", () => {
  expect(isClick({ x: 3, y: 1 }, { type: "up", x: 3, y: 1 })).toBe(true);
  expect(isClick({ x: 3, y: 1 }, { type: "up", x: 4, y: 1 })).toBe(false);
  expect(isClick({ x: 3, y: 1 }, { type: "move", x: 3, y: 1 })).toBe(false);
  expect(isClick(null, { type: "up", x: 3, y: 1 })).toBe(false);
});
