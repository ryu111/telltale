// Ticket 27: edge tri-state (right / bottom / both) really opens and closes the Pane,
// and the title row grows a [R B RB] group. SDD §2.8 "換邊三態" / "標題列按鍵". Exact match.
import { expect, test } from "bun:test";
import { clientOf, fakeEngine } from "./harness";
import { buttonStrip, resolveTitleClick, type BandProps, type TitleButtons } from "../../plugins/telltale/hooks/hit";
import { makeRegister } from "../../plugins/telltale/hooks/register";
import { agents } from "../../plugins/telltale/hooks/panels/agents";
import { hello } from "../../plugins/telltale/hooks/panels/hello";

// agents compact (3 rows) + hello (2 rows) fit in BAND_ROWS_MAX together, so "every panel" is checkable.
const boot = async (store: Record<string, unknown> = {}, panels = [agents, hello]) => {
  const eng = fakeEngine({ store: { panels: { agents: true, hello: true }, "size.agents": "compact", ...store } });
  eng.env = { TELLTALE_DEV: "1" };
  makeRegister(panels)(eng.on, {});
  await eng.fire("session.start", {});
  return eng;
};

const renderAbove = (eng: ReturnType<typeof fakeEngine>) =>
  eng.fire("ui.render", {
    surface: "terminal",
    component: "AbovePrompt",
    requestId: "r1",
    viewport: { columns: 100, rows: 40 },
    props: { hasSurvey: false, isWorking: false, maxRows: 14, scroll: { offset: 0, bodyRows: 13 } },
  });

const renderPane = (eng: ReturnType<typeof fakeEngine>) =>
  eng.fire("ui.render", {
    surface: "terminal",
    component: "Pane",
    requestId: "r2",
    viewport: { columns: 100, rows: 40 },
    props: { title: "telltale", isFocused: false, bodyColumns: 100, placement: "dock", scroll: { offset: 0, bodyRows: 30 }, view: {} },
  });

const panelIds = (tree: unknown): string[] | null => {
  const c = clientOf(tree);
  if (!c) return null;
  return (c.props.props as BandProps).panels.map((p) => p.id);
};

// ── session.start ──

test("session.start opens the Pane for right / both / unset, not for bottom", async () => {
  expect((await boot()).opened).toEqual(["telltale"]);
  expect((await boot({ "edge.agents": "right" })).opened).toEqual(["telltale"]);
  expect((await boot({ "edge.agents": "both" })).opened).toEqual(["telltale"]);
  expect((await boot({ "edge.agents": "bottom" })).opened).toEqual([]);
});

// ── which site draws what ──

test("right: the Pane draws every panel; once it has rendered, AbovePrompt yields to next (ticket 30)", async () => {
  const eng = await boot({ "edge.agents": "right" });
  expect(panelIds(await renderPane(eng))).toEqual(["agents", "hello"]);
  expect(await renderAbove(eng)).toEqual(eng.NEXT_RENDER);
});

test("bottom: AbovePrompt draws every panel; the Pane yields", async () => {
  const eng = await boot({ "edge.agents": "bottom" });
  expect(panelIds(await renderAbove(eng))).toEqual(["agents", "hello"]);
  expect(await renderPane(eng)).toEqual(eng.NEXT_RENDER);
});

test("both: the Pane draws only agents, AbovePrompt the others; with no others AbovePrompt yields", async () => {
  const eng = await boot({ "edge.agents": "both" });
  expect(panelIds(await renderPane(eng))).toEqual(["agents"]);
  expect(panelIds(await renderAbove(eng))).toEqual(["hello"]);
  const solo = await boot({ "edge.agents": "both" }, [agents]);
  expect(await renderAbove(solo)).toEqual(solo.NEXT_RENDER);
});

// ── switching ──

