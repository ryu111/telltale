// Ticket 22: a sub stub opened by turn.step that never receives a description is dropped
// (not closed) when agent.list reports it ended. Exact match. SDD §2.6, DESIGN §1.
import { expect, test } from "bun:test";
import { fakeEngine } from "./harness";
import { register } from "../../plugins/telltale/hooks/register";
import type { Cell } from "../../plugins/telltale/hooks/panel";

type Cells = Record<string, Cell>;

const boot = async (eng: ReturnType<typeof fakeEngine>) => {
  register(eng.on, {});
  await eng.fire("session.start", {});
};

const stubVia = async (eng: ReturnType<typeof fakeEngine>, agentId: string) => {
  eng.setNextResult("turn.step", { turnId: "t-sub", index: 0, answer: "", toolUses: [{ name: "Bash", input: { command: "ls", description: "list" } }], stopReason: "tool_use", usage: null });
  await eng.fire("turn.step", { turnId: "t-sub", agentId, index: 0, model: "haiku", messageCount: 1 });
  expect((eng.store["agents.cells"] as Cells)[agentId]?.desc).toBe("");
};

test("stub (desc \"\") + AgentInfo(description \"\", completed) → the cell is gone, no ✓ 0s row", async () => {
  const eng = fakeEngine({ now: 1000 });
  await boot(eng);
  await stubVia(eng, "x1");
  eng.now = 1500;
  eng.agents = [{ id: "x1", description: "", type: "Explore", status: "completed" }];
  await eng.tick("agents");
  expect((eng.store["agents.cells"] as Cells).x1).toBeUndefined();
});

test("stub + AgentInfo(description \"\", running) → the stub stays, still waiting for a description", async () => {
  const eng = fakeEngine({ now: 1000 });
  await boot(eng);
  await stubVia(eng, "x2");
  eng.agents = [{ id: "x2", description: "", type: "Explore", status: "running" }];
  await eng.tick("agents");
  const cell = (eng.store["agents.cells"] as Cells).x2;
  expect(cell?.status).toBe("running");
  expect(cell?.desc).toBe("");
});

test("stub + AgentInfo(description \"count files\", completed) → desc filled in and the cell is closed as before", async () => {
  const eng = fakeEngine({ now: 1000 });
  await boot(eng);
  await stubVia(eng, "x3");
  eng.now = 3000;
  eng.agents = [{ id: "x3", description: "count files", type: "Explore", status: "completed" }];
  await eng.tick("agents");
  const cell = (eng.store["agents.cells"] as Cells).x3;
  expect(cell?.desc).toBe("count files");
  expect(cell?.status).toBe("completed");
  expect(cell?.endAt).toBe(3000);
  expect(cell?.steps.at(-1)?.name).toBe("reply");
});
