// Ticket 20: descOfTurn — the main cell's task name is one line and a notification-triggered turn says so.
// SDD §2.6a / DESIGN §1. Exact match.
import { expect, test } from "bun:test";
import { applyTurnStart, descOfTurn } from "../../plugins/telltale/hooks/observe";

test("descOfTurn: first non-blank line, control chars stripped, clipped to 60", () => {
  expect(descOfTurn("\n\n  把 agents 面板做完\n第二行不要")).toBe("把 agents 面板做完");
  expect(descOfTurn("a\tb\r")).toBe("ab");
  expect(descOfTurn("x".repeat(80))).toBe("x".repeat(60));
  expect(descOfTurn("only")).not.toContain("\n");
});

test("descOfTurn: a task-notification turn names the task id", () => {
  expect(descOfTurn("<task-notification>\n<task-id>aa56f4d9082904ace</task-id>\n<tool-use-id>x</tool-use-id>")).toBe("↩ task-notification aa56f4d9082904ace");
  expect(descOfTurn("<task-notification>\nno id here")).toBe("↩ task-notification");
  expect(descOfTurn("<scheduled-trigger>\nprompt")).toBe("↩ scheduled-trigger");
});

test("applyTurnStart uses descOfTurn (no newline ever reaches the cell)", () => {
  const cells = applyTurnStart({}, { turnId: "t1", text: "<task-notification>\n<task-id>abc</task-id>" }, 0);
  expect(cells.t1!.desc).toBe("↩ task-notification abc");
});
