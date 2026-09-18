// /telltale command: pure parser + formatter. SDD §1.6.
// Pure function only — no `claude-code` import, no `$`.

import { STAGE_ORDER, type Stage } from "./layout";
import type { Cell } from "./cells";

export type AgentsView = {
  style: "auto" | "v1" | "v2" | "v4";
  edge: "right" | "bottom" | "both";
  size: "summary" | "compact" | "full";
  cells: Record<string, Cell>;
};

export type TelltaleState = {
  order: { id: string; label: string; stages?: boolean; defaultStage?: Stage }[];
  panels: Record<string, boolean>;
  sizes: Record<string, Stage>;
  layout: { slots: { id: string; rows: number }[]; dropped: string[]; total: number };
  available: number;
  agentsView?: AgentsView; // ticket 17, SDD §1.6 v0.2 table
};

export type TelltaleResult = {
  text: string;
  panels: Record<string, boolean>;
  sizes: Record<string, Stage>;
  // Ticket 17: store keys `/telltale agents *` wrote (style.agents/edge.agents/
  // size.agents/agents.cells). Omitted entirely (not `{}`) when nothing changed.
  writes?: Record<string, unknown>;
};

// Keywords that never double as a panel id (SDD §1.6 table); a second token
// after one of these is always malformed, never "unknown panel <keyword>".
const RESERVED = new Set(["status", "help", "on", "off"]);

const word = (on: boolean): string => (on ? "on" : "off");

const knownIds = (state: TelltaleState): string => state.order.map((p) => p.id).join(", ");

const usage = (state: TelltaleState): TelltaleResult => ({
  text: `usage: /telltale [status|help|on|off|<panel> [on|off]]  panels: ${knownIds(state)}`,
  panels: state.panels,
  sizes: state.sizes,
});

const unknownPanel = (id: string, state: TelltaleState): TelltaleResult => ({
  text: `unknown panel "${id}"; known: ${knownIds(state)}`,
  panels: state.panels,
  sizes: state.sizes,
});

const statusLine = (id: string, label: string, state: TelltaleState): string => {
  const on = state.panels[id] ?? false;
  if (!on) return `○ ${label}  off`;
  if (state.layout.dropped.includes(id)) return `⋯ ${label}  on  dropped (height)`;
  const slot = state.layout.slots.find((s) => s.id === id);
  return `● ${label}  on   ${slot ? slot.rows : 0} rows`;
};

const statusText = (state: TelltaleState): string =>
  [
    ...state.order.map((p) => statusLine(p.id, p.label, state)),
    `band: ${state.layout.total} rows of ${state.available} available`,
  ].join("\n");

// The report line for one panel's before/after; `unchanged` is its own
// branch (not folded into the arrow case) — SDD §1.6 row 3.
const setLine = (id: string, from: boolean, to: boolean): string =>
  from === to ? `${id}: ${word(from)} (unchanged)` : `${id}: ${word(from)} → ${word(to)}`;

// Sets every panel in `order` to `to`. Reuses `state.panels` by reference
// when nothing actually changes, so callers (register.tsx) can tell a real
// change from a no-op with `result.panels !== state.panels`.
const setAll = (to: boolean, state: TelltaleState): TelltaleResult => {
  const lines = state.order.map((p) => setLine(p.id, state.panels[p.id] ?? false, to));
  const changed = state.order.some((p) => (state.panels[p.id] ?? false) !== to);
  const panels = changed
    ? { ...state.panels, ...Object.fromEntries(state.order.map((p) => [p.id, to])) }
    : state.panels;
  return { text: lines.join("\n"), panels, sizes: state.sizes };
};

const setOne = (id: string, to: boolean, state: TelltaleState): TelltaleResult => {
  const from = state.panels[id] ?? false;
  if (from === to) return { text: setLine(id, from, to), panels: state.panels, sizes: state.sizes };
  return { text: setLine(id, from, to), panels: { ...state.panels, [id]: to }, sizes: state.sizes };
};

const toggleOne = (id: string, state: TelltaleState): TelltaleResult => {
  const from = state.panels[id] ?? false;
  const to = !from;
  return { text: setLine(id, from, to), panels: { ...state.panels, [id]: to }, sizes: state.sizes };
};

// SDD §1.6 v0.2 addition: `<id> size` reports the current stage, `<id> size
// <stage>` sets it. Only meaningful for panels that declared `stages`.
const sizeStatus = (id: string, state: TelltaleState): TelltaleResult => {
  const panel = state.order.find((p) => p.id === id);
  if (!panel?.stages) return usage(state);
  const current = state.sizes[id] ?? panel.defaultStage ?? "compact";
  return { text: `${id}: size ${current}`, panels: state.panels, sizes: state.sizes };
};

const sizeSet = (id: string, to: Stage, state: TelltaleState): TelltaleResult => {
  const panel = state.order.find((p) => p.id === id);
  if (!panel?.stages) return usage(state);
  const from = state.sizes[id] ?? panel.defaultStage ?? "compact";
  if (from === to) return { text: `${id}: size ${from} (unchanged)`, panels: state.panels, sizes: state.sizes };
  return { text: `${id}: size ${from} → ${to}`, panels: state.panels, sizes: { ...state.sizes, [id]: to } };
};

