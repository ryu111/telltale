// Ticket 12: turn.*/ui.render{Spinner}/session.receive{task-notification} write agents.cells.
// SDD §1.1a, §2.6, §2.6a, §3, §5 I12/I13/I17.
// Pure functions only: no `claude-code` import, no `$`.
import type { Cell, Step } from "./cells";

export type PendingSpawn = { description: string; model?: string; at: number };
export type Cells = Record<string, Cell>;

// Regex constants (DESIGN §3 / §2.6a "背景任務"): the three task-notification
// shapes a `session.receive` delivery's text can carry.
export const NOTIFICATION_RE =
  /Background command "([^"]+)" completed|Task "([^"]+)"|Workflow "([^"]+)"/;

const THINKING_MODES = new Set(["responding", "thinking", "requesting"]);

type ToolUse = { name: string; input: unknown };

// Bash's node detail, and a bg cell's desc, are the same rule: the tool's
// own `description`, or its `command` clipped to 40 chars.
const descOf = (input: unknown): string | undefined => {
  const obj = (input ?? {}) as { description?: unknown; command?: unknown };
  if (typeof obj.description === "string") return obj.description;
  if (typeof obj.command === "string") return obj.command.slice(0, 40);
  return undefined;
};

const isBackgroundToolUse = (tool: ToolUse): boolean => {
  if (tool.name === "Monitor" || tool.name === "Workflow") return true;
  if (tool.name === "Bash") {
    const obj = (tool.input ?? {}) as { run_in_background?: unknown };
    return obj.run_in_background === true;
  }
  return false;
};

const soleRunningMain = (cells: Cells): Cell | undefined => {
  const running = Object.values(cells).filter((c) => c.kind === "main" && c.status === "running");
  return running.length === 1 ? running[0] : undefined;
};

export const applyTurnStart = (cells: Cells, e: { turnId: string; text: string }, now: number): Cells => {
  // Same turnId already open: a re-entrant turn.start, no-op (shouldn't happen, doesn't crash).
  if (e.turnId in cells) return cells;
  return {
    ...cells,
    [e.turnId]: {
      id: e.turnId,
      kind: "main",
      label: "main",
      desc: e.text.slice(0, 60),
      status: "running",
      firstAt: now,
      updatedAt: now,
      steps: [{ name: "prompt", t0: now }],
    },
  };
};

export const applySpinner = (cells: Cells, e: { requestId: string; mode: string }, now: number): Cells => {
  const target = cells[e.requestId] ?? soleRunningMain(cells);
  if (!target) return cells; // observation only: never creates a cell
  if (!THINKING_MODES.has(e.mode)) return cells;
  const last = target.steps[target.steps.length - 1];
  if (last?.name === "think") return cells; // one think node per thinking streak
  return {
    ...cells,
    [target.id]: {
      ...target,
      steps: [...target.steps, { name: "think", t0: now }],
      updatedAt: now,
    },
  };
};

export const applyTurnStep = (
  cells: Cells,
  e: { turnId: string; agentId?: string; toolUses: readonly ToolUse[] },
  now: number,
): { cells: Cells; pending: PendingSpawn[] } => {
  const cellId = e.agentId ?? e.turnId;
  let working = cells;
  const existing = working[cellId];
  // A sub cell's turn.step can arrive before ticket 13's poll sees this
  // agent: open a minimal stub, never rebuilt once it exists.
  const target: Cell =
    existing ??
    ({
      id: cellId,
      kind: "sub",
      label: "sub",
      desc: "",
      status: "running",
      firstAt: now,
      updatedAt: now,
      steps: [{ name: "prompt", t0: now }],
    } satisfies Cell);

  const pending: PendingSpawn[] = [];
  let steps: Step[] = target.steps;

  for (const tool of e.toolUses) {
    const detail = tool.name === "Bash" ? descOf(tool.input) : undefined;
    const node: Step = detail === undefined ? { name: tool.name, t0: now } : { name: tool.name, detail, t0: now };
    steps = [...steps, node];

    if (tool.name === "Agent") {
      // The Agent call itself doesn't open a sub cell — its new subagent's id
      // isn't known yet; ticket 13's poll pairs it up.
      const input = (tool.input ?? {}) as { description?: unknown; model?: unknown };
      pending.push({
        description: typeof input.description === "string" ? input.description : "",
        model: typeof input.model === "string" ? input.model : undefined,
        at: now,
      });
    }

    if (isBackgroundToolUse(tool)) {
      // A background task is its own cell, in addition to the node just
      // pushed onto the caller's (main/sub) cell above.
      const desc = descOf(tool.input) ?? "";
      const bgId = `${now}-${desc}`;
      working = {
        ...working,
        [bgId]: {
          id: bgId,
          kind: "bg",
          label: "bg",
          desc,
          status: "running",
          firstAt: now,
          updatedAt: now,
          steps: [{ name: "prompt", t0: now }],
        },
      };
    }
  }

  working = { ...working, [cellId]: { ...target, steps, updatedAt: now } };
  return { cells: working, pending };
};

export const applyTurnComplete = (cells: Cells, e: { turnId: string; agentId?: string }, now: number): Cells => {
  // Only main: a sub loop's completion is ticket 13's poll's job (agent.list
  // status), not this hook's — handling it here too would double-close it.
  if (e.agentId) return cells;
  const target = cells[e.agentId ?? e.turnId];
  if (!target) return cells;
  return {
    ...cells,
    [target.id]: {
      ...target,
      steps: [...target.steps, { name: "reply", t0: now }],
      status: "completed",
      endAt: now,
      updatedAt: now,
    },
  };
};

export const applyTaskNotification = (cells: Cells, text: string, now: number): Cells => {
  const match = NOTIFICATION_RE.exec(text);
  const desc = match?.[1] ?? match?.[2] ?? match?.[3];
  if (desc === undefined) return cells; // regex found nothing: no-op

  const candidates = Object.values(cells)
    .filter((c) => c.kind === "bg" && c.status === "running" && c.desc === desc)
    .sort((a, b) => a.firstAt - b.firstAt);
  const earliest = candidates[0];
  if (!earliest) return cells;

  return {
    ...cells,
    [earliest.id]: {
      ...earliest,
      steps: [...earliest.steps, { name: "reply", t0: now }],
      status: "completed",
      endAt: now,
      updatedAt: now,
    },
  };
};
