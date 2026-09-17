// hooks module. SDD §1.4, §3. The only place in this plugin that touches `$`.
// Allowed `$` calls (00-共同規則 / SDD §1.4): $.ui.resolve, $.ui.invalidate,
// $.clock.now, $.clock.every, $.store.get, $.store.set, $.command.register.

import type { On, PluginOptions, Register } from "claude-code";
import { runTelltale, type TelltaleState } from "./command";
import { BAND_ROWS_MAX, layout, MIN_COLUMNS, nextStage, rowsForStage, type Stage, type Stages } from "./layout";
import type { BandPanel, BandProps } from "./hit";
import type { Panel } from "./panel";
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

// SDD §1.1a: `panel.ts`'s `Panel<D>` doesn't have a formal `stages` field yet
// (that lands with ticket 13 or later); until then, every read of it here
// goes through this assertion.
const stagesOf = (p: Panel): Stages | undefined => (p as { stages?: Stages }).stages;

// `claude plugin validate --strict` requires the exported `register`'s own
// declaration to be a literal function that hands `on` straight to a
// function named at the top of this file — not to the result of calling a
// factory (`makeRegister(PANELS)` fails: "register is exported as something
// other than a const function"). So the actual `on(...)` wiring lives in
// this plain top-level function, and both `register` and `makeRegister`
// below just forward into it with a different `panels` list.
const registerHooks = (panels: readonly Panel[], on: On, options: PluginOptions): void => {
  const byId = new Map(panels.map((p) => [p.id, p] as const));

  // Ticket 12 §2.6a: spawns seen via turn.step's Agent tool uses, kept in
  // memory (not `$.store` — SDD §2.6) until ticket 13's poll pairs them up
  // against `$.agent.list()`. Not consumed by this ticket; `takePending` is
  // declared here for ticket 13 to wire in.
  let pendingSpawns: PendingSpawn[] = [];
  const takePending = (): PendingSpawn[] => {
    const out = pendingSpawns;
    pendingSpawns = [];
    return out;
  };
  void takePending;

  on("session.start", async ($, e, next) => {
    const existing = (await $.store.get("panels")) as Record<string, boolean> | undefined;
    const panelsState: Record<string, boolean> = { ...existing };
    for (const p of panels) {
      if (!(p.id in panelsState)) {
        const seed = options[`panel_${p.id}`];
        panelsState[p.id] = typeof seed === "boolean" ? seed : p.defaultOn;
      }
    }
    await $.store.set("panels", panelsState);

    await $.command.register({
      name: "telltale",
      description: "Toggle panels, or show what the band is doing",
      argumentHint: "[status|help|on|off|<panel> [on|off]]",
    });

    for (const p of panels) {
      if (!p.poll) continue;
      // Named after the panel id so fakeEngine's `tick(id)` can find this
      // exact closure again later (SDD §4 test harness; no 8th `$` op needed).
      const runTick = Object.defineProperty(
        async (): Promise<void> => {
          try {
            const data = await p.poll!({ now: () => $.clock.now() });
            const bytes = new TextEncoder().encode(JSON.stringify(data)).length;
            if (bytes > DATA_MAX_BYTES) {
              await $.store.set(`error.${p.id}`, "data too large");
            } else {
              await $.store.set(`data.${p.id}`, { at: await $.clock.now(), data });
              await $.store.set(`error.${p.id}`, "");
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

    const panelsState = ((await $.store.get("panels")) as Record<string, boolean> | undefined) ?? {};
    const wants = await Promise.all(
      panels
        .filter((p) => panelsState[p.id] ?? p.defaultOn)
        .map(async (p) => {
          if (!stagesOf(p)) return { id: p.id, minRows: p.minRows, wantRows: p.wantRows };
          const stage = ((await $.store.get(`size.${p.id}`)) as Stage | undefined) ?? "compact";
          const { minRows, wantRows } = rowsForStage(stage);
          return { id: p.id, minRows, wantRows };
        }),
    );

    const { slots, dropped, total } = layout(wants, e.props.maxRows as number);
    const viewportColumns = (e.viewport as { columns?: number } | undefined)?.columns;
    const columnsForView = Math.max(MIN_COLUMNS, viewportColumns ?? 80);
    const now = await $.clock.now();

    const bandPanels = await Promise.all(
      slots.map(async (slot) => {
        const p = byId.get(slot.id)!;
        const cached = (await $.store.get(`data.${p.id}`)) as { at: number; data: unknown } | undefined;
        const error = ((await $.store.get(`error.${p.id}`)) as string | undefined) ?? "";
        const view = p.view(cached?.data, columnsForView, slot.rows);
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

    const { Client } = $.ui.resolve(e);
    return (
      <Client
        key="band"
        module="./band.tsx"
        props={
          {
            columnsHint: viewportColumns ?? 80,
            total,
            panels: bandPanels,
            dropped,
            now,
          } satisfies BandProps
        }
      />
    );
  });

  on("ui.message", async ($, e, next) => {
    const data = (e as { data?: unknown }).data;
    if (isToggle(data) && byId.has(data.id)) {
      const current = ((await $.store.get("panels")) as Record<string, boolean> | undefined) ?? {};
      current[data.id] = !(current[data.id] ?? byId.get(data.id)!.defaultOn);
      await $.store.set("panels", current);
      $.ui.invalidate("ui.render");
    } else if (isStageMessage(data) && byId.has(data.id)) {
      const p = byId.get(data.id)!;
      // A panel without `stages` isn't reachable via titleClickKind's "stage"
      // branch in the real client, but ignore it defensively here too.
      if (stagesOf(p)) {
        const key = `size.${data.id}`;
        const current = ((await $.store.get(key)) as Stage | undefined) ?? "compact";
        // Named `toStage`, not `next`: that identifier is reserved by the
        // hook's own continuation parameter (`claude plugin validate --strict`
        // rejects shadowing it).
        const toStage = nextStage(current);
        await $.store.set(`size.${data.id}`, toStage);
        $.ui.invalidate("ui.render");
      }
    }
    return next(e);
  });

  on("command.run", { command: "telltale" }, async ($, e) => {
    const panelsState = ((await $.store.get("panels")) as Record<string, boolean> | undefined) ?? {};
    const wants = panels
      .filter((p) => panelsState[p.id] ?? p.defaultOn)
      .map((p) => ({ id: p.id, minRows: p.minRows, wantRows: p.wantRows }));
    // No live viewport reaches a command.run hook, so the band line reports
    // against the framework's own ceiling (BAND_ROWS_MAX) rather than a
    // terminal size it doesn't have.
    const { slots, dropped, total } = layout(wants, BAND_ROWS_MAX);
    const sizes: Record<string, Stage> = Object.fromEntries(
      await Promise.all(
        panels
          .filter((p) => stagesOf(p))
          .map(async (p) => [p.id, ((await $.store.get(`size.${p.id}`)) as Stage | undefined) ?? "compact"] as const),
      ),
    );
    const state: TelltaleState = {
      order: panels.map((p) => ({ id: p.id, label: p.label, stages: Boolean(stagesOf(p)) })),
      panels: panelsState,
      sizes,
      layout: { slots, dropped, total },
      available: BAND_ROWS_MAX,
    };

    const result = runTelltale((e as { args?: string }).args ?? "", state);
    if (result.panels !== state.panels) {
      await $.store.set("panels", result.panels);
      $.ui.invalidate("ui.render");
    }
    if (result.sizes !== state.sizes) {
      for (const [id, stage] of Object.entries(result.sizes)) {
        if (state.sizes[id] !== stage) {
          await $.store.set(`size.${id}`, stage);
        }
      }
      $.ui.invalidate("ui.render");
    }
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
