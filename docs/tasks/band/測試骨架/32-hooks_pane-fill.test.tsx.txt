// Ticket 32: the Pane uses the rows the engine gives it (`scroll.bodyRows`), `compact` really
// collapses every cell, and a sub cell `$.agent.list()` never named (a workflow's agent) completes
// after UNLISTED_IDLE_MS idle. SDD §2.8 "Pane 用滿、段位有感、沒列名的 sub 會收". Exact.
import { expect, test } from "bun:test";
import { clientOf, fakeEngine } from "./harness";
import { BAND_ROWS_MAX, CONTENT_ROWS_MAX, PANEL_TITLE_ROWS, TITLE_ROWS, layout, rowsForStage } from "../../plugins/telltale/hooks/layout";
import { MAIN_HISTORY_ID, isCollapsed, renderCell, renderMainHistory, type Cell } from "../../plugins/telltale/hooks/cells";
import { UNLISTED_IDLE_MS, agents } from "../../plugins/telltale/hooks/panels/agents";
import { makeRegister, register } from "../../plugins/telltale/hooks/register";
import { hello } from "../../plugins/telltale/hooks/panels/hello";
import type { BandProps } from "../../plugins/telltale/hooks/hit";

type Cells = Record<string, Cell>;
const P = (id: string, minRows: number, wantRows: number) => ({ id, minRows, wantRows });

// ── (a) layout cap ──

test("layout: `cap` replaces BAND_ROWS_MAX as the ceiling; left out, nothing changes", () => {
  expect(layout([P("a", 1, 40)], 40).total).toBe(BAND_ROWS_MAX);
  const tall = layout([P("a", 1, 40)], 40, { cap: 40 });
  expect(tall.total).toBe(40);
  expect(tall.slots).toEqual([{ id: "a", rows: 40 - TITLE_ROWS - PANEL_TITLE_ROWS }]);
  // maxRows still binds below the cap
  expect(layout([P("a", 1, 40)], 20, { cap: 40 }).total).toBe(20);
  // a cap below BAND_ROWS_MAX binds too
  expect(layout([P("a", 1, 40)], 40, { cap: 5 }).total).toBe(5);
});

test("rowsForStage: `full` wants the rest of `cap`; summary/compact and the default are unchanged", () => {
  expect(rowsForStage("full")).toEqual({ minRows: 3, wantRows: CONTENT_ROWS_MAX });
  expect(rowsForStage("full", 40)).toEqual({ minRows: 3, wantRows: 40 - TITLE_ROWS });
  expect(rowsForStage("compact", 40)).toEqual({ minRows: 2, wantRows: 3 });
  expect(rowsForStage("summary", 40)).toEqual({ minRows: 0, wantRows: 0 });
});

const boot = async (store: Record<string, unknown>, panels = [agents, hello]) => {
  const eng = fakeEngine({ store: { panels: { agents: true, hello: true }, "size.agents": "full", ...store } });
  eng.env = { TELLTALE_DEV: "1" };
  makeRegister(panels)(eng.on, {});
  await eng.fire("session.start", {});
  return eng;
};
const renderPane = (eng: ReturnType<typeof fakeEngine>, bodyRows: number, placement: "dock" | "inline" = "dock") =>
  eng.fire("ui.render", {
    surface: "terminal",
    component: "Pane",
    requestId: "r2",
    viewport: { columns: 100, rows: 40 },
    props: { title: "telltale", isFocused: false, bodyColumns: 100, placement, scroll: { offset: 0, bodyRows }, view: {} },
  });
const renderAbove = (eng: ReturnType<typeof fakeEngine>) =>
  eng.fire("ui.render", {
    surface: "terminal",
    component: "AbovePrompt",
    requestId: "r1",
    viewport: { columns: 100, rows: 40 },
    props: { hasSurvey: false, isWorking: false, maxRows: 14, scroll: { offset: 0, bodyRows: 13 } },
  });
const propsOf = (tree: unknown): BandProps => clientOf(tree)!.props.props as BandProps;

test("Pane: the band fills scroll.bodyRows (agents full = rest); AbovePrompt keeps the BAND_ROWS_MAX ceiling", async () => {
  const eng = await boot({ "edge.agents": "right" }, [agents]);
  const docked = propsOf(await renderPane(eng, 30));
  expect(docked.total).toBe(30);
  expect(docked.panels.find((p) => p.id === "agents")?.rows).toBe(30 - TITLE_ROWS - PANEL_TITLE_ROWS);
  const inline = propsOf(await renderPane(eng, 12, "inline"));
  expect(inline.total).toBe(12);
  // a Pane shorter than the band's own ceiling still fits
  expect(propsOf(await renderPane(eng, 5)).total).toBe(5);

  const above = await boot({ "edge.agents": "bottom" }, [agents]);
  const band = propsOf(await renderAbove(above));
  expect(band.total).toBe(BAND_ROWS_MAX);
  expect(band.panels.find((p) => p.id === "agents")?.rows).toBe(CONTENT_ROWS_MAX - PANEL_TITLE_ROWS);
});

