// Ticket 17: /telltale agents style|edge|size|clear, and cell click (onRow / isExpanded).
// SDD §1.6 v0.2 table, §2.6 "onRow". Evaluation: exact match.
import { expect, test } from "bun:test";
import { runTelltale, type TelltaleState } from "../../plugins/telltale/hooks/command";
import { onRow, isExpanded } from "../../plugins/telltale/hooks/panels/agents";
import type { Cell } from "../../plugins/telltale/hooks/panel";

type Cells = Record<string, Cell>;

const baseState = (agentsView?: TelltaleState["agentsView"]): TelltaleState => ({
  order: [{ id: "agents", label: "agents" }],
  panels: { agents: true },
  layout: { slots: [{ id: "agents", rows: 3 }], dropped: [], total: 6 },
  available: 9,
  agentsView: agentsView ?? { style: "v2", edge: "right", size: "compact", cells: {} },
});

// ── /telltale agents style|edge|size|clear (SDD §1.6 v0.2 table) ──

test("agents style: reports current value with no args", () => {
  const r = runTelltale("agents style", baseState());
  expect(r.text).toBe("agents style: v2");
  expect(r.writes).toBeUndefined();
});

test("agents style v1: reports the change and writes style.agents", () => {
  const r = runTelltale("agents style v1", baseState());
  expect(r.text).toBe("agents style: v2 → v1");
  expect(r.writes).toEqual({ "style.agents": "v1" });
});

test("agents style v2 (same as current): unchanged, no write", () => {
  const r = runTelltale("agents style v2", baseState());
  expect(r.text).toBe("agents style: v2 (unchanged)");
  expect(r.writes).toBeUndefined();
});

test("agents edge right: reports and writes edge.agents", () => {
  const r = runTelltale("agents edge right", baseState({ style: "v2", edge: "bottom", size: "compact", cells: {} }));
  expect(r.text).toBe("agents edge: bottom → right");
  expect(r.writes).toEqual({ "edge.agents": "right" });
});

test("agents edge top: engine doesn't have it, reports not available and writes nothing", () => {
  const r = runTelltale("agents edge top", baseState());
  expect(r.text).toBe("agents edge top: not available in this build");
  expect(r.writes).toBeUndefined();
});

test("agents edge left: same as top — not available", () => {
  const r = runTelltale("agents edge left", baseState());
  expect(r.text).toBe("agents edge left: not available in this build");
});

test("agents size full: reports and writes size.agents", () => {
  const r = runTelltale("agents size full", baseState());
  expect(r.text).toBe("agents size: compact → full");
  expect(r.writes).toEqual({ "size.agents": "full" });
});

test("agents clear: reports the count and writes agents.cells with failed/killed/orphan removed", () => {
  const cells: Cells = {
    ok: { id: "ok", kind: "sub", label: "sub", desc: "", status: "running", firstAt: 0, updatedAt: 0, steps: [] },
    f: { id: "f", kind: "sub", label: "sub", desc: "", status: "failed", firstAt: 0, updatedAt: 0, steps: [] },
    o: { id: "o", kind: "bg", label: "bg", desc: "", status: "orphan", firstAt: 0, updatedAt: 0, steps: [] },
  };
  const r = runTelltale("agents clear", baseState({ style: "v2", edge: "right", size: "compact", cells }));
  expect(r.text).toBe("agents: cleared 2");
  expect(r.writes).toEqual({ "agents.cells": { ok: cells.ok } });
});

test("agents clear with nothing to clear: cleared 0", () => {
  const r = runTelltale("agents clear", baseState({ style: "v2", edge: "right", size: "compact", cells: {} }));
  expect(r.text).toBe("agents: cleared 0");
});

test("agents style with a bogus value falls to usage (malformed syntax, not unknown panel)", () => {
  const r = runTelltale("agents style v9", baseState());
  expect(r.text.startsWith("usage:")).toBe(true);
});

test("agents <unknown subcommand>: falls to usage", () => {
  const r = runTelltale("agents bogus", baseState());
  expect(r.text.startsWith("usage:")).toBe(true);
});

test("agents * with no agents panel registered: treated as unknown id, not a crash", () => {
  const state: TelltaleState = { order: [{ id: "hello", label: "hello" }], panels: { hello: true }, layout: { slots: [], dropped: [], total: 2 }, available: 9 };
  const r = runTelltale("agents style", state);
  expect(r.text).toBe('unknown panel "agents"; known: hello');
});

// ── onRow (pure) ──

test("onRow dismisses a failed/killed/orphan cell and leaves expanded null", () => {
  for (const status of ["failed", "killed", "orphan"] as const) { // all three, so narrowing to one status turns red
    const cells: Cells = { c: { id: "c", kind: "sub", label: "sub", desc: "", status, firstAt: 0, updatedAt: 0, steps: [] } };
    const out = onRow("c", cells, 1000);
    expect(out.cells.c.dismissed).toBe(true);
    expect(out.expanded).toBeNull();
  }
});

test("onRow expands a completed cell", () => {
  const cells: Cells = { c: { id: "c", kind: "sub", label: "sub", desc: "", status: "completed", firstAt: 0, updatedAt: 0, steps: [] } };
  const out = onRow("c", cells, 1000);
  expect(out.expanded).toEqual({ id: "c", at: 1000 });
});

test("onRow toggles collapsed on a running cell", () => {
  const cells: Cells = { c: { id: "c", kind: "sub", label: "sub", desc: "", status: "running", firstAt: 0, updatedAt: 0, steps: [] } };
  const collapsed = onRow("c", cells, 1000);
  expect(collapsed.cells.c.collapsed).toBe(true);
  const expanded = onRow("c", collapsed.cells, 2000);
  expect(expanded.cells.c.collapsed).toBeFalsy();
});

test("onRow on an unknown cell id is a no-op", () => {
  const out = onRow("nope", {}, 0);
  expect(out).toEqual({ cells: {}, expanded: null });
});

// ── expansion timeout: 10s, exact with a fake clock ──

test("isExpanded: true at 9999ms, false at 10000ms and beyond", () => {
  expect(isExpanded({ id: "c", at: 0 }, 9_999)).toBe(true);
  expect(isExpanded({ id: "c", at: 0 }, 10_000)).toBe(false);
  expect(isExpanded(null, 0)).toBe(false);
});
