// Ticket 13: agents panel poll — sub cell lifecycle, model pairing, main-history fold, TELLTALE_DEV gate.
// SDD §1.1a, §2.1 (v0.2 keys), §2.6, §2.7, I12 (subset only — see 13-agents面板.md), I16.
// Evaluation: exact match + property (manual randomized loops; no npm deps per 00-共同規則).
//
// PREREQUISITE (same gap as ticket 12's skeleton — flagged to the parent, no owning ticket):
//   fakeEngine(opts) needs `agents?: AgentInfo[]` (backs $.agent.list) and `env?: Record<string,string>`
//   (backs $.env.get). `eng.tick("agents")` (existing tick-by-name mechanism, ticket 05) drives the poll.
import { expect, test } from "bun:test";
import { fakeEngine } from "./harness";
import { register } from "../../plugins/telltale/hooks/register";
import { MAIN_HISTORY_ID } from "../../plugins/telltale/hooks/panels/agents";
import type { Cell } from "../../plugins/telltale/hooks/panel";

type Cells = Record<string, Cell>;

const bootDev = async (eng: ReturnType<typeof fakeEngine>) => {
  eng.env = { TELLTALE_DEV: "1" };
  register(eng.on, {});
  await eng.fire("session.start", {});
};

// ── TELLTALE_DEV gates hello/clock, never agents ──

test("without TELLTALE_DEV, only agents polls (hello/clock are not registered)", async () => {
  const eng = fakeEngine();
  register(eng.on, {});
  await eng.fire("session.start", {});
  expect(eng.timers.map((t) => t.ms).length).toBe(1); // only agents' everyMs timer
  expect(eng.store["agents.cells"]).toBeDefined();
  expect(eng.store["data.hello"]).toBeUndefined();
  expect(eng.store["data.clock"]).toBeUndefined();
});

test("with TELLTALE_DEV=1, hello and clock also poll", async () => {
  const eng = fakeEngine();
  await bootDev(eng);
  expect(eng.store["data.hello"]).toBeDefined();
  expect(eng.store["data.clock"]).toBeDefined();
});

// ── sub cell lifecycle ──

test("a new AgentInfo opens a running sub cell; status flip to completed pushes reply and sets endAt", async () => {
  const eng = fakeEngine({ now: 1000 });
  register(eng.on, {});
  await eng.fire("session.start", {});
  eng.agents = [{ id: "a1", description: "explore src", type: "Explore", status: "running" }];
  await eng.tick("agents");
  let cells = eng.store["agents.cells"] as Cells;
  expect(cells.a1.kind).toBe("sub");
  expect(cells.a1.status).toBe("running");

  eng.now = 2000;
  eng.agents = [{ id: "a1", description: "explore src", type: "Explore", status: "completed" }];
  await eng.tick("agents");
  cells = eng.store["agents.cells"] as Cells;
  expect(cells.a1.status).toBe("completed");
  expect(cells.a1.endAt).toBe(2000);
  expect(cells.a1.steps.at(-1)?.name).toBe("reply");
});

test("a sub cell already opened by turn.step (desc \"\") is filled in by the next poll, not duplicated", async () => {
  const eng = fakeEngine({ now: 0 });
  register(eng.on, {});
  await eng.fire("session.start", {});
  // Seeded AFTER session.start: ticket 21 clears `agents.cells` at session start.
  eng.store["agents.cells"] = { a1: { id: "a1", kind: "sub", label: "sub", desc: "", status: "running", firstAt: 0, updatedAt: 0, steps: [{ name: "prompt", t0: 0 }] } };
  eng.agents = [{ id: "a1", description: "explore src", type: "Explore", status: "running" }];
  await eng.tick("agents");
  const cells = eng.store["agents.cells"] as Cells;
  expect(Object.keys(cells)).toEqual(["a1"]);
  expect(cells.a1.desc).toBe("explore src");
});

test("completed cells vanish 60s after endAt but not one tick before; failed cells never auto-vanish (I16)", async () => {
  const eng = fakeEngine({ now: 60_000 });
  register(eng.on, {});
  await eng.fire("session.start", {});
  // Seeded AFTER session.start: ticket 21 clears `agents.cells` at session start.
  eng.store["agents.cells"] = {
    done: { id: "done", kind: "sub", label: "sub", desc: "x", status: "completed", firstAt: 0, endAt: 1000, updatedAt: 1000, steps: [] },
    failed: { id: "failed", kind: "sub", label: "sub", desc: "y", status: "failed", firstAt: 0, endAt: 1000, updatedAt: 1000, steps: [] },
  };
  eng.agents = [];
  eng.now = 1000 + 59_000; // 59s after endAt
  await eng.tick("agents");
  expect((eng.store["agents.cells"] as Cells).done).toBeDefined();

  eng.now = 1000 + 61_000; // 61s after endAt
  await eng.tick("agents");
  const cells = eng.store["agents.cells"] as Cells;
  expect(cells.done).toBeUndefined();
  expect(cells.failed).toBeDefined(); // never auto-removed
});

// ── model pairing ──

