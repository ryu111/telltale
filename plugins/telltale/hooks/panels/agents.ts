// agents panel. SDD §1.1a, §2.1, §2.6, §2.6a, §2.7.
// Pure data + pure functions. No `claude-code` import, no `$`.

import { CONTENT_ROWS_MAX } from "../layout";
import type { Panel } from "../panel";
import { compressSteps, VANISH_AFTER_MS, COLLAPSE_AFTER_MS, ORPHAN_MS, MAIN_HISTORY_ID, EXPANDED_MS, type Cell, type Step } from "../cells";
import type { PendingSpawn } from "../observe";

// Ticket 21: the id lives in cells.ts so renderCell (also in cells.ts) can
// special-case it without importing this panel module. Re-exported here
// because this is where callers (and tests) look for it.
export { MAIN_HISTORY_ID };

type Cells = Record<string, Cell>;

const statusOf = (raw: string): Cell["status"] =>
  raw === "completed" || raw === "failed" || raw === "killed" ? raw : (raw as Cell["status"]);

/** Step 2: reconcile `cells` against the live `agent.list()` snapshot. */
const applyAgentList = (cells: Cells, list: readonly { id: string; description: string; status: string }[], now: number): Cells => {
  let working = cells;
  for (const info of list) {
    const existing = working[info.id];
    if (!existing) {
      // No description: nothing worth showing yet (ticket 21 — a subagent
      // whose AgentInfo hasn't picked up a description never opens a cell).
      if (info.description === "") continue;
      working = {
        ...working,
        [info.id]: {
          id: info.id,
          kind: "sub",
          label: "sub",
          desc: info.description,
          status: "running",
          firstAt: now,
          updatedAt: now,
          steps: [{ name: "prompt", t0: now }],
          listed: true,
        },
      };
      continue;
    }

    // Ticket 22: a turn.step-created stub that never got a description, and
    // whose AgentInfo still reports "" while it's no longer running, is
    // dropped outright — it never showed anything worth keeping.
    if (existing.status === "running" && existing.desc === "" && info.description === "" && info.status !== "running") {
      const { [info.id]: _dropped, ...rest } = working;
      working = rest;
      continue;
    }

    // Fill in a turn.step-created stub's desc (never rebuilds an existing cell).
    const withDesc = existing.desc === "" && existing.status === "running" ? { ...existing, desc: info.description } : existing;
    // Ticket 32 (SDD §2.8): every cell `list` names this tick — new, desc-filled,
    // status-translated, or unchanged — carries `listed: true` so `applyUnlistedIdle`
    // never touches it.
    const withListed = withDesc.listed === true ? withDesc : { ...withDesc, listed: true as const };

    if (existing.status === "running" && info.status !== "running") {
      const newStatus = statusOf(info.status);
      const nodeName = newStatus === "completed" ? "reply" : newStatus;
      working = {
        ...working,
        [info.id]: {
          ...withListed,
          status: newStatus,
          endAt: now,
          updatedAt: now,
          steps: [...withListed.steps, { name: nodeName, t0: now }],
        },
      };
    } else if (withListed !== existing) {
      working = { ...working, [info.id]: withListed };
    }
  }
  return working;
};

/**
 * Step 3: pair each just-opened sub cell against the earliest matching
 * pending spawn. Mutates `pending` in place (splices out consumed entries)
 * so the caller can push whatever's left back onto next tick's queue —
 * an unmatched spawn keeps trying, it isn't dropped this round.
 */
const applyModelPairing = (cells: Cells, pending: PendingSpawn[]): Cells => {
  let working = cells;
  for (const id of Object.keys(working)) {
    const cell = working[id]!;
    if (cell.kind !== "sub" || cell.model !== undefined) continue;
    let bestIdx = -1;
    for (let i = 0; i < pending.length; i += 1) {
      if (pending[i]!.description !== cell.desc) continue;
      if (bestIdx === -1 || pending[i]!.at < pending[bestIdx]!.at) bestIdx = i;
    }
    if (bestIdx === -1) continue;
    const [spawn] = pending.splice(bestIdx, 1);
    working = { ...working, [id]: { ...cell, model: spawn!.model } };
  }
  return working;
};

/** Step 4: bg cell cleanup — long-run stays running (DESIGN's color is ticket 14's concern); orphan flips status. */
const applyBgCleanup = (cells: Cells, now: number): Cells => {
  let working = cells;
  for (const cell of Object.values(working)) {
    if (cell.kind !== "bg" || cell.status !== "running") continue;
    if (now - cell.firstAt > ORPHAN_MS && cell.endAt === undefined) {
      working = { ...working, [cell.id]: { ...cell, status: "orphan", updatedAt: now } };
    }
  }
  return working;
};

// Ticket 32 (SDD §2.8): a workflow's own agents carry ids the engine's
// `$.agent.list()` never names (`AgentLoop.agentId`: "carry ids no list
// names") — `applyAgentList` above can never mark them `listed`, so a stub
// created from `turn.step` alone would otherwise run forever. Idle, not a
// status change, is the only signal available for them.
export const UNLISTED_IDLE_MS = 2 * 60 * 1000;

