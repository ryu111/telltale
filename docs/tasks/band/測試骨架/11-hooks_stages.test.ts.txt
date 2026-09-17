// Ticket 11: stages (§1.2 rule 8) + size.<id> + title-click cycles through stages.
// SDD §1.2 rule 8, §1.5 v0.2, §1.6 v0.2, §2.1 v0.2. Evaluation: exact match.
import { expect, test } from "bun:test";
import { clientOf, fakeEngine } from "./harness";
import { CONTENT_ROWS_MAX, PANEL_TITLE_ROWS, layout, nextStage, rowsForStage, STAGE_ORDER, type Stage } from "../../plugins/telltale/hooks/layout";
import { titleClickKind, type BandProps } from "../../plugins/telltale/hooks/hit";
import { makeRegister } from "../../plugins/telltale/hooks/register";
import { runTelltale, type TelltaleState } from "../../plugins/telltale/hooks/command";
import type { Panel } from "../../plugins/telltale/hooks/panel";

// ── rowsForStage: the three fixed mappings (SDD §1.2 rule 8, literal numbers) ──
test("rowsForStage: summary/compact/full map to the fixed (minRows, wantRows) pairs", () => {
  expect(rowsForStage("summary")).toEqual({ minRows: 0, wantRows: 0 });
  expect(rowsForStage("compact")).toEqual({ minRows: 2, wantRows: 3 });
  expect(rowsForStage("full")).toEqual({ minRows: 3, wantRows: CONTENT_ROWS_MAX });
});

test("rowsForStage: full still respects layout()'s own ceiling (I2) when wired through", () => {
  const { minRows, wantRows } = rowsForStage("full");
  const r = layout([{ id: "agents", minRows, wantRows }], 5); // small maxRows: budget < wantRows
  expect(r.total).toBeLessThanOrEqual(5);
  expect(r.slots[0]?.rows ?? 0).toBeGreaterThanOrEqual(0);
});

// ── nextStage: cycle order is summary -> compact -> full -> summary ──
test("nextStage: cycles summary -> compact -> full -> summary", () => {
  let s: Stage = "summary";
  const seen: Stage[] = [s];
  for (let i = 0; i < 3; i++) {
    s = nextStage(s);
    seen.push(s);
  }
  expect(seen).toEqual(["summary", "compact", "full", "summary"]);
});

test("STAGE_ORDER: is exactly the three stages in this order", () => {
  expect(STAGE_ORDER).toEqual(["summary", "compact", "full"]);
});

// ── titleClickKind: staged panels post "stage", others post "toggle" ──
const bandProps = (panels: { id: string; stages?: boolean }[]): BandProps => ({
  columnsHint: 80,
  total: 3,
  panels: panels.map((p) => ({ id: p.id, label: p.id, rows: 1, lines: [], at: null, error: null, stages: p.stages })),
  dropped: [],
  now: 0,
});

test("titleClickKind: a panel with stages:true posts \"stage\"", () => {
  const props = bandProps([{ id: "agents", stages: true }]);
  expect(titleClickKind("agents", props)).toBe("stage");
});

test("titleClickKind: hello/clock (no stages) post \"toggle\"", () => {
  const props = bandProps([{ id: "hello" }, { id: "clock", stages: false }]);
  expect(titleClickKind("hello", props)).toBe("toggle");
  expect(titleClickKind("clock", props)).toBe("toggle");
});

// ── command.ts: runTelltale's `size` sub-command ──
const stagedState = (sizes: Record<string, Stage> = {}): TelltaleState => ({
  order: [{ id: "agents", label: "agents", stages: true }, { id: "hello", label: "hello" }],
  panels: { agents: true, hello: true },
  sizes,
  layout: { slots: [{ id: "agents", rows: 3 }, { id: "hello", rows: 1 }], dropped: [], total: 7 },
  available: 9,
});

test("runTelltale: `<id> size` with no value reports the current stage (default compact)", () => {
  const r = runTelltale("agents size", stagedState());
  expect(r.text).toBe("agents: size compact");
  expect(r.sizes).toEqual({});
});

test("runTelltale: `<id> size <stage>` sets it and reports the transition", () => {
  const r = runTelltale("agents size full", stagedState());
  expect(r.text).toBe("agents: size compact → full");
  expect(r.sizes).toEqual({ agents: "full" });
});

