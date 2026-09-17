// hooks module. SDD §1.4, §3. The only place in this plugin that touches `$`.
// Allowed `$` calls (00-共同規則 / SDD §1.4): $.ui.resolve, $.ui.invalidate,
// $.clock.now, $.clock.every, $.store.get, $.store.set, $.command.register.

import type { On, PluginOptions, Register } from "claude-code";
import { runTelltale, type TelltaleState } from "./command";
import { BAND_ROWS_MAX, layout, MIN_COLUMNS } from "./layout";
import type { Panel } from "./panel";
import { PANELS } from "./panels/index";

// SDD §3: a poll result whose JSON encoding exceeds this is dropped, not stored.
const DATA_MAX_BYTES = 64 * 1024;

type ToggleMessage = { kind: "toggle"; id: string };

const isToggle = (data: unknown): data is ToggleMessage =>
  typeof data === "object" &&
  data !== null &&
  (data as { kind?: unknown }).kind === "toggle" &&
  typeof (data as { id?: unknown }).id === "string";

// `claude plugin validate --strict` requires the exported `register`'s own
// declaration to be a literal function that hands `on` straight to a
// function named at the top of this file — not to the result of calling a
// factory (`makeRegister(PANELS)` fails: "register is exported as something
// other than a const function"). So the actual `on(...)` wiring lives in
// this plain top-level function, and both `register` and `makeRegister`
// below just forward into it with a different `panels` list.
const registerHooks = (panels: readonly Panel[], on: On, options: PluginOptions): void => {
  const byId = new Map(panels.map((p) => [p.id, p] as const));

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
              await $.store.set(`data.${p.id}`, { at: $.clock.now(), data });
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
    const wants = panels
      .filter((p) => panelsState[p.id] ?? p.defaultOn)
      .map((p) => ({ id: p.id, minRows: p.minRows, wantRows: p.wantRows }));

    const { slots, dropped, total } = layout(wants, e.props.maxRows as number);
    const viewportColumns = (e.viewport as { columns?: number } | undefined)?.columns;
    const columnsForView = Math.max(MIN_COLUMNS, viewportColumns ?? 80);
    const now = $.clock.now();

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
        };
      }),
    );

    const { Client } = $.ui.resolve(e);
    return (
      <Client
        key="band"
        module="Band"
        props={{
          columnsHint: viewportColumns ?? 80,
          total,
          panels: bandPanels,
          dropped,
          now,
        }}
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
    const state: TelltaleState = {
      order: panels.map((p) => ({ id: p.id, label: p.label })),
      panels: panelsState,
      layout: { slots, dropped, total },
      available: BAND_ROWS_MAX,
    };

    const result = runTelltale((e as { args?: string }).args ?? "", state);
    if (result.panels !== state.panels) {
      await $.store.set("panels", result.panels);
      $.ui.invalidate("ui.render");
    }
    return { text: result.text };
  });
};

export const makeRegister = (panels: readonly Panel[]): Register => (on, options) =>
  registerHooks(panels, on, options);

export const register: Register = (on, options) => registerHooks(PANELS, on, options);
