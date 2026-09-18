// Ticket 24: agents title-row buttons ([1 2 3] [S C F] [x]) and the placement-derived
// default style. SDD §2.8 "標題列按鍵" / "樣式預設依 placement", DESIGN §4/§5. Exact match.
// Band() itself runs on the drawing thread; `buttonStrip` is the single source of
// button coordinates for both drawing and hit-testing (same rule as `rowsOf`).
import { expect, test } from "bun:test";
import { clientOf, fakeEngine } from "./harness";
import { TITLE_RESERVE, buttonStrip, resolveTitleClick, type BandProps, type TitleButtons } from "../../plugins/telltale/hooks/hit";
import { makeRegister } from "../../plugins/telltale/hooks/register";
import { agents } from "../../plugins/telltale/hooks/panels/agents";
import { hello } from "../../plugins/telltale/hooks/panels/hello";
import type { Cell } from "../../plugins/telltale/hooks/cells";

// ── pure: buttonStrip / resolveTitleClick ──

const BTN: TitleButtons = { style: "v1", size: "full" };
const agentsPanel = { id: "agents", label: "agents", rows: 3, lines: [], at: null, error: null, stages: true, buttons: BTN };
const helloPanel = { id: "hello", label: "hello", rows: 1, lines: [{ text: "hi" }], at: null, error: null };
// rows: 0 band title, 1 agents title, 2-4 agents content, 5 hello title, 6 hello content
const props: BandProps = {
  columnsHint: 80,
  total: 1 + (1 + 3) + (1 + 1),
  panels: [agentsPanel, helloPanel],
  dropped: [],
  now: 0,
  status: false,
};
const STRIP = "[1 2 3] [S C F] [x]"; // 19 columns
// right-aligned: last column = columns - TITLE_RESERVE - 1 = 75 at 80 columns -> x0 = 57
const X0 = 80 - TITLE_RESERVE - 1 - (STRIP.length - 1);

test("buttonStrip: right-aligned strip, one span per button, active follows the effective style/size (exact)", () => {
  const strip = buttonStrip("agents", BTN, "agents", 80);
  expect(strip).not.toBeNull();
  expect(X0).toBe(57);
  expect(strip!.x0).toBe(57);
  expect(strip!.text).toBe(STRIP);
  expect(strip!.spans).toEqual([
    { x0: 58, x1: 59, text: "1", active: true, message: { kind: "style", id: "agents", value: "v1" } },
    { x0: 60, x1: 61, text: "2", active: false, message: { kind: "style", id: "agents", value: "v2" } },
    { x0: 62, x1: 63, text: "3", active: false, message: { kind: "style", id: "agents", value: "v4" } },
    { x0: 66, x1: 67, text: "S", active: false, message: { kind: "size", id: "agents", value: "summary" } },
    { x0: 68, x1: 69, text: "C", active: false, message: { kind: "size", id: "agents", value: "compact" } },
    { x0: 70, x1: 71, text: "F", active: true, message: { kind: "size", id: "agents", value: "full" } },
    { x0: 74, x1: 75, text: "x", active: false, message: { kind: "clear", id: "agents" } },
  ]);
});

test("buttonStrip: active flags move with the effective style/size", () => {
  const strip = buttonStrip("agents", { style: "v4", size: "compact" }, "agents", 80)!;
  expect(strip.spans.filter((s) => s.active).map((s) => s.text)).toEqual(["3", "C"]);
});

test("buttonStrip: too narrow to hold head + strip -> null (whole strip or nothing)", () => {
  // head "─ agents ─" is 10 columns; the strip needs x0 >= 11.
  // 34 columns: x1 = 29, x0 = 11 -> fits. 33 columns: x0 = 10 -> null.
  expect(buttonStrip("agents", BTN, "agents", 34)).not.toBeNull();
  expect(buttonStrip("agents", BTN, "agents", 34)!.x0).toBe(11);
  expect(buttonStrip("agents", BTN, "agents", 33)).toBeNull();
});

test("resolveTitleClick: a button column posts that button's message", () => {
  expect(resolveTitleClick(1, 58, props, 80)).toEqual({ kind: "style", id: "agents", value: "v1" });
  expect(resolveTitleClick(1, 61, props, 80)).toEqual({ kind: "style", id: "agents", value: "v2" });
  expect(resolveTitleClick(1, 62, props, 80)).toEqual({ kind: "style", id: "agents", value: "v4" });
  expect(resolveTitleClick(1, 66, props, 80)).toEqual({ kind: "size", id: "agents", value: "summary" });
  expect(resolveTitleClick(1, 68, props, 80)).toEqual({ kind: "size", id: "agents", value: "compact" });
  expect(resolveTitleClick(1, 70, props, 80)).toEqual({ kind: "size", id: "agents", value: "full" });
  expect(resolveTitleClick(1, 74, props, 80)).toEqual({ kind: "clear", id: "agents" });
  expect(resolveTitleClick(1, 75, props, 80)).toEqual({ kind: "clear", id: "agents" });
});

test("resolveTitleClick: the rest of a staged title row still cycles the stage; brackets are not buttons", () => {
  expect(resolveTitleClick(1, 5, props, 80)).toEqual({ kind: "stage", id: "agents" });
  expect(resolveTitleClick(1, 57, props, 80)).toEqual({ kind: "stage", id: "agents" }); // "["
  expect(resolveTitleClick(1, 64, props, 80)).toEqual({ kind: "stage", id: "agents" }); // "]"
});