test("runTelltale: `<id> size <stage>` unchanged reports (unchanged) and does not touch sizes identity", () => {
  const state = stagedState({ agents: "compact" });
  const r = runTelltale("agents size compact", state);
  expect(r.text).toBe("agents: size compact (unchanged)");
  expect(r.sizes).toBe(state.sizes);
});

test("runTelltale: `<id> size` on a panel without stages falls back to usage", () => {
  const r = runTelltale("hello size", stagedState());
  expect(r.text).toStartWith("usage:");
});

test("runTelltale: `<id> size <garbage>` falls back to usage", () => {
  const r = runTelltale("agents size huge", stagedState());
  expect(r.text).toStartWith("usage:");
});

// ── same key, two paths: a title click and `/telltale agents size` write the same store slot ──
const stagedPanel = {
  id: "agents",
  label: "agents",
  defaultOn: true,
  minRows: 2,
  wantRows: 3,
  stages: { summary: 0, compact: 3, full: "rest" },
  view: () => ({ id: "agents", lines: [] }),
} as unknown as Panel;

test("clicking a title and running `/telltale agents size full` both write store key size.agents", async () => {
  const reg = makeRegister([stagedPanel]);
  const eng = fakeEngine({ store: { panels: { agents: true } } });
  reg(eng.on, {});
  await eng.fire("session.start", {});

  // path 1: default is compact (SDD §1.2 rule 8); two title clicks cycle compact -> full -> summary via ui.message
  await eng.fire("ui.message", { data: { kind: "stage", id: "agents" } });
  expect(eng.store["size.agents"]).toBe("full");
  await eng.fire("ui.message", { data: { kind: "stage", id: "agents" } });
  expect(eng.store["size.agents"]).toBe("summary");

  // reset, path 2: the same transition via command.run
  eng.store["size.agents"] = "compact";
  await eng.fire("command.run", { command: "telltale", args: "agents size full" });
  expect(eng.store["size.agents"]).toBe("full");
});

test("ui.render wants: a staged panel's minRows/wantRows follow size.<id>, not its static Panel fields", async () => {
  const reg = makeRegister([stagedPanel]);
  const eng = fakeEngine({ store: { panels: { agents: true }, "size.agents": "full" } });
  reg(eng.on, {});
  await eng.fire("session.start", {});
  const tree = await eng.fire("ui.render", {
    surface: "terminal",
    component: "AbovePrompt",
    viewport: { columns: 80 },
    props: { hasSurvey: false, maxRows: 9 },
  });
  // "full" maps to (minRows, wantRows) = (3, CONTENT_ROWS_MAX): with only this one panel on,
  // layout() gives it the whole content budget minus its own title row (rule 3), so its rendered
  // row count is CONTENT_ROWS_MAX - PANEL_TITLE_ROWS (6), not its static Panel.wantRows (3).
  const client = clientOf(tree);
  const props = client!.props.props as { panels: { id: string; rows: number }[] }; // Client JSX attribute is literally `props`
  expect(props.panels.find((p) => p.id === "agents")?.rows).toBe(CONTENT_ROWS_MAX - PANEL_TITLE_ROWS);
});

test("ui.message stage on a non-staged panel id (hello) is ignored, not treated as toggle", async () => {
  // Ticket 11: a panel without stages never reacts to kind:"stage" (its clicks post "toggle" instead). Exact.
  const hello: Panel = { id: "hello", label: "hello", defaultOn: true, minRows: 1, wantRows: 2, view: () => ({ id: "hello", lines: [] }) };
  const reg = makeRegister([hello]);
  const eng = fakeEngine({ store: { panels: { hello: true } } });
  reg(eng.on, {});
  await eng.fire("session.start", {});
  await eng.fire("ui.message", { data: { kind: "stage", id: "hello" } });
  expect(eng.store.panels).toEqual({ hello: true });
  expect(eng.store["size.hello"]).toBeUndefined();
});

test("runTelltale: `<unknown> size` and `<unknown> size full` report the unknown panel, not usage", () => {
  // Ticket 11: id is checked before the sub-command, same order as round one. Exact.
  const state = stagedState();
  expect(runTelltale("nope size", state).text).toContain("unknown panel");
  expect(runTelltale("nope size full", state).text).toContain("unknown panel");
});