// SDD §1.6 v0.2 table. `agents style|edge|size` report or set one of the
// three `*.agents` store keys; `agents clear` drops dismissable cells.
// v0.2b (票 24): "auto" is a settable value too — `agents style auto` puts
// the effective style back under placement's control (register.tsx).
const AGENTS_STYLES = ["auto", "v1", "v2", "v4"] as const;
const AGENTS_SIZES = ["summary", "compact", "full"] as const;
const CLEARABLE = new Set(["failed", "killed", "orphan"]);

// Ticket 24: the same filter backs both `/telltale agents clear` (below)
// and the title-row `[x]` button's `ui.message` handler (register.tsx) —
// one piece of knowledge, so it's exported instead of copied.
export const clearDismissable = (cells: Record<string, Cell>): Record<string, Cell> =>
  Object.fromEntries(Object.entries(cells).filter(([, c]) => !CLEARABLE.has(c.status)));

const agentsSet = (key: string, label: string, from: string, to: string, state: TelltaleState): TelltaleResult => {
  if (from === to) return { text: `agents ${label}: ${from} (unchanged)`, panels: state.panels, sizes: state.sizes };
  return { text: `agents ${label}: ${from} → ${to}`, panels: state.panels, sizes: state.sizes, writes: { [key]: to } };
};

const agentsClear = (cells: Record<string, Cell>, state: TelltaleState): TelltaleResult => {
  const kept = clearDismissable(cells);
  const removed = Object.keys(cells).length - Object.keys(kept).length;
  const text = `agents: cleared ${removed}`;
  if (removed === 0) return { text, panels: state.panels, sizes: state.sizes };
  return { text, panels: state.panels, sizes: state.sizes, writes: { "agents.cells": kept } };
};

const agentsCommand = (tokens: readonly string[], state: TelltaleState): TelltaleResult => {
  const view = state.agentsView;
  if (!view) return unknownPanel("agents", state);

  const sub = tokens[1];
  const value = tokens[2];

  if (sub === "style") {
    if (tokens.length === 2) return { text: `agents style: ${view.style}`, panels: state.panels, sizes: state.sizes };
    if (tokens.length === 3 && value !== undefined && (AGENTS_STYLES as readonly string[]).includes(value)) {
      return agentsSet("style.agents", "style", view.style, value, state);
    }
    return usage(state);
  }

  if (sub === "edge") {
    if (tokens.length === 2) return { text: `agents edge: ${view.edge}`, panels: state.panels, sizes: state.sizes };
    if (tokens.length === 3 && (value === "right" || value === "bottom" || value === "both")) {
      return agentsSet("edge.agents", "edge", view.edge, value, state);
    }
    if (tokens.length === 3 && (value === "top" || value === "left")) {
      return { text: `agents edge ${value}: not available in this build`, panels: state.panels, sizes: state.sizes };
    }
    return usage(state);
  }

  if (sub === "size") {
    if (tokens.length === 2) return { text: `agents size: ${view.size}`, panels: state.panels, sizes: state.sizes };
    if (tokens.length === 3 && value !== undefined && (AGENTS_SIZES as readonly string[]).includes(value)) {
      return agentsSet("size.agents", "size", view.size, value, state);
    }
    return usage(state);
  }

  if (sub === "clear" && tokens.length === 2) return agentsClear(view.cells, state);

  return usage(state);
};

export const runTelltale = (args: string, state: TelltaleState): TelltaleResult => {
  const tokens = args.split(/\s+/).filter((t) => t.length > 0);
  const known = new Set(state.order.map((p) => p.id));

  if (tokens.length === 0) return { text: statusText(state), panels: state.panels, sizes: state.sizes };

  // Ticket 17: `agents` sub-commands (style/edge/size/clear) — a second-level
  // sub-command, not a v0.1 reserved word, so a missing `agents` panel falls
  // to the ordinary "unknown panel" path rather than a special-cased message.
  if (tokens[0] === "agents") {
    if (!known.has("agents")) return unknownPanel("agents", state);
    return agentsCommand(tokens, state);
  }

  if (tokens.length === 1) {
    const [t0] = tokens as [string];
    if (t0 === "status") return { text: statusText(state), panels: state.panels, sizes: state.sizes };
    if (t0 === "help") return usage(state);
    if (t0 === "on" || t0 === "off") return setAll(t0 === "on", state);
    if (!known.has(t0)) return unknownPanel(t0, state);
    return toggleOne(t0, state);
  }

  if (tokens.length === 2) {
    const [t0, t1] = tokens as [string, string];
    if (RESERVED.has(t0)) return usage(state);
    if (t1 === "size") {
      if (!known.has(t0)) return unknownPanel(t0, state);
      return sizeStatus(t0, state);
    }
    if (t1 !== "on" && t1 !== "off") return usage(state);
    if (!known.has(t0)) return unknownPanel(t0, state);
    return setOne(t0, t1 === "on", state);
  }

  if (tokens.length === 3) {
    const [t0, t1, t2] = tokens as [string, string, string];
    if (RESERVED.has(t0)) return usage(state);
    if (t1 === "size") {
      if (!known.has(t0)) return unknownPanel(t0, state);
      if (!(STAGE_ORDER as readonly string[]).includes(t2)) return usage(state);
      return sizeSet(t0, t2 as Stage, state);
    }
    return usage(state);
  }

  return usage(state);
};
