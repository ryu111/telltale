// Ticket 31: the click state ticket 17 stores (`cell.collapsed`, `agents.expanded.<sid>`) must
// actually change what `renderCell` draws, and reach the Client. SDD §2.8 "cell 展開／收合真的畫". Exact.
import { expect, test } from "bun:test";
import { clientOf, fakeEngine } from "./harness";
import {
  COLLAPSE_AFTER_MS,
  EXPANDED_MS,
  MAIN_HISTORY_EXPAND,
  MAIN_HISTORY_ID,
  isCollapsed,
  renderCell,
  renderMainHistory,
  renderStrip,
  type Cell,
  type Expanded,
} from "../../plugins/telltale/hooks/cells";
import { makeRegister } from "../../plugins/telltale/hooks/register";
import { agents } from "../../plugins/telltale/hooks/panels/agents";
import type { BandProps } from "../../plugins/telltale/hooks/hit";

const NOW = 100_000;
const running: Cell = {
  id: "r1",
  kind: "sub",
  label: "Explore",
  desc: "find the thing",
  status: "running",
  firstAt: NOW - 5_000,
  updatedAt: NOW - 5_000,
  steps: [
    { name: "prompt", t0: NOW - 5_000, t1: NOW - 4_900 },
    { name: "Read", t0: NOW - 4_000, t1: NOW - 3_900 },
    { name: "Grep", t0: NOW - 3_000, t1: NOW - 2_900 },
  ],
};
const done: Cell = {
  ...running,
  id: "d1",
  status: "completed",
  endAt: NOW - COLLAPSE_AFTER_MS - 1_000, // collapsed by time
  updatedAt: NOW - COLLAPSE_AFTER_MS - 1_000,
};
const history: Cell = {
  id: MAIN_HISTORY_ID,
  kind: "main",
  label: "main",
  desc: "turn five",
  status: "completed",
  firstAt: NOW - 60_000,
  endAt: NOW - 10_000,
  updatedAt: NOW - 10_000,
  steps: [1, 2, 3, 4, 5].map((n) => ({ name: "turn", detail: `turn ${["one", "two", "three", "four", "five"][n - 1]}`, t0: NOW - 60_000 + n * 1_000, t1: NOW - 60_000 + n * 1_000 + 500 })),
};
const text = (lines: { spans: { text: string }[] }[]): string[] => lines.map((l) => l.spans.map((s) => s.text).join(""));

// ── isCollapsed with click state ──

test("isCollapsed: a running cell the user collapsed is collapsed; toggling back reopens it", () => {
  expect(isCollapsed(running, NOW)).toBe(false);
  expect(isCollapsed({ ...running, collapsed: true }, NOW)).toBe(true);
});

test("isCollapsed: a completed cell past COLLAPSE_AFTER_MS reopens while `expanded` names it and is younger than EXPANDED_MS", () => {
  expect(isCollapsed(done, NOW)).toBe(true);
  const fresh: Expanded = { id: "d1", at: NOW - 1 };
  expect(isCollapsed(done, NOW, fresh)).toBe(false);
  expect(isCollapsed(done, NOW, { id: "d1", at: NOW - EXPANDED_MS })).toBe(true); // expired, exact boundary
  expect(isCollapsed(done, NOW, { id: "other", at: NOW - 1 })).toBe(true); // someone else
  expect(isCollapsed(done, NOW, null)).toBe(true);
});

test("EXPANDED_MS is the single 10 s constant, exported from cells.ts", () => {
  expect(EXPANDED_MS).toBe(10_000);
  expect(MAIN_HISTORY_EXPAND).toBe(3);
});

// ── renderCell honours it in all three styles ──

test("renderCell: a user-collapsed running cell draws only its header in v1/v4 and the strip in v2", () => {
  const c = { ...running, collapsed: true as const };
  expect(renderCell(c, "v1", 80, 4, NOW, 0, { offset: 0 }).lines).toHaveLength(1);
  expect(renderCell(c, "v4", 80, 2, NOW, 0, { offset: 0 }).lines).toHaveLength(1);
  expect(renderCell(c, "v2", 40, 8, NOW, 0, { offset: 0 }).lines).toEqual(renderStrip(c, 8));
  expect(renderStrip(c, 8)).toHaveLength(1 + c.steps.length); // head + one row per step, no blank padding to h (ticket 31: a padded strip would eat the whole panel when cells stack)
  // and without the flag the same cell draws its chain
  expect(renderCell(running, "v1", 80, 4, NOW, 0, { offset: 0 }).lines.length).toBeGreaterThan(1);
  expect(renderCell(running, "v4", 80, 2, NOW, 0, { offset: 0 }).lines).toHaveLength(2);
  expect(renderCell(running, "v2", 40, 8, NOW, 0, { offset: 0 }).lines.length).toBeGreaterThan(1);
});

