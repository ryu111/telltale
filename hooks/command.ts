// /telltale command: pure parser + formatter. SDD §1.6.
// Pure function only — no `claude-code` import, no `$`.

export type TelltaleState = {
  order: { id: string; label: string }[];
  panels: Record<string, boolean>;
  layout: { slots: { id: string; rows: number }[]; dropped: string[]; total: number };
  available: number;
};

export type TelltaleResult = { text: string; panels: Record<string, boolean> };

// Keywords that never double as a panel id (SDD §1.6 table); a second token
// after one of these is always malformed, never "unknown panel <keyword>".
const RESERVED = new Set(["status", "help", "on", "off"]);

const word = (on: boolean): string => (on ? "on" : "off");

const knownIds = (state: TelltaleState): string => state.order.map((p) => p.id).join(", ");

const usage = (state: TelltaleState): TelltaleResult => ({
  text: `usage: /telltale [status|help|on|off|<panel> [on|off]]  panels: ${knownIds(state)}`,
  panels: state.panels,
});

const unknownPanel = (id: string, state: TelltaleState): TelltaleResult => ({
  text: `unknown panel "${id}"; known: ${knownIds(state)}`,
  panels: state.panels,
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
  return { text: lines.join("\n"), panels };
};

const setOne = (id: string, to: boolean, state: TelltaleState): TelltaleResult => {
  const from = state.panels[id] ?? false;
  if (from === to) return { text: setLine(id, from, to), panels: state.panels };
  return { text: setLine(id, from, to), panels: { ...state.panels, [id]: to } };
};

const toggleOne = (id: string, state: TelltaleState): TelltaleResult => {
  const from = state.panels[id] ?? false;
  const to = !from;
  return { text: setLine(id, from, to), panels: { ...state.panels, [id]: to } };
};

export const runTelltale = (args: string, state: TelltaleState): TelltaleResult => {
  const tokens = args.split(/\s+/).filter((t) => t.length > 0);
  const known = new Set(state.order.map((p) => p.id));

  if (tokens.length === 0) return { text: statusText(state), panels: state.panels };

  if (tokens.length === 1) {
    const [t0] = tokens as [string];
    if (t0 === "status") return { text: statusText(state), panels: state.panels };
    if (t0 === "help") return usage(state);
    if (t0 === "on" || t0 === "off") return setAll(t0 === "on", state);
    if (!known.has(t0)) return unknownPanel(t0, state);
    return toggleOne(t0, state);
  }

  if (tokens.length === 2) {
    const [t0, t1] = tokens as [string, string];
    if (RESERVED.has(t0)) return usage(state);
    if (t1 !== "on" && t1 !== "off") return usage(state);
    if (!known.has(t0)) return unknownPanel(t0, state);
    return setOne(t0, t1 === "on", state);
  }

  return usage(state);
};
