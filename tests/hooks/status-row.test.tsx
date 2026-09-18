// Ticket 23: the status row exists only when there is something to say (dropped or error).
// SDD §1.2 rules 1/2/5, §1.5 last row, I3. Exact match.
import { expect, test } from "bun:test";
import { clientOf, fakeEngine } from "./harness";
import { register } from "../../plugins/telltale/hooks/register";
import { BAND_ROWS_MAX, CONTENT_ROWS_MAX, FIXED_ROWS, STATUS_ROWS, TITLE_ROWS, PANEL_TITLE_ROWS, layout } from "../../plugins/telltale/hooks/layout";

const P = (id: string, minRows: number, wantRows: number) => ({ id, minRows, wantRows });

test("constants: title row always, status row conditional, content max derived from the title row only", () => {
  expect(TITLE_ROWS).toBe(1);
  expect(STATUS_ROWS).toBe(1);
  expect(FIXED_ROWS).toBe(TITLE_ROWS + STATUS_ROWS);
  expect(CONTENT_ROWS_MAX).toBe(BAND_ROWS_MAX - TITLE_ROWS);
});

test("nothing dropped, no error: no status row; the row goes to content", () => {
  const r = layout([P("a", 1, 9)], BAND_ROWS_MAX);
  expect(r.status).toBe(false);
  expect(r.dropped).toEqual([]);
  expect(r.slots).toEqual([{ id: "a", rows: BAND_ROWS_MAX - TITLE_ROWS - PANEL_TITLE_ROWS }]);
  expect(r.total).toBe(BAND_ROWS_MAX);
});

test("something dropped: status row comes back and the surviving panel is laid out with it", () => {
  // maxRows 6, no status: a (1+3) fits, b (1+3) doesn't → dropped → recompute with the status row: budget 4, a still fits with 3
  const r = layout([P("a", 3, 3), P("b", 3, 3)], 6);
  expect(r.status).toBe(true);
  expect(r.dropped).toEqual(["b"]);
  expect(r.slots).toEqual([{ id: "a", rows: 3 }]);
  expect(r.total).toBe(FIXED_ROWS + PANEL_TITLE_ROWS + 3);
});

test("opts.status (a panel error) forces the status row even when nothing is dropped", () => {
  const r = layout([P("a", 1, 9)], BAND_ROWS_MAX, { status: true });
  expect(r.status).toBe(true);
  expect(r.dropped).toEqual([]);
  expect(r.slots).toEqual([{ id: "a", rows: BAND_ROWS_MAX - FIXED_ROWS - PANEL_TITLE_ROWS }]);
  expect(r.total).toBe(BAND_ROWS_MAX);
});

test("rule 2: too short to draw anything → everything dropped, status row on, total ≤ FIXED_ROWS", () => {
  expect(layout([P("a", 1, 1)], 2)).toEqual({ slots: [], dropped: ["a"], total: 2, status: true });
  expect(layout([P("a", 1, 1)], 1)).toEqual({ slots: [], dropped: ["a"], total: 1, status: true });
  expect(layout([], 40)).toEqual({ slots: [], dropped: [], total: 1, status: false });
});

test("rule 5 with a conditional status row: total = (status ? FIXED : TITLE) + Σ(1 + rows), never over the ceiling", () => {
  for (const maxRows of [0, 1, 2, 3, 4, 5, 7, 9, 40]) {
    for (const status of [false, true]) {
      const r = layout([P("a", 1, 2), P("b", 2, 3), P("c", 1, 1)], maxRows, { status });
      const fixed = r.status ? FIXED_ROWS : TITLE_ROWS;
      if (r.slots.length > 0) expect(r.total).toBe(fixed + r.slots.reduce((n, s) => n + PANEL_TITLE_ROWS + s.rows, 0));
      expect(r.total).toBeLessThanOrEqual(Math.max(1, Math.min(maxRows, BAND_ROWS_MAX)));
      if (status) expect(r.status).toBe(true);
      if (r.dropped.length > 0) expect(r.status).toBe(true);
    }
  }
});

// ── through register: agents alone (default full) ──

type Props = { total: number; status: boolean; dropped: string[]; panels: { id: string; rows: number; error: string | null }[] };
const render = async (eng: ReturnType<typeof fakeEngine>, maxRows: number) =>
  clientOf(await eng.fire("ui.render", { surface: "terminal", component: "AbovePrompt", viewport: { columns: 120 }, props: { hasSurvey: false, maxRows } }))!.props.props as Props;

test("agents alone at 9 rows: no status row, agents gets 7 content rows", async () => {
  const eng = fakeEngine({ agents: [], store: { "edge.agents": "bottom" } }); // ticket 27: AbovePrompt draws only when edge is bottom
  register(eng.on, {});
  await eng.fire("session.start", {});
  const p = await render(eng, BAND_ROWS_MAX);
  expect(p.status).toBe(false);
  expect(p.total).toBe(BAND_ROWS_MAX);
  expect(p.panels.find((x) => x.id === "agents")?.rows).toBe(CONTENT_ROWS_MAX - PANEL_TITLE_ROWS);
});

test("a panel error brings the status row back: agents loses one row to it", async () => {
  const eng = fakeEngine({ agents: [], store: { "edge.agents": "bottom" } }); // ticket 27: AbovePrompt draws only when edge is bottom
  register(eng.on, {});
  await eng.fire("session.start", {});
  // Ticket 26: session.start runs the first (successful) tick, which clears the error — seed it afterwards.
  eng.store["error.agents.s1"] = "data too large";
  const p = await render(eng, BAND_ROWS_MAX);
  expect(p.status).toBe(true);
  expect(p.panels.find((x) => x.id === "agents")?.error).toBe("data too large");
  expect(p.panels.find((x) => x.id === "agents")?.rows).toBe(CONTENT_ROWS_MAX - PANEL_TITLE_ROWS - STATUS_ROWS);
});

test("too short for agents (full needs 1 + 3): dropped, status row on", async () => {
  const eng = fakeEngine({ agents: [], store: { "edge.agents": "bottom" } }); // ticket 27: AbovePrompt draws only when edge is bottom
  register(eng.on, {});
  await eng.fire("session.start", {});
  const p = await render(eng, 4);
  expect(p.dropped).toEqual(["agents"]);
  expect(p.status).toBe(true);
  expect(p.panels).toEqual([]);
  expect(p.total).toBe(FIXED_ROWS);
});