// ── (b) compact really collapses ──

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
  ],
};

test("isCollapsed / renderCell: `forceCollapsed` collapses a running cell in every style, and beats a fresh `expanded`", () => {
  expect(isCollapsed(running, NOW)).toBe(false);
  expect(isCollapsed(running, NOW, null, true)).toBe(true);
  expect(isCollapsed(running, NOW, { id: "r1", at: NOW - 1 }, true)).toBe(true);
  expect(renderCell(running, "v1", 80, 4, NOW, 0, { offset: 0 }, null, true).lines).toHaveLength(1);
  expect(renderCell(running, "v4", 80, 2, NOW, 0, { offset: 0 }, null, true).lines).toHaveLength(1);
  expect(renderCell(running, "v2", 40, 8, NOW, 0, { offset: 0 }, null, true).lines).toHaveLength(1 + running.steps.length);
  // the merged history row stays one row under force even if it was clicked open
  const history: Cell = { ...running, id: MAIN_HISTORY_ID, kind: "main", label: "main", status: "completed", endAt: NOW - 10_000, steps: [{ name: "turn", detail: "a", t0: 0, t1: 1 }] };
  expect(renderCell(history, "v1", 80, 6, NOW, 0, { offset: 0 }, { id: MAIN_HISTORY_ID, at: NOW - 1 }, true).lines).toEqual([renderMainHistory(1, history.desc, 80)]);
});

// ── (c) a sub cell the list never named completes after UNLISTED_IDLE_MS idle ──

const stub = (id: string, at: number): Cell => ({ id, kind: "sub", label: "sub", desc: "", status: "running", firstAt: at, updatedAt: at, steps: [{ name: "prompt", t0: at }] });

test("UNLISTED_IDLE_MS is two minutes", () => {
  expect(UNLISTED_IDLE_MS).toBe(2 * 60 * 1000);
});

test("agents poll: a turn.step stub `$.agent.list()` never names completes once idle > UNLISTED_IDLE_MS (not at the boundary)", async () => {
  const eng = fakeEngine({ now: 0 });
  register(eng.on, {});
  await eng.fire("session.start", {});
  eng.store["agents.cells.s1"] = { w1: stub("w1", 0) }; // seeded after session.start (ticket 21)
  eng.agents = [];
  eng.now = UNLISTED_IDLE_MS;
  await eng.tick("agents");
  let cells = eng.store["agents.cells.s1"] as Cells;
  expect(cells.w1.status).toBe("running");
  eng.now = UNLISTED_IDLE_MS + 1;
  await eng.tick("agents");
  cells = eng.store["agents.cells.s1"] as Cells;
  expect(cells.w1.status).toBe("completed");
  expect(cells.w1.endAt).toBe(UNLISTED_IDLE_MS + 1);
  expect(cells.w1.steps.at(-1)?.name).toBe("reply");
});

test("agents poll: a cell the list has named carries `listed` and never idles out, even after it drops off the list", async () => {
  const eng = fakeEngine({ now: 0 });
  register(eng.on, {});
  await eng.fire("session.start", {});
  eng.agents = [{ id: "a1", description: "explore src", type: "Explore", status: "running" }];
  await eng.tick("agents");
  let cells = eng.store["agents.cells.s1"] as Cells;
  expect(cells.a1.listed).toBe(true);
  eng.agents = [];
  eng.now = UNLISTED_IDLE_MS * 10;
  await eng.tick("agents");
  cells = eng.store["agents.cells.s1"] as Cells;
  expect(cells.a1.status).toBe("running");
  // a stub the list names later is marked listed too, and stops idling out
  eng.store["agents.cells.s1"] = { ...cells, w1: stub("w1", eng.now) };
  eng.agents = [{ id: "w1", description: "late", type: "general-purpose", status: "running" }];
  await eng.tick("agents");
  eng.agents = [];
  eng.now = UNLISTED_IDLE_MS * 20;
  await eng.tick("agents");
  cells = eng.store["agents.cells.s1"] as Cells;
  expect(cells.w1.listed).toBe(true);
  expect(cells.w1.status).toBe("running");
});
