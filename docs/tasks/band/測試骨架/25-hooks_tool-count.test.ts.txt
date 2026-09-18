// Ticket 25: ` · N tools` on the cell header. SDD §2.8 "cell 標題列 tool 次數". Exact + property.
import { expect, test } from "bun:test";
import { TOOL_EXCLUDED, renderCell, toolCount, type Cell, type CellLine, type CameraState } from "../../plugins/telltale/hooks/cells";
import { displayWidth } from "../../plugins/telltale/hooks/width";

const text = (line: CellLine): string => line.spans.map((s) => s.text).join("");
const NO_CAM: CameraState = { offset: 0 };
const NOW = 1000;

const withSteps = (names: string[]): Cell => ({
  id: "c1",
  kind: "main",
  label: "main",
  desc: "hello",
  status: "completed",
  firstAt: 0,
  endAt: 500,
  updatedAt: 500,
  steps: names.map((name) => ({ name, t0: 0, t1: 500 })),
});

test("TOOL_EXCLUDED is exactly prompt/think/reply/Agent", () => {
  expect([...TOOL_EXCLUDED].sort()).toEqual(["Agent", "prompt", "reply", "think"]);
});

test("toolCount counts tool steps only (exact)", () => {
  expect(toolCount(withSteps(["prompt", "Bash", "think", "Read", "Agent", "reply", "Bash"]))).toBe(3);
  expect(toolCount(withSteps(["prompt"]))).toBe(0);
  expect(toolCount(withSteps([]))).toBe(0);
  expect(toolCount(withSteps(["Agent", "Agent", "think"]))).toBe(0);
});

test("v1 header: ` · N tools` sits after the elapsed time and before the description (exact)", () => {
  const { lines } = renderCell(withSteps(["prompt", "Bash", "Read"]), "v1", 40, 12, NOW, 0, NO_CAM);
  expect(text(lines[0]!)).toBe("✓ main 0s · 2 tools · hello".padEnd(40));
});

test("v4 header carries the same count; v2's framed header contains it", () => {
  const cell = withSteps(["prompt", "Bash", "Read", "Edit"]);
  const v4 = renderCell(cell, "v4", 40, 12, NOW, 0, NO_CAM);
  expect(text(v4.lines[0]!)).toBe("✓ main 0s · 3 tools · hello".padEnd(40));
  const v2 = renderCell(cell, "v2", 40, 12, NOW, 0, NO_CAM);
  expect(v2.lines.some((l) => text(l).includes("3 tools"))).toBe(true);
});

test("0 tools shows nothing (the round-14 fixture header is unchanged)", () => {
  const { lines } = renderCell(withSteps(["prompt"]), "v1", 30, 12, NOW, 0, NO_CAM);
  expect(text(lines[0]!)).toBe("✓ main 0s · hello".padEnd(30));
  expect(lines.some((l) => text(l).includes("tools"))).toBe(false);
});

test("running cell: the count is present and every line still fits w (property, I4)", () => {
  const running: Cell = {
    ...withSteps(["prompt", "Bash", "Read", "Grep", "Bash", "Edit"]),
    status: "running",
    endAt: undefined,
    desc: "a fairly long description that will not fit and must marquee instead of overflowing",
  };
  for (const style of ["v1", "v2", "v4"] as const) {
    for (let w = 20; w <= 80; w += 5) {
      const { lines } = renderCell(running, style, w, 12, NOW, 3, NO_CAM);
      for (const line of lines) expect(displayWidth(text(line))).toBeLessThanOrEqual(w);
    }
  }
  const { lines } = renderCell(running, "v1", 60, 12, NOW, 3, NO_CAM);
  expect(text(lines[0]!)).toContain(" · 5 tools · ");
});
