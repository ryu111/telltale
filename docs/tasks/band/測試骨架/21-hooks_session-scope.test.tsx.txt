// Ticket 21: cells are session-scoped; notification tags with attributes; no empty cells;
// main-history row is one line; agents defaults to the full stage. Exact match.
import { expect, test } from "bun:test";
import { fakeEngine, clientOf } from "./harness";
import { register } from "../../plugins/telltale/hooks/register";
import { descOfTurn } from "../../plugins/telltale/hooks/observe";
import { agents, MAIN_HISTORY_ID } from "../../plugins/telltale/hooks/panels/agents";
import { renderCell, type Cell } from "../../plugins/telltale/hooks/cells";

test("session.start drops cells left by a previous session", async () => {
  const eng = fakeEngine({ store: { "agents.cells": { old: { id: "old", kind: "main", label: "main", desc: "stale", status: "completed", firstAt: 0, endAt: 1, updatedAt: 1, steps: [] } } } });
  register(eng.on, {});
  await eng.fire("session.start", {});
  expect(eng.store["agents.cells"]).toEqual({});
});

test("descOfTurn: a tag with attributes is still a notification turn", () => {
  expect(descOfTurn('<agent-message from="abc">\nhello')).toBe("↩ agent-message");
  expect(descOfTurn("<task-notification>\n<task-id>x1</task-id>")).toBe("↩ task-notification x1");
});

test("poll: an AgentInfo without a description never opens a cell", async () => {
  const eng = fakeEngine({ agents: [{ id: "a1", description: "", type: "Explore", status: "completed" }], store: { "agents.cells": {} } });
  register(eng.on, {});
  await eng.fire("session.start", {});
  await eng.tick("agents");
  const cells = eng.store["agents.cells"] as Record<string, Cell>;
  expect(Object.values(cells).filter((c) => c.kind === "sub")).toEqual([]);
});

test("main history cell renders as exactly one line in every style", () => {
  const history: Cell = { id: MAIN_HISTORY_ID, kind: "main", label: "main", desc: "最近一輪", status: "completed", firstAt: 0, endAt: 0, updatedAt: 0, steps: [{ name: "turn", t0: 0, t1: 1 }, { name: "turn", t0: 1, t1: 2 }] };
  for (const style of ["v1", "v2", "v4"] as const) {
    const { lines } = renderCell(history, style, 80, 12, 10_000, 0, { offset: 0 });
    expect(lines.length).toBe(1);
    expect(lines[0]!.spans.map((s) => s.text).join("")).toContain("turns");
  }
});

test("agents panel defaults to the full stage; a demo panel still defaults to compact", async () => {
  expect(agents.defaultStage).toBe("full");
  const eng = fakeEngine({ store: { panels: { agents: true } }, agents: [] });
  register(eng.on, {});
  await eng.fire("session.start", {});
  const tree = await eng.fire("ui.render", { surface: "terminal", component: "AbovePrompt", viewport: { columns: 120 }, props: { hasSurvey: false, maxRows: 9 } });
  const props = clientOf(tree)!.props.props as { panels: { id: string; rows: number }[] };
  expect(props.panels.find((p) => p.id === "agents")?.rows).toBe(6); // full = rest of the 9-row budget
});