test("/telltale agents edge: bottom closes the Pane, right/both open it, each invalidates; top stays unavailable", async () => {
  const eng = await boot();
  expect(await eng.fire("command.run", { command: "telltale", args: "agents edge" })).toEqual({ text: "agents edge: auto" });

  let before = eng.invalidations;
  expect(await eng.fire("command.run", { command: "telltale", args: "agents edge bottom" })).toEqual({ text: "agents edge: auto → bottom" });
  expect(eng.store["edge.agents"]).toBe("bottom");
  expect(eng.opened).toEqual([]);
  expect(eng.calls["$.ui.close"]).toBe(1);
  expect(eng.invalidations).toBeGreaterThan(before);

  before = eng.invalidations;
  expect(await eng.fire("command.run", { command: "telltale", args: "agents edge both" })).toEqual({ text: "agents edge: bottom → both" });
  expect(eng.opened).toEqual(["telltale"]);
  expect(eng.invalidations).toBeGreaterThan(before);

  const opens = eng.calls["$.ui.open"]!;
  expect(await eng.fire("command.run", { command: "telltale", args: "agents edge top" })).toEqual({ text: "agents edge top: not available in this build" });
  expect(eng.store["edge.agents"]).toBe("both");
  expect(eng.calls["$.ui.open"]).toBe(opens);
});

test("ui.message edge writes the same key and does the same open/close", async () => {
  const eng = await boot();
  await eng.fire("ui.message", { data: { kind: "edge", id: "agents", value: "bottom" } });
  expect(eng.store["edge.agents"]).toBe("bottom");
  expect(eng.opened).toEqual([]);
  await eng.fire("ui.message", { data: { kind: "edge", id: "agents", value: "right" } });
  expect(eng.store["edge.agents"]).toBe("right");
  expect(eng.opened).toEqual(["telltale"]);
});

// ── buttons ──

test("buttonStrip: an edge value adds [R B RB] between [S C F] and [x]; RB spans two glyphs plus one", () => {
  const buttons: TitleButtons = { style: "v1", size: "full", edge: "both" };
  const strip = buttonStrip("agents", buttons, "agents", 80)!;
  expect(strip.text).toBe("[1 2 3] [S C F] [R B RB] [x]");
  expect(strip.x0).toBe(48);
  const edgeSpans = strip.spans.filter((s) => s.message.kind === "edge");
  expect(edgeSpans).toEqual([
    { x0: 65, x1: 66, text: "R", active: false, message: { kind: "edge", id: "agents", value: "right" } },
    { x0: 67, x1: 68, text: "B", active: false, message: { kind: "edge", id: "agents", value: "bottom" } },
    { x0: 69, x1: 71, text: "RB", active: true, message: { kind: "edge", id: "agents", value: "both" } },
  ]);
  expect(strip.spans.at(-1)).toEqual({ x0: 74, x1: 75, text: "x", active: false, message: { kind: "clear", id: "agents" } });
});

test("resolveTitleClick on R / B / RB posts edge messages", () => {
  const panel = { id: "agents", label: "agents", rows: 3, lines: [], at: null, error: null, stages: true, buttons: { style: "v1", size: "full", edge: "right" } as TitleButtons };
  const props: BandProps = { columnsHint: 80, total: 5, panels: [panel], dropped: [], now: 0, status: false };
  expect(resolveTitleClick(1, 65, props, 80)).toEqual({ kind: "edge", id: "agents", value: "right" });
  expect(resolveTitleClick(1, 68, props, 80)).toEqual({ kind: "edge", id: "agents", value: "bottom" });
  expect(resolveTitleClick(1, 71, props, 80)).toEqual({ kind: "edge", id: "agents", value: "both" });
  expect(resolveTitleClick(1, 74, props, 80)).toEqual({ kind: "clear", id: "agents" });
});

test("register attaches buttons.edge = the current edge (right when unset)", async () => {
  const unset = await boot({}, [agents]);
  const a = (clientOf(await renderPane(unset))!.props.props as BandProps).panels[0]!;
  expect(a.buttons).toEqual({ style: "v2", size: "compact", edge: "right" });
  const both = await boot({ "edge.agents": "both" }, [agents]);
  expect((clientOf(await renderPane(both))!.props.props as BandProps).panels[0]!.buttons!.edge).toBe("both");
});
