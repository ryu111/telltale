// Panel contract types. SDD §1.1, §1.1a.
// Pure data + types only. No `claude-code` import, no `$`.

import type { Stages } from "./layout";
import type { PendingSpawn } from "./observe";
import type { Cell } from "./cells";

// Re-exported so callers don't need a second import line for a type this
// module's own `Panel`/`PanelIo` already reference structurally.
export type { Cell };

export type Tone = "up" | "down" | "flat" | "dim";

// Structural stand-in for claude-code's `AgentInfo` (SDD §1.1a; the fields
// `hooks/panels/agents.ts` reads), spelled out locally so this file stays
// free of a `claude-code` import.
export type AgentInfo = {
  id: string;
  description: string;
  type: string;
  status: string;
  parentId?: string;
  spawnedBy?: string;
  name?: string;
};

export type PanelLine = {
  text: string; // display width (CJK wide chars count 2) <= given columns; no \n, \t, control chars
  tone?: Tone;
};

// v0.2, SDD §1.1a: a panel that draws animated cells (the `agents` panel)
// returns this shape instead of `lines` — `hooks/band.tsx`'s pure `renderCell`
// turns each `Cell` into display columns on the drawing thread.
export type CellsView = {
  id: string;
  kind: "cells";
  cells: Cell[];
  style?: "v1" | "v2" | "v4";
};

export type PanelView =
  | { id: string; lines: PanelLine[] } // length <= given rows
  | CellsView;

export type PanelIo = {
  now: () => Promise<number>; // framework passes `() => $.clock.now()` (async since 2.1.274; wrapped, never the bare $.clock.now)
  // v0.1: no panel needs fetch yet. The day one does, validate's `calls:` gains $.http.fetch — update README too.
  // §1.1a / ticket 13: only injected for panels with `needsAgents: true`; every other panel gets `undefined` here.
  agents?: () => Promise<AgentInfo[]>;
  cells?: () => Promise<Record<string, import("./cells").Cell>>;
  takePending?: () => PendingSpawn[];
};

export type Panel<D = unknown> = {
  id: string; // ^[a-z][a-z0-9-]{0,15}$; used as $.store key, /telltale arg, userConfig key suffix
  label: string; // panel title row and /telltale status display
  defaultOn: boolean;
  minRows: number; // >= 1
  wantRows: number; // >= minRows
  everyMs?: number; // present only when poll is present; >= 1000
  needsAgents?: boolean; // ticket 13: framework injects io.agents/cells/takePending only when true
  stages?: Stages; // v0.2, SDD §1.2 rule 8
  poll?: (io: PanelIo) => Promise<D>; // return value round-trips through JSON into $.store
  view: (data: D | undefined, columns: number, rows: number) => PanelView; // pure function
};
