// hooks module. SDD §1.4, §3. The only place in this plugin that touches `$`.
// Allowed `$` calls (00-共同規則 / SDD §1.4): $.ui.resolve, $.ui.invalidate,
// $.clock.now, $.clock.every, $.store.get, $.store.set, $.command.register,
// $.agent.list, $.env.get.

import type { On, PluginOptions, Register } from "claude-code";
import { runTelltale, type AgentsView, type TelltaleState } from "./command";
import { BAND_ROWS_MAX, layout, MIN_COLUMNS, nextStage, rowsForStage, type Stage, type Stages } from "./layout";
import type { BandPanel, BandProps } from "./hit";
import type { Panel } from "./panel";
import { onRow } from "./panels/agents";
import {
  applySpinner,
  applyTaskNotification,
  applyTurnComplete,
  applyTurnStart,
  applyTurnStep,
  type Cells,
  type PendingSpawn,
} from "./observe";

// The band's props are owned by hit.ts (pure); re-exported here so tests and band.tsx share one shape.
export type { BandPanel, BandProps };
import { PANELS } from "./panels/index";

// SDD §3: a poll result whose JSON encoding exceeds this is dropped, not stored.
const DATA_MAX_BYTES = 64 * 1024;

type ToggleMessage = { kind: "toggle"; id: string };
type StageMessage = { kind: "stage"; id: string };
type RowMessage = { kind: "row"; id: string; hit: string };

const isToggle = (data: unknown): data is ToggleMessage =>
  typeof data === "object" &&
  data !== null &&
  (data as { kind?: unknown }).kind === "toggle" &&
  typeof (data as { id?: unknown }).id === "string";

const isStageMessage = (data: unknown): data is StageMessage =>
  typeof data === "object" &&
  data !== null &&
  (data as { kind?: unknown }).kind === "stage" &&
  typeof (data as { id?: unknown }).id === "string";

const isRowMessage = (data: unknown): data is RowMessage =>
  typeof data === "object" &&
  data !== null &&
  (data as { kind?: unknown }).kind === "row" &&
  typeof (data as { id?: unknown }).id === "string" &&
  typeof (data as { hit?: unknown }).hit === "string";

const stagesOf = (p: Panel): Stages | undefined => p.stages;

// Ticket 16: shared by both `ui.render` sites (AbovePrompt and Pane) —
// the same `props` algorithm regardless of which surface ends up drawing
// it, only `maxRows`/`viewport.columns` differ per call site. A top-level
// function declaration, not a closure inside `registerHooks`: `claude
// plugin validate --strict` only follows `$` into a function named at the
// top of this file (see `registerHooks`'s own comment on the same rule),
// so `active` is threaded in as a parameter instead of being read from a
// closure.
// `$`'s exact type is whatever the caller's own hook parameter infers to
// (AbovePrompt's and Pane's differ only in fields this function never
// touches, plus there's no `tsc` step in this repo's checks — see
// 00-共同規則); left as `any` rather than re-deriving a shared alias.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildBandProps(active: readonly Panel[], $: any, maxRows: number, viewportColumns: number | undefined): Promise<BandProps> {
  const byId = new Map(active.map((p) => [p.id, p] as const));
  const panelsState = ((await $.store.get("panels")) as Record<string, boolean> | undefined) ?? {};
  const wants = await Promise.all(
    active
      .filter((p) => panelsState[p.id] ?? p.defaultOn)
      .map(async (p) => {
        if (!stagesOf(p)) return { id: p.id, minRows: p.minRows, wantRows: p.wantRows };
        const stage = ((await $.store.get(`size.${p.id}`)) as Stage | undefined) ?? p.defaultStage ?? "compact";
        const { minRows, wantRows } = rowsForStage(stage);
        return { id: p.id, minRows, wantRows };
      }),
  );

  const { slots, dropped, total } = layout(wants, maxRows);
  const columnsForView = Math.max(MIN_COLUMNS, viewportColumns ?? 80);
  const now = await $.clock.now();

  const bandPanels = await Promise.all(
    slots.map(async (slot) => {
      const p = byId.get(slot.id)!;
      const error = ((await $.store.get(`error.${p.id}`)) as string | undefined) ?? "";

      // Ticket 17 (票 16 遺留接線 item 2): the agents panel's poll result
      // lives at the `agents.cells` key, not `data.agents` like every other
      // panel (register.tsx's own tick loop writes it there — see below) —
      // so its `view()` is fed straight from that key instead of the
      // shared `data.<id>` cache.
      if (p.id === "agents") {
        const cells = ((await $.store.get("agents.cells")) as Record<string, import("./cells").Cell> | undefined) ?? {};
        const style = ((await $.store.get("style.agents")) as "v1" | "v2" | "v4" | undefined) ?? "v1";
        const view = p.view(cells, columnsForView, slot.rows) as { kind?: string; cells?: unknown };
        return {
          id: p.id,
          label: p.label,
          rows: slot.rows,
          lines: [],
          ...(view.kind === "cells" ? { cells: view.cells, style } : {}),
          at: null,
          error: error === "" ? null : error,
          stages: Boolean(stagesOf(p)),
        } as unknown as BandPanel;
      }

      const cached = (await $.store.get(`data.${p.id}`)) as { at: number; data: unknown } | undefined;
      const view = p.view(cached?.data, columnsForView, slot.rows) as { lines: BandPanel["lines"] };
      return {
        id: p.id,
        label: p.label,
        rows: slot.rows,
        lines: view.lines,
        at: cached?.at ?? null,
        error: error === "" ? null : error,
        stages: Boolean(stagesOf(p)),
      };
    }),
  );

  return {
            columnsHint: viewportColumns ?? 80,
            total,
            panels: bandPanels,
            dropped,
            now,
          } satisfies BandProps;
}