test("renderCell: a time-collapsed completed cell reopens for a fresh `expanded`, in all three styles", () => {
  const fresh: Expanded = { id: "d1", at: NOW - 1 };
  for (const [style, w, h] of [["v1", 80, 4], ["v4", 80, 2], ["v2", 40, 8]] as const) {
    const collapsed = renderCell(done, style, w, h, NOW, 0, { offset: 0 }).lines;
    const reopened = renderCell(done, style, w, h, NOW, 0, { offset: 0 }, fresh).lines;
    expect(reopened.length).toBeGreaterThan(collapsed.length);
    expect(renderCell(done, style, w, h, NOW, 0, { offset: 0 }, { id: "d1", at: NOW - EXPANDED_MS }).lines).toEqual(collapsed);
  }
});

// ── main history: click shows the last three turns ──

test("renderCell: the merged main-history row expands to its last MAIN_HISTORY_EXPAND turns for a fresh `expanded`, clipped to h", () => {
  const w = 80;
  const one = renderCell(history, "v1", w, 6, NOW, 0, { offset: 0 }).lines;
  expect(one).toEqual([renderMainHistory(5, "turn five", w)]);

  const open = renderCell(history, "v1", w, 6, NOW, 0, { offset: 0 }, { id: MAIN_HISTORY_ID, at: NOW - 1 }).lines;
  expect(open).toHaveLength(1 + MAIN_HISTORY_EXPAND);
  expect(open[0]).toEqual(renderMainHistory(5, "turn five", w));
  const body = text(open.slice(1));
  expect(body[0]).toContain("turn three");
  expect(body[1]).toContain("turn four");
  expect(body[2]).toContain("turn five");
  for (const line of body) expect(line.startsWith("  ")).toBe(true); // indented under the merged row

  // same in v2 and v4 (the history row is never a node chain, ticket 21)
  expect(renderCell(history, "v2", w, 6, NOW, 0, { offset: 0 }, { id: MAIN_HISTORY_ID, at: NOW - 1 }).lines).toEqual(open);
  expect(renderCell(history, "v4", w, 6, NOW, 0, { offset: 0 }, { id: MAIN_HISTORY_ID, at: NOW - 1 }).lines).toEqual(open);
  // clipped to h, merged row first
  expect(renderCell(history, "v1", w, 2, NOW, 0, { offset: 0 }, { id: MAIN_HISTORY_ID, at: NOW - 1 }).lines).toEqual(open.slice(0, 2));
  // expired → back to one row
  expect(renderCell(history, "v1", w, 6, NOW, 0, { offset: 0 }, { id: MAIN_HISTORY_ID, at: NOW - EXPANDED_MS }).lines).toEqual(one);
});

// ── the Client actually receives `expanded` ──

test("buildBandProps: the agents BandPanel carries `expanded` straight from agents.expanded.<sid>", async () => {
  const expanded: Expanded = { id: "d1", at: NOW - 1 };
  const eng = fakeEngine({
    store: {
      panels: { agents: true },
      "size.agents": "full",
      "edge.agents": "bottom",
    },
  });
  eng.env = { TELLTALE_DEV: "1" };
  makeRegister([agents])(eng.on, {});
  await eng.fire("session.start", {});
  // seeded after session.start: ticket 21 resets this session's agents.cells.<sid> to {} on start
  eng.store["agents.cells.s1"] = { d1: done };
  eng.store["agents.expanded.s1"] = expanded;
  const tree = await eng.fire("ui.render", {
    surface: "terminal",
    component: "AbovePrompt",
    requestId: "r1",
    viewport: { columns: 100, rows: 40 },
    props: { hasSurvey: false, isWorking: false, maxRows: 14, scroll: { offset: 0, bodyRows: 13 } },
  });
  const panel = (clientOf(tree)!.props.props as BandProps).panels.find((p) => p.id === "agents") as unknown as { cells: Cell[]; expanded: Expanded };
  expect(panel.cells.map((c) => c.id)).toEqual(["d1"]);
  expect(panel.expanded).toEqual(expanded);

  // nothing stored → null, not undefined (the engine rejects undefined props)
  const bare = fakeEngine({ store: { panels: { agents: true }, "edge.agents": "bottom" } });
  bare.env = { TELLTALE_DEV: "1" };
  makeRegister([agents])(bare.on, {});
  await bare.fire("session.start", {});
  bare.store["agents.cells.s1"] = { d1: done };
  const tree2 = await bare.fire("ui.render", {
    surface: "terminal",
    component: "AbovePrompt",
    requestId: "r2",
    viewport: { columns: 100, rows: 40 },
    props: { hasSurvey: false, isWorking: false, maxRows: 14, scroll: { offset: 0, bodyRows: 13 } },
  });
  const panel2 = (clientOf(tree2)!.props.props as BandProps).panels.find((p) => p.id === "agents") as unknown as { expanded: Expanded };
  expect(panel2.expanded).toBeNull();
});
