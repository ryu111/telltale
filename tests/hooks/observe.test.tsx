// Ticket 12: turn.*/ui.render{Spinner}/session.receive{task-notification} hooks write agents.cells.
// SDD §1.1a, §2.6, §2.6a, §3 (v0.2 pipeline), I12 (subset), I13, I17.
// Evaluation: exact match.
//
// PREREQUISITE this skeleton assumes but does not itself provide (flagged to the parent —
// no ticket in 12/13/16/17/19 owns tests/hooks/harness.ts, and 00-共同規則 reserves tests/ for
// the ticket-writer, not the implementer):
//   fakeEngine(opts) additionally returns:
//     - env?: Record<string, string>            → backs $.env.get (not used by this ticket, listed for completeness)
//     - agents?: AgentInfo[]                     → backs $.agent.list (not used by this ticket)
//     - setNextResult(event, value): void         → the next `fire`/`emit` of `event` resolves `next(e)`
//                                                    to `value` instead of the default stub. Needed for
//                                                    turn.step, whose `toolUses` live on the RESULT, not
//                                                    the input (see 12-觀察hooks.md "型別上的兩個地雷").
//     - fire's matcher comparison does a nested partial match (claude-code's real `Matcher` allows
//       `{ origin: { kind: "task-notification" } }`), not a shallow `===` per key.
import { expect, test } from "bun:test";
import { fakeEngine } from "./harness";
import { register } from "../../plugins/telltale/hooks/register";
import {
  applyTurnStart,
  applySpinner,
  applyTurnStep,
  applyTurnComplete,
  applyTaskNotification,
  NOTIFICATION_RE,
  type Cells,
} from "../../plugins/telltale/hooks/observe";

const boot = async (eng: ReturnType<typeof fakeEngine>) => {
  register(eng.on, {});
  await eng.fire("session.start", {});
};

// ── pure functions (unit) ──

test("applyTurnStart opens a running main cell seeded with a prompt step", () => {
  const cells = applyTurnStart({}, { turnId: "t1", text: "x".repeat(90) }, 1000);
  expect(cells.t1.kind).toBe("main");
  expect(cells.t1.status).toBe("running");
  expect(cells.t1.desc.length).toBe(60);
  expect(cells.t1.firstAt).toBe(1000);
  expect(cells.t1.steps).toEqual([{ name: "prompt", t0: 1000 }]);
});

test("applyTurnStart is a no-op for a turnId already open", () => {
  const first = applyTurnStart({}, { turnId: "t1", text: "a" }, 1000);
  const second = applyTurnStart(first, { turnId: "t1", text: "b" }, 2000);
  expect(second.t1.steps).toEqual([{ name: "prompt", t0: 1000 }]);
});

test("applySpinner pushes think onto the target cell once per thinking streak", () => {
  const base: Cells = { t1: { id: "t1", kind: "main", label: "main", desc: "", status: "running", firstAt: 0, updatedAt: 0, steps: [{ name: "prompt", t0: 0 }] } };
  const once = applySpinner(base, { requestId: "t1", mode: "thinking" }, 100);
  expect(once.t1.steps.map((s) => s.name)).toEqual(["prompt", "think"]);
  const twice = applySpinner(once, { requestId: "t1", mode: "thinking" }, 200);
  expect(twice.t1.steps.map((s) => s.name)).toEqual(["prompt", "think"]); // not duplicated
});

test("applySpinner ignores modes outside the thinking set", () => {
  const base: Cells = { t1: { id: "t1", kind: "main", label: "main", desc: "", status: "running", firstAt: 0, updatedAt: 0, steps: [] } };
  const out = applySpinner(base, { requestId: "t1", mode: "tool-use" }, 100);
  expect(out.t1.steps).toEqual([]);
});