/** Step 4b: a running sub cell the list has never named completes once it's been idle past UNLISTED_IDLE_MS. */
const applyUnlistedIdle = (cells: Cells, now: number): Cells => {
  let working = cells;
  for (const cell of Object.values(working)) {
    if (cell.kind !== "sub" || cell.status !== "running" || cell.listed === true) continue;
    if (now - cell.updatedAt > UNLISTED_IDLE_MS) {
      working = {
        ...working,
        [cell.id]: { ...cell, status: "completed", endAt: now, updatedAt: now, steps: [...cell.steps, { name: "reply", t0: now }] },
      };
    }
  }
  return working;
};

/** Step 5: 60s vanish for completed non-main cells. */
const applyVanish = (cells: Cells, now: number): Cells => {
  const out: Cells = {};
  for (const [id, cell] of Object.entries(cells)) {
    const isMainHistory = cell.kind === "main" && id === MAIN_HISTORY_ID;
    if (!isMainHistory && cell.status === "completed" && cell.endAt !== undefined && now - cell.endAt >= VANISH_AFTER_MS) {
      continue;
    }
    out[id] = cell;
  }
  return out;
};

/** Step 6: fold completed turn cells (kind "main", id != MAIN_HISTORY_ID) into the rolling history cell. */
const applyMainHistoryFold = (cells: Cells, now: number): Cells => {
  let working = cells;
  for (const cell of Object.values(cells)) {
    if (cell.kind !== "main" || cell.id === MAIN_HISTORY_ID) continue;
    if (cell.status !== "completed") continue;
    const foldAt = cell.endAt ?? cell.updatedAt;
    if (now - foldAt < COLLAPSE_AFTER_MS) continue;

    const history = working[MAIN_HISTORY_ID];
    const turnStep: Step = { name: "turn", detail: cell.desc, t0: cell.firstAt, t1: cell.endAt ?? cell.updatedAt };
    const nextHistory: Cell = history
      ? { ...history, desc: cell.desc, endAt: now, updatedAt: now, steps: compressSteps([...history.steps, turnStep]) }
      : {
          id: MAIN_HISTORY_ID,
          kind: "main",
          label: "main",
          desc: cell.desc,
          status: "completed",
          firstAt: cell.firstAt,
          endAt: now,
          updatedAt: now,
          steps: compressSteps([turnStep]),
        };

    working = { ...working, [MAIN_HISTORY_ID]: nextHistory };
    const { [cell.id]: _dropped, ...rest } = working;
    working = rest;
  }
  return working;
};

export const agents: Panel<Cells> = {
  id: "agents",
  label: "agents",
  defaultOn: true,
  minRows: 3,
  wantRows: CONTENT_ROWS_MAX,
  needsAgents: true,
  stages: { summary: 0, compact: 3, full: "rest" },
  defaultStage: "full",
  everyMs: 1000,
  poll: async (io) => {
    let cells = (await io.cells!()) ?? {};
    const list = await io.agents!();
    const now = await io.now();

    cells = applyAgentList(cells, list, now);
    cells = applyModelPairing(cells, io.takePending!());
    cells = applyBgCleanup(cells, now);
    cells = applyUnlistedIdle(cells, now);
    cells = applyVanish(cells, now);
    cells = applyMainHistoryFold(cells, now);

    return cells;
  },
  // Ticket 17: hands the raw cells to the drawing thread's `renderCell`
  // (SDD §1.1a) instead of pre-formatting a text line — `style` is a
  // `$.store` concern (`style.agents`), so `register.tsx` attaches it, not
  // this pure function.
  view: (cells, _columns, _rows) => ({ id: "agents", kind: "cells", cells: Object.values(cells ?? {}) }),
};

// ── Ticket 17: onRow / isExpanded (SDD §2.6 "onRow") ──

export type OnRowResult = { cells: Cells; expanded: { id: string; at: number } | null };

// Ticket 31: sole source of truth moved to cells.ts (renderCell/isCollapsed
// need it too); re-exported here so this module's existing callers/tests
// don't have to change their import path.
export { EXPANDED_MS };

export const onRow = (hit: string, cells: Cells, now: number): OnRowResult => {
  const cell = cells[hit];
  if (!cell) return { cells, expanded: null };

  if (cell.status === "failed" || cell.status === "killed" || cell.status === "orphan") {
    return { cells: { ...cells, [hit]: { ...cell, dismissed: true } }, expanded: null };
  }

  if (cell.status === "completed") return { cells, expanded: { id: hit, at: now } };

  if (cell.status === "running") {
    return { cells: { ...cells, [hit]: { ...cell, collapsed: !cell.collapsed } }, expanded: null };
  }

  return { cells, expanded: null };
};

export const isExpanded = (expanded: { id: string; at: number } | null, now: number): boolean =>
  expanded !== null && now - expanded.at < EXPANDED_MS;
