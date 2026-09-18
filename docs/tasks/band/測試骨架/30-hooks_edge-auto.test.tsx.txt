// Ticket 29 + 30: with no stored edge, or an explicit `right`, the band keeps drawing above the
// prompt until the Pane actually renders, then yields (ticket 30: the R button on a host that never
// renders the Pane must not blank the band). SDD §2.8 "換邊 auto 退路". Exact.
import { expect, test } from "bun:test";
import { clientOf, fakeEngine } from "./harness";
import { effectiveEdge, runTelltale, type TelltaleState } from "../../plugins/telltale/hooks/command";
import type { BandProps } from "../../plugins/telltale/hooks/hit";
import { makeRegister } from "../../plugins/telltale/hooks/register";
import { agents } from "../../plugins/telltale/hooks/panels/agents";
import { hello } from "../../plugins/telltale/hooks/panels/hello";

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

test("effectiveEdge (pure): stored values win; auto/undefined follows whether the Pane has rendered", () => {
  expect(effectiveEdge(undefined, false)).toBe("bottom");
  expect(effectiveEdge(undefined, true)).toBe("right");
  expect(effectiveEdge("auto", false)).toBe("bottom");
  expect(effectiveEdge("auto", true)).toBe("right");
  expect(effectiveEdge("right", false)).toBe("bottom"); // ticket 30
  expect(effectiveEdge("right", true)).toBe("right");
  expect(effectiveEdge("bottom", true)).toBe("bottom");
  expect(effectiveEdge("both", false)).toBe("both");
});

test("nothing stored: session.start still asks for the Pane, and AbovePrompt draws every panel until the Pane renders", async () => {
  const eng = await boot();
  expect(eng.opened).toEqual(["telltale"]);
  expect(panelIds(await renderAbove(eng))).toEqual(["agents", "hello"]);
  expect(panelIds(await renderAbove(eng))).toEqual(["agents", "hello"]); // still, no Pane yet
});

test("nothing stored: once the Pane has rendered, AbovePrompt yields (and the first Pane render invalidates)", async () => {
  const eng = await boot();
  const before = eng.invalidations;
  expect(panelIds(await renderPane(eng))).toEqual(["agents", "hello"]);
  expect(eng.invalidations).toBeGreaterThan(before);
  expect(await renderAbove(eng)).toEqual(eng.NEXT_RENDER);
  const again = eng.invalidations;
  await renderPane(eng);
  expect(eng.invalidations).toBe(again); // only the first sighting invalidates
});

test("a stored 'auto' behaves exactly like nothing stored", async () => {
  const eng = await boot({ "edge.agents": "auto" });
  expect(panelIds(await renderAbove(eng))).toEqual(["agents", "hello"]);
  await renderPane(eng);
  expect(await renderAbove(eng)).toEqual(eng.NEXT_RENDER);
});

test("an explicit 'right' (ticket 30) also draws above the prompt until the Pane renders, then yields", async () => {
  const eng = await boot({ "edge.agents": "right" });
  expect(eng.opened).toEqual(["telltale"]);
  expect(panelIds(await renderAbove(eng))).toEqual(["agents", "hello"]);
  await renderPane(eng);
  expect(await renderAbove(eng)).toEqual(eng.NEXT_RENDER);
});

test("buttons.edge is the effective value: bottom before the Pane renders, right after", async () => {
  const eng = await boot({}, [agents]);
  const above = (clientOf(await renderAbove(eng))!.props.props as BandProps).panels[0]!;
  expect(above.buttons!.edge).toBe("bottom");
  const pane = (clientOf(await renderPane(eng))!.props.props as BandProps).panels[0]!;
  expect(pane.buttons!.edge).toBe("right");
});

test("/telltale agents edge reports auto when nothing is stored; 'auto' is settable and reopens the Pane", async () => {
  const eng = await boot({ "edge.agents": "bottom" });
  expect(eng.opened).toEqual([]);
  expect(await eng.fire("command.run", { command: "telltale", args: "agents edge" })).toEqual({ text: "agents edge: bottom" });
  expect(await eng.fire("command.run", { command: "telltale", args: "agents edge auto" })).toEqual({ text: "agents edge: bottom → auto" });
  expect(eng.store["edge.agents"]).toBe("auto");
  expect(eng.opened).toEqual(["telltale"]);
  const fresh = await boot();
  expect(await fresh.fire("command.run", { command: "telltale", args: "agents edge" })).toEqual({ text: "agents edge: auto" });
});

test("runTelltale (pure): agents edge from auto to right reports auto → right", () => {
  const state: TelltaleState = {
    order: [{ id: "agents", label: "agents" }],
    panels: { agents: true },
    layout: { slots: [{ id: "agents", rows: 3 }], dropped: [], total: 6 },
    available: 9,
    agentsView: { style: "auto", edge: "auto", size: "compact", cells: {} },
  };
  const r = runTelltale("agents edge right", state);
  expect(r.text).toBe("agents edge: auto → right");
  expect(r.writes).toEqual({ "edge.agents": "right" });
});
