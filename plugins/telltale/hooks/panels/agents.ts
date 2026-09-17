// agents panel. SDD §1.1a, §2.1, §2.6, §2.6a, §2.7.
// Pure data + pure functions. No `claude-code` import, no `$`.

import { CONTENT_ROWS_MAX } from "../layout";
import type { Panel } from "../panel";
import { compressSteps, VANISH_AFTER_MS, COLLAPSE_AFTER_MS, ORPHAN_MS, type Cell, type Step } from "../cells";
import type { PendingSpawn } from "../observe";
import { fit } from "../width";

export const MAIN_HISTORY_ID = "main-history";

type Cells = Record<string, Cell>;

const statusOf = (raw: string): Cell["status"] =>
  raw === "completed" || raw === "failed" || raw === "killed" ? raw : (raw as Cell["status"]);

/** Step 2: reconcile `cells` against the live `agent.list()` snapshot. */
const applyAgentList = (cells: Cells, list: readonly { id: string; description: string; status: string }[], now: number): Cells => {
  let working = cells;
  for (const info of list) {
    const existing = working[info.id];
    if (!existing) {
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
        },
      };
      continue;
    }

    // Fill in a turn.step-created stub's desc (never rebuilds an existing cell).
    const withDesc = existing.desc === "" && existing.status === "running" ? { ...existing, desc: info.description } : existing;

    if (existing.status === "running" && info.status !== "running") {
      const newStatus = statusOf(info.status);
      const nodeName = newStatus === "completed" ? "reply" : newStatus;
      working = {
        ...working,
        [info.id]: {
          ...withDesc,
          status: newStatus,
          endAt: now,
          updatedAt: now,
          steps: [...withDesc.steps, { name: nodeName, t0: now }],
        },
      };
    } else if (withDesc !== existing) {
      working = { ...working, [info.id]: withDesc };
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
  everyMs: 1000,
  poll: async (io) => {
    let cells = (await io.cells!()) ?? {};
    const list = await io.agents!();
    const now = await io.now();

    cells = applyAgentList(cells, list, now);
    cells = applyModelPairing(cells, io.takePending!());
    cells = applyBgCleanup(cells, now);
    cells = applyVanish(cells, now);
    cells = applyMainHistoryFold(cells, now);

    return cells;
  },
  // Ticket 13 scope is poll only. Rendering `cells` into the box/strip
  // layouts (the renderCell/sortCells wiring from ticket 14) is ticket
  // 15/16's job — this view is a minimal placeholder (a cell count) that
  // satisfies the existing `Panel<D>` contract without pretending to draw
  // the real band yet.
  view: (cells, columns, _rows) => {
    const count = Object.keys(cells ?? {}).length;
    return { id: "agents", lines: [{ text: fit(`agents · ${count} cell${count === 1 ? "" : "s"}`, columns), tone: "dim" }] };
  },
};