test("model pairing: three concrete cases", async () => {
  const eng = fakeEngine({ now: 0, store: { "agents.cells": {} } });
  register(eng.on, {});
  await eng.fire("session.start", {});
  await eng.fire("turn.start", { turnId: "t1", text: "go" });
  eng.setNextResult("turn.step", { turnId: "t1", index: 0, answer: "", toolUses: [{ name: "Agent", input: { description: "fix bug", model: "opus" } }], stopReason: "tool_use", usage: null });
  await eng.fire("turn.step", { turnId: "t1", index: 0, model: "sonnet", messageCount: 1 });

  // Case A: matching description arrives → model attached.
  eng.agents = [{ id: "a1", description: "fix bug", type: "general-purpose", status: "running" }];
  await eng.tick("agents");
  expect((eng.store["agents.cells"] as Cells).a1.model).toBe("opus");

  // Case B: no pending spawn → model stays undefined.
  eng.agents = [...eng.agents, { id: "a2", description: "unrelated", type: "general-purpose", status: "running" }];
  await eng.tick("agents");
  expect((eng.store["agents.cells"] as Cells).a2.model).toBeUndefined();

  // Case C: a pending spawn is consumed once — a second sub cell with the same description doesn't reuse it.
  await eng.fire("turn.start", { turnId: "t2", text: "go" });
  eng.setNextResult("turn.step", { turnId: "t2", index: 0, answer: "", toolUses: [{ name: "Agent", input: { description: "fix bug", model: "haiku" } }], stopReason: "tool_use", usage: null });
  await eng.fire("turn.step", { turnId: "t2", index: 0, model: "sonnet", messageCount: 1 });
  eng.agents = [...eng.agents, { id: "a3", description: "fix bug", type: "general-purpose", status: "running" }];
  await eng.tick("agents");
  expect((eng.store["agents.cells"] as Cells).a3.model).toBe("haiku");
});

test("model pairing property: N>=3 same-description pending spawns each attach at most once, earliest first", async () => {
  for (let trial = 0; trial < 20; trial += 1) {
    const n = 3 + (trial % 5); // 3..7
    const eng = fakeEngine({ now: 0, store: { "agents.cells": {} } });
    register(eng.on, {});
    await eng.fire("session.start", {});
    await eng.fire("turn.start", { turnId: "t", text: "go" });
    const toolUses = Array.from({ length: n }, (_, i) => ({ name: "Agent", input: { description: "d", model: `m${i}` } }));
    eng.setNextResult("turn.step", { turnId: "t", index: 0, answer: "", toolUses, stopReason: "tool_use", usage: null });
    await eng.fire("turn.step", { turnId: "t", index: 0, model: "sonnet", messageCount: 1 });

    eng.agents = Array.from({ length: n }, (_, i) => ({ id: `a${i}`, description: "d", type: "general-purpose", status: "running" as const }));
    await eng.tick("agents");
    const cells = eng.store["agents.cells"] as Cells;
    const models = Array.from({ length: n }, (_, i) => cells[`a${i}`]?.model);
    expect(new Set(models.filter((m) => m !== undefined)).size).toBe(models.filter((m) => m !== undefined).length); // no reuse
    expect(models[0]).toBe("m0"); // earliest pending → whichever sub cell it lands on is deterministic here since poll runs once
  }
});

// ── main history fold ──

test("a completed main cell folds into the reserved history cell 3s after it completes, and stays there past 60s (§2.6 main history)", async () => {
  const eng = fakeEngine({ now: 0 });
  register(eng.on, {});
  await eng.fire("session.start", {});
  // Seeded AFTER session.start: ticket 21 clears `agents.cells` at session start.
  eng.store["agents.cells"] = {
    t1: { id: "t1", kind: "main", label: "main", desc: "did a thing", status: "completed", firstAt: 0, endAt: 1000, updatedAt: 1000, steps: [{ name: "prompt", t0: 0 }, { name: "reply", t0: 1000 }] },
  };
  eng.agents = [];

  eng.now = 1000 + 2_999; // just under 3s
  await eng.tick("agents");
  expect((eng.store["agents.cells"] as Cells).t1).toBeDefined();

  eng.now = 1000 + 3_001; // just over 3s
  await eng.tick("agents");
  let cells = eng.store["agents.cells"] as Cells;
  expect(cells.t1).toBeUndefined();
  expect(cells[MAIN_HISTORY_ID]).toBeDefined();
  expect(cells[MAIN_HISTORY_ID].steps.at(-1)).toEqual({ name: "turn", detail: "did a thing", t0: 0, t1: 1000 });

  // Stays past the ordinary 60s vanish window — it is exempt.
  eng.now = 1000 + 3_001 + 61_000;
  await eng.tick("agents");
  cells = eng.store["agents.cells"] as Cells;
  expect(cells[MAIN_HISTORY_ID]).toBeDefined();
});

test("a running main cell is never folded into history", async () => {
  const eng = fakeEngine({ now: 100_000 });
  register(eng.on, {});
  await eng.fire("session.start", {});
  // Seeded AFTER session.start: ticket 21 clears `agents.cells` at session start.
  eng.store["agents.cells"] = {
    t1: { id: "t1", kind: "main", label: "main", desc: "still going", status: "running", firstAt: 0, updatedAt: 0, steps: [{ name: "prompt", t0: 0 }] },
  };
  eng.agents = [];
  await eng.tick("agents");
  const cells = eng.store["agents.cells"] as Cells;
  expect(cells.t1).toBeDefined();
  expect(cells[MAIN_HISTORY_ID]).toBeUndefined();
});

// ── calls: subset only (I12's exact check is tightened in ticket 16) ──

test("calls stay within the eleven-op v0.2 whitelist", async () => {
  const eng = fakeEngine();
  await bootDev(eng);
  const WHITELIST = new Set(["$.ui.resolve", "$.ui.invalidate", "$.clock.now", "$.clock.every", "$.store.get", "$.store.set", "$.command.register", "$.agent.list", "$.env.get", "$.ui.open", "$.ui.close"]);
  for (const op of Object.keys(eng.calls)) expect(WHITELIST.has(op)).toBe(true);
});