// Ticket 13 §2.7: hello/clock are dev-only scaffolding, gated behind
// `TELLTALE_DEV=1`. A panel doesn't know this about itself (framework
// policy, not panel data) — see `Panel<D>` in panel.ts, which has no such flag.
const DEV_ONLY_PANEL_IDS = new Set(["hello", "clock"]);

// `claude plugin validate --strict` requires the exported `register`'s own
// declaration to be a literal function that hands `on` straight to a
// function named at the top of this file — not to the result of calling a
// factory (`makeRegister(PANELS)` fails: "register is exported as something
// other than a const function"). So the actual `on(...)` wiring lives in
// this plain top-level function, and both `register` and `makeRegister`
// below just forward into it with a different `panels` list.
const registerHooks = (panels: readonly Panel[], on: On, options: PluginOptions): void => {
  // Ticket 13 §2.7: which panels are live this session — everything until
  // `TELLTALE_DEV=1` is checked in session.start, then narrowed. `$` only
  // exists inside a hook (SDD §2.7's "register 時讀" is imprecise — flagged
  // to the parent), so this starts as the full list and session.start
  // narrows it before anything else runs.
  let active: readonly Panel[] = panels;
  const byId = (): Map<string, Panel> => new Map(active.map((p) => [p.id, p] as const));

  // Ticket 12 §2.6a: spawns seen via turn.step's Agent tool uses, kept in
  // memory (not `$.store` — SDD §2.6) until the agents panel's poll pairs
  // them up against `$.agent.list()`.
  let pendingSpawns: PendingSpawn[] = [];
  const takePending = (): PendingSpawn[] => {
    const out = pendingSpawns;
    pendingSpawns = [];
    return out;
  };

  on("session.start", async ($, e, next) => {
    const dev = await $.env.get("TELLTALE_DEV");
    active = panels.filter((p) => !DEV_ONLY_PANEL_IDS.has(p.id) || dev === "1");

    const existing = (await $.store.get("panels")) as Record<string, boolean> | undefined;
    const panelsState: Record<string, boolean> = { ...existing };
    for (const p of active) {
      if (!(p.id in panelsState)) {
        const seed = options[`panel_${p.id}`];
        panelsState[p.id] = typeof seed === "boolean" ? seed : p.defaultOn;
      }
    }
    await $.store.set("panels", panelsState);

    // Ticket 21: a new session has no live task to show — cells left by a
    // previous session (including its bg tasks) are stale, not resumable.
    await $.store.set("agents.cells", {});

    await $.command.register({
      name: "telltale",
      description: "Toggle panels, or show what the band is doing",
      argumentHint: "[status|help|on|off|<panel> [on|off]]",
    });

    // Ticket 16 (DESIGN §6 item 4 / SDD §2.5): ask the engine to open a Pane
    // for the band once the agents panel is live, so the same `Band` Client
    // can be dock-placed (≥ some width) instead of always sitting above the
    // prompt. The engine — not this plugin — decides which of the two
    // `ui.render` sites below actually draws (Pane docked vs. AbovePrompt).
    if (active.some((p) => p.id === "agents")) {
      await $.ui.open({ id: "telltale", title: "telltale" });
    }

    for (const p of active) {
      if (!p.poll) continue;
      // Named after the panel id so fakeEngine's `tick(id)` can find this
      // exact closure again later (SDD §4 test harness; no 8th `$` op needed).
      const runTick = Object.defineProperty(
        async (): Promise<void> => {
          try {
            // Model pairing (§2.6 step 3): an unmatched pending spawn isn't
            // dropped this tick — whatever `poll` leaves in `pendingThisTick`
            // (agents.ts's `applyModelPairing` splices it as it consumes
            // entries) goes back onto the shared queue below.
            const pendingThisTick = p.needsAgents ? takePending() : [];
            const io = p.needsAgents
              ? {
                  now: () => $.clock.now(),
                  agents: () => $.agent.list(),
                  cells: async () => ((await $.store.get("agents.cells")) as Cells | undefined) ?? {},
                  takePending: () => pendingThisTick,
                }
              : { now: () => $.clock.now() };
            const data = await p.poll!(io);
            if (p.needsAgents) pendingSpawns.unshift(...pendingThisTick);
            if (p.id === "agents") {
              // §2.1: the agents panel's poll result IS `agents.cells`, not
              // `data.agents` — no 64 KiB check, no `error.agents` (a poll
              // failure just throws and the catch below handles it).
              await $.store.set("agents.cells", data);
            } else {
              const bytes = new TextEncoder().encode(JSON.stringify(data)).length;
              if (bytes > DATA_MAX_BYTES) {
                await $.store.set(`error.${p.id}`, "data too large");
              } else {
                await $.store.set(`data.${p.id}`, { at: await $.clock.now(), data });
                await $.store.set(`error.${p.id}`, "");
              }
            }
          } catch (err) {
            await $.store.set(`error.${p.id}`, String(err instanceof Error ? err.message : err));
          }
          $.ui.invalidate("ui.render");
        },
        "name",
        { value: p.id, configurable: true },
      );
      await runTick();
      $.clock.every(p.everyMs ?? 1000, runTick);
    }

    return next(e);
  });

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e);

    const viewportColumns = (e.viewport as { columns?: number } | undefined)?.columns;
    const props = await buildBandProps(active, $, e.props.maxRows as number, viewportColumns);

    const { Client } = $.ui.resolve(e);
    return <Client key="band" module="./band.tsx" props={props} />;
  });

  // Ticket 16: the docked-Pane path (SDD §2.5 / DESIGN §6 item 4). The
  // engine gives a Pane's body its own `bodyColumns`, not the terminal
  // width — read from `e.viewport.columns` the same way AbovePrompt does;
  // `claude-code.d.ts`'s `Pane` documents this as what a `ui.render` for
  // `{ component: "Pane" }` receives. No `maxRows` ceiling from the engine
  // here (a Pane isn't sharing rows with the transcript the way AbovePrompt
  // shares them with the prompt), so this uses the same `BAND_ROWS_MAX`
  // ceiling `command.run` already uses when it has no live viewport either.
  on("ui.render", { component: "Pane" }, async ($, e) => {
    const viewportColumns = (e.viewport as { columns?: number } | undefined)?.columns;
    const props = await buildBandProps(active, $, BAND_ROWS_MAX, viewportColumns);

    const { Client } = $.ui.resolve(e);
    return <Client key="band" module="./band.tsx" props={props} />;
  });

  on("ui.message", async ($, e, next) => {
    const data = (e as { data?: unknown }).data;
    const idx = byId();
    if (isToggle(data) && idx.has(data.id)) {
      const current = ((await $.store.get("panels")) as Record<string, boolean> | undefined) ?? {};
      current[data.id] = !(current[data.id] ?? idx.get(data.id)!.defaultOn);
      await $.store.set("panels", current);
      $.ui.invalidate("ui.render");
    } else if (isStageMessage(data) && idx.has(data.id)) {
      const p = idx.get(data.id)!;
      // A panel without `stages` isn't reachable via titleClickKind's "stage"
      // branch in the real client, but ignore it defensively here too.
      if (stagesOf(p)) {
        const key = `size.${data.id}`;
        const current = ((await $.store.get(key)) as Stage | undefined) ?? p.defaultStage ?? "compact";
        // Named `toStage`, not `next`: that identifier is reserved by the
        // hook's own continuation parameter (`claude plugin validate --strict`
        // rejects shadowing it).
        const toStage = nextStage(current);
        await $.store.set(`size.${data.id}`, toStage);
        $.ui.invalidate("ui.render");
      }
    } else if (isRowMessage(data) && data.id === "agents") {
      // Ticket 17 (SDD §2.6 "onRow"): a cell click, dispatched to the
      // agents panel's own pure `onRow` — this hook only reads/writes the
      // store keys it touches.
      const cells = ((await $.store.get("agents.cells")) as Cells | undefined) ?? {};
      const now = await $.clock.now();
      const { cells: updated, expanded } = onRow(data.hit, cells, now);
      await $.store.set("agents.cells", updated);
      await $.store.set("agents.expanded", expanded);
      $.ui.invalidate("ui.render");
    }
    return next(e);
  });

  on("command.run", { command: "telltale" }, async ($, e) => {
    const panelsState = ((await $.store.get("panels")) as Record<string, boolean> | undefined) ?? {};
    const wants = active
      .filter((p) => panelsState[p.id] ?? p.defaultOn)
      .map((p) => ({ id: p.id, minRows: p.minRows, wantRows: p.wantRows }));
    // No live viewport reaches a command.run hook, so the band line reports
    // against the framework's own ceiling (BAND_ROWS_MAX) rather than a
    // terminal size it doesn't have.
    const { slots, dropped, total } = layout(wants, BAND_ROWS_MAX);
    const sizes: Record<string, Stage> = Object.fromEntries(
      await Promise.all(
        active
          .filter((p) => stagesOf(p))
          .map(async (p) => [p.id, ((await $.store.get(`size.${p.id}`)) as Stage | undefined) ?? p.defaultStage ?? "compact"] as const),
      ),
    );
    // Ticket 17: `agents *` sub-commands need the panel's own current
    // style/edge/size/cells — only fetched when the panel is actually
    // registered (SDD §1.6 v0.2 table).
    const agentsPanel = active.find((p) => p.id === "agents");
    const agentsView: AgentsView | undefined = agentsPanel
      ? {
          style: ((await $.store.get("style.agents")) as AgentsView["style"] | undefined) ?? "v2",
          edge: ((await $.store.get("edge.agents")) as AgentsView["edge"] | undefined) ?? "right",
          size: ((await $.store.get("size.agents")) as AgentsView["size"] | undefined) ?? agentsPanel.defaultStage ?? "compact",
          cells: ((await $.store.get("agents.cells")) as Cells | undefined) ?? {},
        }
      : undefined;

    const state: TelltaleState = {
      order: active.map((p) => ({ id: p.id, label: p.label, stages: Boolean(stagesOf(p)), defaultStage: p.defaultStage })),
      panels: panelsState,
      sizes,
      layout: { slots, dropped, total },
      available: BAND_ROWS_MAX,
      agentsView,
    };

    const result = runTelltale((e as { args?: string }).args ?? "", state);
    // A single invalidate for however many of panels/sizes/writes actually
    // changed (ticket 17: don't invalidate twice just because two of them did).
    let changed = false;
    if (result.panels !== state.panels) {
      await $.store.set("panels", result.panels);
      changed = true;
    }
    if (result.sizes !== state.sizes) {
      for (const [id, stage] of Object.entries(result.sizes)) {
        if (state.sizes[id] !== stage) {
          await $.store.set(`size.${id}`, stage);
        }
      }
      changed = true;
    }
    if (result.writes) {
      for (const [key, value] of Object.entries(result.writes)) {
        await $.store.set(key, value);
      }
      changed = true;
    }
    if (changed) $.ui.invalidate("ui.render");
    return { text: result.text };
  });

  // Ticket 12: observation-only hooks writing `agents.cells` (SDD §2.6/§2.6a).
  // None of these change what the model or the user sees (I13) — each reads
  // the store, applies a pure `observe.ts` function, writes it back, and
  // (except Spinner, which never invalidates) invalidates the render.

  on("turn.start", async ($, e, next) => {
    const input = e as { turnId: string; text: string };
    const cells = ((await $.store.get("agents.cells")) as Cells | undefined) ?? {};
    await $.store.set("agents.cells", applyTurnStart(cells, input, await $.clock.now()));
    $.ui.invalidate("ui.render");
    return next(e);
  });

  // turn.step is the one streaming event (claude-code.d.ts `StreamingEventName`):
  // `validate --strict` refuses a plain async function here — "turn.step
  // streams, so it takes async function* ($, e, next)". `yield* next(e)`
  // both passes every chunk through unread and evaluates to the whole
  // response once the stream ends, so it plays the same role the ticket's
  // "await next(e) first, use the result" plan does for a non-streaming hook.
  on("turn.step", async function* ($, e, next) {
    // Type pitfall (see 12-觀察hooks.md): `toolUses` lives on next(e)'s
    // RESULT, not on the input `e` — so next(e) is drained first.
    const result = yield* next(e);
    const input = e as { turnId: string; agentId?: string };
    const stepResult = result as { toolUses: readonly { name: string; input: unknown }[] };
    const cells = ((await $.store.get("agents.cells")) as Cells | undefined) ?? {};
    const { cells: updated, pending } = applyTurnStep(
      cells,
      { turnId: input.turnId, agentId: input.agentId, toolUses: stepResult.toolUses },
      await $.clock.now(),
    );
    await $.store.set("agents.cells", updated);
    pendingSpawns.push(...pending);
    $.ui.invalidate("ui.render");
    return result;
  });

  on("turn.complete", async ($, e, next) => {
    const input = e as { turnId: string; agentId?: string };
    const cells = ((await $.store.get("agents.cells")) as Cells | undefined) ?? {};
    await $.store.set("agents.cells", applyTurnComplete(cells, input, await $.clock.now()));
    $.ui.invalidate("ui.render");
    return next(e);
  });

  on("ui.render", { component: "Spinner" }, async ($, e, next) => {
    const input = e as { requestId: string; props: { mode: string } };
    const cells = ((await $.store.get("agents.cells")) as Cells | undefined) ?? {};
    const updated = applySpinner(
      cells,
      { requestId: input.requestId, mode: input.props.mode },
      await $.clock.now(),
    );
    await $.store.set("agents.cells", updated);
    // Spinner is the one hook here that never invalidates (DESIGN's breathe/
    // marquee redraw on their own clocks; a spinner tick alone isn't news).
    return next(e);
  });

  // Type pitfall 2 (see 12-觀察hooks.md): the matcher's `origin` is an
  // object `{ kind }`, not a bare string.
  on("session.receive", { origin: { kind: "task-notification" } }, async ($, e, next) => {
    const input = e as { text: string };
    const cells = ((await $.store.get("agents.cells")) as Cells | undefined) ?? {};
    await $.store.set("agents.cells", applyTaskNotification(cells, input.text, await $.clock.now()));
    $.ui.invalidate("ui.render");
    // What this (or a downstream) hook returns and what next(e) resolves to
    // is the delivery's `{ text }`; pass a rewrite down, keep an unchanged one.
    const passed = (await next(e)) as { text?: string };
    return { text: passed.text ?? input.text };
  });
};

export const makeRegister = (panels: readonly Panel[]): Register => (on, options) =>
  registerHooks(panels, on, options);

export const register: Register = (on, options) => registerHooks(PANELS, on, options);
