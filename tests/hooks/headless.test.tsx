// Ticket 26: headless sessions leave the store alone; live data is keyed by session;
// a successful agents tick clears its error. SDD §2.8 "session 隔離", §2.1. Exact match.
import { expect, test } from "bun:test";
import { fakeEngine } from "./harness";
import { STALE_SESSION_MS, makeRegister } from "../../plugins/telltale/hooks/register";
import { agents } from "../../plugins/telltale/hooks/panels/agents";
import type { Cell } from "../../plugins/telltale/hooks/cells";

const reg = makeRegister([agents]);

const cell = (id: string, updatedAt: number, status: Cell["status"] = "running"): Cell => ({
  id,
  kind: "sub",
  label: "sub",
  desc: "",
  status,
  firstAt: updatedAt,
  updatedAt,
  steps: [],
});

const render = (eng: ReturnType<typeof fakeEngine>, component: "AbovePrompt" | "Pane") =>
  eng.fire("ui.render", {
    surface: "terminal",
    component,
    requestId: "r1",
    viewport: { columns: 100, rows: 40 },
    props:
      component === "AbovePrompt"
        ? { hasSurvey: false, isWorking: false, maxRows: 14, scroll: { offset: 0, bodyRows: 13 } }
        : { title: "telltale", isFocused: false, bodyColumns: 100, placement: "dock", scroll: { offset: 0, bodyRows: 30 }, view: {} },
  });

// ── 1. headless: isInteractive === false ──

test("headless session.start registers /telltale and touches nothing else (no seed, no clear, no sweep, no pane, no tick)", async () => {
  const seeded = { "agents.cells.s1": { a: cell("a", 5) }, "agents.cells.other": {}, panels: { agents: false } };
  const eng = fakeEngine({ store: seeded, now: 10 });
  reg(eng.on, {});
  await eng.fire("session.start", { isInteractive: false });
  expect(eng.registered).toEqual(["telltale"]);
  expect(eng.opened).toEqual([]);
  expect(eng.timers).toEqual([]);
  expect(eng.store).toEqual(seeded);
  expect(eng.calls["$.store.set"]).toBeUndefined();
  expect(eng.calls["$.store.delete"]).toBeUndefined();
});

test("headless: observation hooks, both ui.render sites and command.run are inert", async () => {
  const eng = fakeEngine({ store: {} });
  reg(eng.on, {});
  await eng.fire("session.start", { isInteractive: false });
  await eng.fire("turn.start", { turnId: "t1", text: "hi" });
  await eng.fire("turn.complete", { turnId: "t1", stopReason: "end_turn" });
  expect(Object.keys(eng.store)).toEqual([]);
  expect(await render(eng, "AbovePrompt")).toEqual(eng.NEXT_RENDER);
  expect(await render(eng, "Pane")).toEqual(eng.NEXT_RENDER);
  expect(await eng.fire("command.run", { command: "telltale", args: "status" })).toEqual({ text: "telltale: idle (headless session)" });
  expect(Object.keys(eng.store)).toEqual([]);
});

test("interactive (isInteractive true, or the field absent) runs as before: seed, clear own cells, open the pane, start the tick", async () => {
  for (const e of [{ isInteractive: true }, {}]) {
    const eng = fakeEngine({ store: { "agents.cells.s1": { a: cell("a", 5) } } });
    reg(eng.on, {});
    await eng.fire("session.start", e);
    expect(eng.store.panels).toEqual({ agents: true });
    expect(eng.store["agents.cells.s1"]).toEqual({});
    expect(eng.opened).toEqual(["telltale"]);
    expect(eng.timers.map((t) => t.ms)).toEqual([1000]);
  }
});

// ── 2. live keys carry the session id ──

test("cells, expanded and the agents error are keyed by $.session.id(); the bare keys are never written", async () => {
  const eng = fakeEngine({ sessionId: "abc", store: {} });
  reg(eng.on, {});
  await eng.fire("session.start", {});
  expect(eng.calls["$.session.id"]).toBe(1);
  expect(eng.store["agents.cells.abc"]).toEqual({});
  expect(eng.store["agents.cells"]).toBeUndefined();

  await eng.fire("turn.start", { turnId: "t1", text: "hello" });
  expect(Object.keys(eng.store["agents.cells.abc"] as Record<string, Cell>)).toEqual(["t1"]);
  expect(eng.store["agents.cells"]).toBeUndefined();

  eng.store["agents.cells.abc"] = { c: cell("c", 0, "completed") };
  await eng.fire("ui.message", { data: { kind: "row", id: "agents", hit: "c" } });
  expect(eng.store["agents.expanded.abc"]).toMatchObject({ id: "c" });
  expect(eng.store["agents.expanded"]).toBeUndefined();

  eng.store["agents.cells.abc"] = { f: cell("f", 0, "failed"), r: cell("r", 0) };
  await eng.fire("command.run", { command: "telltale", args: "agents clear" });
  expect(Object.keys(eng.store["agents.cells.abc"] as Record<string, Cell>)).toEqual(["r"]);
});

test("stale sweep on session.start: other sessions' cells older than STALE_SESSION_MS (or empty) go, with their expanded/error; fresh ones stay", async () => {
  expect(STALE_SESSION_MS).toBe(24 * 60 * 60 * 1000);
  const now = 100 * STALE_SESSION_MS;
  const eng = fakeEngine({
    now,
    store: {
      "agents.cells.old": { a: cell("a", now - STALE_SESSION_MS - 1) },
      "agents.expanded.old": null,
      "error.agents.old": "boom",
      "agents.cells.empty": {},
      "agents.cells.fresh": { b: cell("b", now - 1000) },
      "error.agents.fresh": "",
      "style.agents": "v4",
    },
  });
  reg(eng.on, {});
  await eng.fire("session.start", {});
  expect(eng.store["agents.cells.old"]).toBeUndefined();
  expect(eng.store["agents.expanded.old"]).toBeUndefined();
  expect(eng.store["error.agents.old"]).toBeUndefined();
  expect(eng.store["agents.cells.empty"]).toBeUndefined();
  expect(eng.store["agents.cells.fresh"]).toEqual({ b: cell("b", now - 1000) });
  expect(eng.store["error.agents.fresh"]).toBe("");
  expect(eng.store["style.agents"]).toBe("v4"); // settings are global and untouched
  expect(eng.store["agents.cells.s1"]).toEqual({});
});

// ── 3. tick success clears the agents error ──

test("a successful agents tick writes error.agents.<sid> = '' (a stale error no longer forces the status row)", async () => {
  const eng = fakeEngine({ store: { "error.agents.s1": "telltale: $.agent.list is not available in this mode" } });
  reg(eng.on, {});
  await eng.fire("session.start", {}); // session.start runs the first tick itself
  expect(eng.store["error.agents.s1"]).toBe("");
  expect(eng.store["error.agents"]).toBeUndefined();
});