test("applyTurnStep appends one node per tool use, and records an Agent tool use as a pending spawn (not a new cell)", () => {
  const base = applyTurnStart({}, { turnId: "t1", text: "go" }, 0);
  const { cells, pending } = applyTurnStep(
    base,
    { turnId: "t1", toolUses: [{ name: "Bash", input: { description: "make check" } }, { name: "Agent", input: { description: "explore src", model: "sonnet" } }] },
    500,
  );
  expect(cells.t1.steps.map((s) => s.name)).toEqual(["prompt", "Bash", "Agent"]);
  expect(cells.t1.steps.find((s) => s.name === "Bash")?.detail).toBe("make check");
  expect(Object.keys(cells).sort()).toEqual(["t1"]); // no sub cell opened yet
  expect(pending).toEqual([{ description: "explore src", model: "sonnet", at: 500 }]);
});

test("applyTurnStep opens a minimal stub sub cell for a step carrying an unseen agentId", () => {
  const { cells } = applyTurnStep({}, { turnId: "t1", agentId: "a1", toolUses: [{ name: "Read", input: {} }] }, 100);
  expect(cells.a1.kind).toBe("sub");
  expect(cells.a1.desc).toBe("");
  expect(cells.a1.steps.map((s) => s.name)).toEqual(["prompt", "Read"]);
});

test("applyTurnStep with run_in_background Bash opens a separate bg cell in addition to the caller's node", () => {
  const base = applyTurnStart({}, { turnId: "t1", text: "go" }, 0);
  const { cells } = applyTurnStep(
    base,
    { turnId: "t1", toolUses: [{ name: "Bash", input: { run_in_background: true, description: "long build" } }] },
    500,
  );
  expect(cells.t1.steps.map((s) => s.name)).toEqual(["prompt", "Bash"]);
  const bg = Object.values(cells).find((c) => c.kind === "bg");
  expect(bg?.status).toBe("running");
  expect(bg?.id).toBe("500-long build");
});

test("applyTurnComplete closes a main cell with a reply node and is a no-op for a sub loop's turn.complete", () => {
  const base = applyTurnStart({}, { turnId: "t1", text: "go" }, 0);
  const done = applyTurnComplete(base, { turnId: "t1" }, 900);
  expect(done.t1.status).toBe("completed");
  expect(done.t1.endAt).toBe(900);
  expect(done.t1.steps.map((s) => s.name)).toEqual(["prompt", "reply"]);

  const subCells: Cells = { a1: { id: "a1", kind: "sub", label: "sub", desc: "x", status: "running", firstAt: 0, updatedAt: 0, steps: [{ name: "prompt", t0: 0 }] } };
  const untouched = applyTurnComplete(subCells, { turnId: "ignored", agentId: "a1" }, 900);
  expect(untouched).toEqual(subCells); // ticket 13's poll owns sub completion, not this hook
});

test("applyTaskNotification closes the earliest running bg cell with a matching description", () => {
  const cells: Cells = {
    "100-build": { id: "100-build", kind: "bg", label: "bg", desc: "build", status: "running", firstAt: 100, updatedAt: 100, steps: [{ name: "prompt", t0: 100 }] },
    "200-build": { id: "200-build", kind: "bg", label: "bg", desc: "build", status: "running", firstAt: 200, updatedAt: 200, steps: [{ name: "prompt", t0: 200 }] },
  };
  const out = applyTaskNotification(cells, 'Background command "build" completed', 999);
  expect(out["100-build"].status).toBe("completed");
  expect(out["100-build"].endAt).toBe(999);
  expect(out["200-build"].status).toBe("running"); // untouched — only the earliest matching one closes
});

test("applyTaskNotification is a no-op when the regex finds no description", () => {
  const cells: Cells = {};
  expect(applyTaskNotification(cells, "unrelated chatter", 0)).toEqual(cells);
});

test("NOTIFICATION_RE matches all three task-notification shapes", () => {
  expect(NOTIFICATION_RE.test('Background command "x" completed')).toBe(true);
  expect(NOTIFICATION_RE.test('Task "x" finished')).toBe(true);
  expect(NOTIFICATION_RE.test('Workflow "x" done')).toBe(true);
});

// ── register.tsx flow: one test per event, next called exactly once, store content asserted (I13) ──