test("resolveTitleClick: panels without buttons toggle; band title, content rows and the dead zone hit nothing", () => {
  expect(resolveTitleClick(5, 10, props, 80)).toEqual({ kind: "toggle", id: "hello" });
  expect(resolveTitleClick(0, 58, props, 80)).toBeNull();
  expect(resolveTitleClick(2, 58, props, 80)).toBeNull();
  expect(resolveTitleClick(1, 76, props, 80)).toBeNull(); // TITLE_RESERVE dead zone
});

// ── register.tsx: ui.message kinds style/size/clear, placement default, command `auto` ──

const cell = (id: string, status: Cell["status"]): Cell => ({
  id,
  kind: "sub",
  label: "sub",
  desc: "",
  status,
  firstAt: 0,
  updatedAt: 0,
  steps: [],
});

const boot = async (store: Record<string, unknown> = {}, panels = [agents]) => {
  const eng = fakeEngine({ store: { panels: { agents: true }, ...store } });
  const reg = makeRegister(panels);
  reg(eng.on, {});
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

const renderPane = (eng: ReturnType<typeof fakeEngine>, placement: "dock" | "inline") =>
  eng.fire("ui.render", {
    surface: "terminal",
    component: "Pane",
    requestId: "r2",
    viewport: { columns: 100, rows: 40 },
    props: { title: "telltale", isFocused: false, bodyColumns: 100, placement, scroll: { offset: 0, bodyRows: 30 }, view: {} },
  });

const agentsOf = (tree: unknown) => {
  const c = clientOf(tree);
  expect(c).not.toBeNull();
  const p = c!.props.props as BandProps;
  const a = p.panels.find((x) => x.id === "agents") as (BandProps["panels"][number] & { style?: string }) | undefined;
  expect(a).toBeDefined();
  return a!;
};

test("ui.message style writes style.agents and invalidates (same key as /telltale agents style)", async () => {
  const eng = await boot();
  const before = eng.invalidations;
  await eng.fire("ui.message", { data: { kind: "style", id: "agents", value: "v4" } });
  expect(eng.store["style.agents"]).toBe("v4");
  expect(eng.invalidations).toBeGreaterThan(before);
});

test("ui.message size sets the stage directly (not a cycle); ignored on a panel without stages", async () => {
  const eng = await boot({}, [agents, hello]);
  await eng.fire("ui.message", { data: { kind: "size", id: "agents", value: "summary" } });
  expect(eng.store["size.agents"]).toBe("summary");
  await eng.fire("ui.message", { data: { kind: "size", id: "agents", value: "summary" } });
  expect(eng.store["size.agents"]).toBe("summary"); // a cycle would have moved to compact
  await eng.fire("ui.message", { data: { kind: "size", id: "hello", value: "full" } });
  expect(eng.store["size.hello"]).toBeUndefined();
});

test("ui.message clear drops failed/killed/orphan cells, keeps the rest (same as /telltale agents clear)", async () => {
  const eng = await boot();
  eng.store["agents.cells.s1"] = { a: cell("a", "failed"), b: cell("b", "running"), c: cell("c", "orphan") };
  await eng.fire("ui.message", { data: { kind: "clear", id: "agents" } });
  expect(Object.keys(eng.store["agents.cells.s1"] as Record<string, Cell>)).toEqual(["b"]);
});

test("default style follows placement: AbovePrompt/inline -> v1, docked Pane -> v2; buttons.style is the effective one", async () => {
  const eng = await boot();
  const above = agentsOf(await renderAbove(eng));
  expect(above.style).toBe("v1");
  expect(above.buttons).toEqual({ style: "v1", size: "full", edge: "right" });
  const docked = agentsOf(await renderPane(eng, "dock"));
  expect(docked.style).toBe("v2");
  expect(docked.buttons!.style).toBe("v2");
  const inline = agentsOf(await renderPane(eng, "inline"));
  expect(inline.style).toBe("v1");
});

test("a stored style wins over placement; a stored 'auto' means placement again", async () => {
  const eng = await boot({ "style.agents": "v4" });
  expect(agentsOf(await renderPane(eng, "dock")).style).toBe("v4");
  expect(agentsOf(await renderAbove(eng)).style).toBe("v4");
  eng.store["style.agents"] = "auto";
  expect(agentsOf(await renderPane(eng, "dock")).style).toBe("v2");
});

test("buttons.size mirrors size.agents", async () => {
  const eng = await boot({ "size.agents": "compact" });
  expect(agentsOf(await renderAbove(eng)).buttons!.size).toBe("compact");
});

test("/telltale agents style reports 'auto' when nothing is stored; setting from auto reports auto → v1; 'auto' is settable", async () => {
  const eng = await boot();
  expect(await eng.fire("command.run", { command: "telltale", args: "agents style" })).toEqual({ text: "agents style: auto" });
  expect(await eng.fire("command.run", { command: "telltale", args: "agents style v1" })).toEqual({ text: "agents style: auto → v1" });
  expect(eng.store["style.agents"]).toBe("v1");
  expect(await eng.fire("command.run", { command: "telltale", args: "agents style auto" })).toEqual({ text: "agents style: v1 → auto" });
  expect(eng.store["style.agents"]).toBe("auto");
});