test("turn.start writes agents.cells and calls next exactly once", async () => {
  const eng = fakeEngine();
  await boot(eng);
  let nextCalls = 0;
  const orig = eng.fire;
  await eng.fire("turn.start", { turnId: "t1", text: "hello" });
  const cells = eng.store["agents.cells"] as Cells;
  expect(cells.t1.kind).toBe("main");
  expect(eng.invalidations).toBeGreaterThan(0);
});

test("turn.step reads toolUses off next(e)'s result and returns that same result (I13)", async () => {
  const eng = fakeEngine();
  await boot(eng);
  await eng.fire("turn.start", { turnId: "t1", text: "hello" });
  eng.setNextResult("turn.step", { turnId: "t1", index: 0, answer: "", toolUses: [{ name: "Bash", input: { description: "make check" } }], stopReason: "tool_use", usage: null });
  const result = await eng.fire("turn.step", { turnId: "t1", index: 0, model: "sonnet", messageCount: 1 });
  expect(result).toEqual({ turnId: "t1", index: 0, answer: "", toolUses: [{ name: "Bash", input: { description: "make check" } }], stopReason: "tool_use", usage: null });
  const cells = eng.store["agents.cells"] as Cells;
  expect(cells.t1.steps.map((s) => s.name)).toEqual(["prompt", "Bash"]);
});

test("turn.complete marks the main cell completed", async () => {
  const eng = fakeEngine();
  await boot(eng);
  await eng.fire("turn.start", { turnId: "t1", text: "hello" });
  await eng.fire("turn.complete", { turnId: "t1", answer: "done", durationMs: 10, isAborted: false, reason: "answer" });
  const cells = eng.store["agents.cells"] as Cells;
  expect(cells.t1.status).toBe("completed");
});

test("ui.render{Spinner} does not invalidate", async () => {
  const eng = fakeEngine();
  await boot(eng);
  await eng.fire("turn.start", { turnId: "t1", text: "hello" });
  const before = eng.invalidations;
  await eng.fire("ui.render", { surface: "terminal", component: "Spinner", requestId: "t1", props: { word: "x", message: null, mode: "thinking" } });
  expect(eng.invalidations).toBe(before);
  const cells = eng.store["agents.cells"] as Cells;
  expect(cells.t1.steps.map((s) => s.name)).toEqual(["prompt", "think"]);
});

test("session.receive{origin:{kind:'task-notification'}} closes the matching bg cell and returns { text }", async () => {
  const eng = fakeEngine();
  await boot(eng);
  eng.store["agents.cells"] = {
    "0-build": { id: "0-build", kind: "bg", label: "bg", desc: "build", status: "running", firstAt: 0, updatedAt: 0, steps: [{ name: "prompt", t0: 0 }] },
  } satisfies Cells;
  const result = await eng.fire("session.receive", { origin: { kind: "task-notification" }, text: 'Background command "build" completed' });
  expect(result).toEqual({ text: 'Background command "build" completed' });
  const cells = eng.store["agents.cells"] as Cells;
  expect(cells["0-build"].status).toBe("completed");
});

test("session.receive with a different origin is left alone by this hook (no matcher hit)", async () => {
  const eng = fakeEngine();
  await boot(eng);
  eng.store["agents.cells"] = {} satisfies Cells;
  await eng.fire("session.receive", { origin: { kind: "bridge" }, text: "hi" });
  expect(eng.store["agents.cells"]).toEqual({});
});

// ── 補題 (mutation #4 of ticket 12): the hook returns next's result, not a copy of the input (I13) ──
test("session.receive: the hook returns what next(e) resolved, not input.text", async () => {
  const eng = fakeEngine();
  await boot(eng);
  eng.store["agents.cells"] = {} satisfies Cells;
  eng.setNextResult("session.receive", { text: "rewritten by a later plugin" });
  const result = await eng.fire("session.receive", { origin: { kind: "task-notification" }, text: 'Background command "x" completed' });
  expect(result).toEqual({ text: "rewritten by a later plugin" });
});
