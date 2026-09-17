// Ticket 06: the band's surface module. SDD §1.5. Runs on the drawing thread;
// no `claude-code` value import beyond types, no `$`. Click handling is
// tested indirectly through the pure functions in `hit.ts` (hitPanel/isClick/
// rowsOf); this file's own output has no automated test (SDD §1.5), the tmux
// script in the ticket covers it.

import type { ClientSurface } from "claude-code";
import { hitCell, hitPanel, isClick, rowsOf, TITLE_RESERVE, type CellRowSpan } from "./hit";
import type { BandPanel, BandProps } from "./hit";
import { MIN_COLUMNS } from "./layout";
import type { Tone } from "./panel";
import { displayWidth, fit } from "./width";
import { renderCell, TRANSIT_MS, BIRTH_MS, type Cell, type CameraState, type Tone2 } from "./cells";

export type { BandPanel, BandProps };

// Local to this surface module — never crosses the `$`/Client JSON boundary.
export type BandState = {
  down: { x: number; y: number } | null;
  // Ticket 16: the frame clock's own counter, plus one eased camera per
  // cell id (renderCell is pure and stateless — this surface is the only
  // place the camera's running offset lives between redraws).
  frame: number;
  cam: Record<string, CameraState>;
};

// Ticket 16 (DESIGN §6, `hooks/panels/agents.ts`'s eventual `{ kind: "cells" }`
// view, ticket 17's job to wire): a `BandPanel` carries a rendered `cells`
// list only once that lands; until then this is always `undefined` and the
// branch below never fires. Read structurally rather than widening
// `BandPanel` itself (out of this ticket's 可碰檔案 — `hit.ts` owns that type).
type CellsPanel = { cells: Cell[]; style?: "v1" | "v2" | "v4" };
const cellsOf = (panel: BandPanel): CellsPanel | undefined => {
  const withCells = panel as unknown as Partial<CellsPanel>;
  return Array.isArray(withCells.cells) ? { cells: withCells.cells, style: withCells.style ?? "v1" } : undefined;
};

// Whether `cell` needs a fresh redraw every frame (80 ms) rather than just
// once a second: running, or its newest node is still arriving (ticket 16's
// "抵達中" window, DESIGN §3's TRANSIT+BIRTH).
const isActiveCell = (cell: Cell, now: number): boolean => {
  if (cell.status === "running") return true;
  const last = cell.steps.at(-1);
  return last !== undefined && now - last.t0 < TRANSIT_MS + BIRTH_MS;
};

const DASH = "─";

// Severity only, per the ticket: no blink, no bold.
const toneProps = (tone: Tone | undefined): { color?: string; dimColor?: true } => {
  if (tone === "up") return { color: "green" };
  if (tone === "down") return { color: "red" };
  if (tone === "dim") return { dimColor: true };
  return {}; // "flat" (or none): the default color
};

// "─ label ─────" padded with dashes to fill `columns` (SDD §1.5).
const panelTitleLine = (label: string, columns: number): string => {
  const head = `${DASH} ${label} ${DASH}`;
  const headWidth = displayWidth(head);
  if (headWidth >= columns) return fit(head, columns);
  return head + DASH.repeat(columns - headWidth);
};

// dropped > error > "updated Ns ago" (SDD §1.5).
const statusLine = (props: BandProps, columns: number): string => {
  if (props.dropped.length > 0) {
    return fit(`⋯ ${props.dropped.join(", ")} not shown (height)`, columns);
  }
  const errored = props.panels.find((p) => p.error !== null);
  if (errored) {
    return fit(`${errored.id}: ${errored.error}`, columns);
  }
  const ats = props.panels.map((p) => p.at).filter((at): at is number => at !== null);
  const latest = ats.length > 0 ? Math.max(...ats) : props.now;
  const agoSeconds = Math.max(0, Math.floor((props.now - latest) / 1000));
  return fit(`updated ${agoSeconds}s ago`, columns);
};

type Span2 = { text: string; tone2: Tone2 };
type Row = { text: string; tone?: Tone } | { spans: Span2[] };

// DESIGN §2 palette, keyed by `Tone2` (`hooks/cells.ts`). "current"/
// "currentFailed" additionally set `backgroundColor` (DESIGN §6 item 2:
// current node = white bold + pale green fill; failed current keeps the
// dedicated red instead).
const TONE2_COLOR: Record<Tone2, string> = {
  green: "#5be49b",
  greenDim: "#2f6a4c",
  blue: "#79c0ff",
  violet: "#c792ea",
  amber: "#f2c14e",
  red: "#ff6b6b",
  grey: "#8b949e",
  greyDim: "#4b5563",
  greyDeep: "#2f3743",
  white: "#c9d1d9",
  current: "#c9d1d9",
  currentFailed: "#ff6b6b",
};

const tone2Props = (tone2: Tone2): { color: string; backgroundColor?: string; bold?: true } => {
  if (tone2 === "current") return { color: TONE2_COLOR.current, backgroundColor: "#1c3829", bold: true };
  if (tone2 === "currentFailed") return { color: TONE2_COLOR.currentFailed, backgroundColor: "#3a1f1f", bold: true };
  if (tone2 === "white") return { color: TONE2_COLOR.white, bold: true };
  return { color: TONE2_COLOR[tone2] };
};

// Ticket 16: this panel's cells (once `hooks/panels/agents.ts` feeds them,
// ticket 17) laid out top to bottom within its `rows` budget, one line per
// `CellLine`. Returns both the drawable rows and the row spans `hitCell`
// needs (same source, so drawing and hit-testing agree — mirrors how
// `rowsOf` keeps panel titles and `hitPanel` in sync).
const buildCellRows = (
  cellsPanel: CellsPanel,
  columns: number,
  panelRows: number,
  now: number,
  frame: number,
  camState: Record<string, CameraState>,
): { rows: Row[]; spans: CellRowSpan[]; nextCam: Record<string, CameraState> } => {
  const rows: Row[] = [];
  const spans: CellRowSpan[] = [];
  const nextCam: Record<string, CameraState> = {};
  let remaining = panelRows;
  for (const cell of cellsPanel.cells) {
    if (remaining <= 0) break;
    const cam = camState[cell.id] ?? { offset: 0 };
    const h = Math.min(remaining, cellsPanel.style === "v2" ? panelRows : cellsPanel.style === "v4" ? 2 : 4);
    const { lines, cam: updatedCam } = renderCell(cell, cellsPanel.style ?? "v1", columns, h, now, frame, cam);
    nextCam[cell.id] = updatedCam;
    for (const line of lines) {
      rows.push({ spans: line.spans.map((s) => ({ text: s.text, tone2: s.tone })) });
    }
    spans.push({ cellId: cell.id, rows: lines.length });
    remaining -= lines.length;
  }
  while (rows.length < panelRows) rows.push({ text: "" });
  return { rows, spans, nextCam };
};

// The single source of truth for row *positions* is `rowsOf` (hit.ts); this
// builds the array of what to draw at each of those positions so drawing and
// hit-testing can never disagree about where a panel's title row is.
const buildRows = (
  props: BandProps,
  columns: number,
  now: number,
  frame: number,
  camState: Record<string, CameraState>,
): { rows: Row[]; cellSpans: Record<string, { startY: number; spans: CellRowSpan[] }>; nextCam: Record<string, CameraState> } => {
  const rows: Row[] = new Array(props.total);
  rows[0] = { text: fit(`telltale · ${props.panels.length} panels`, columns - TITLE_RESERVE) };
  const titleRowOf = rowsOf(props);
  const cellSpans: Record<string, { startY: number; spans: CellRowSpan[] }> = {};
  let nextCam: Record<string, CameraState> = {};
  for (const panel of props.panels) {
    const titleY = titleRowOf[panel.id];
    rows[titleY] = { text: panelTitleLine(panel.label, columns) };
    const cellsPanel = cellsOf(panel);
    if (cellsPanel) {
      const built = buildCellRows(cellsPanel, columns, panel.rows, now, frame, camState);
      for (let i = 0; i < panel.rows; i += 1) rows[titleY + 1 + i] = built.rows[i] ?? { text: "" };
      cellSpans[panel.id] = { startY: titleY + 1, spans: built.spans };
      nextCam = { ...nextCam, ...built.nextCam };
      continue;
    }
    for (let i = 0; i < panel.rows; i += 1) {
      const line = panel.lines[i];
      rows[titleY + 1 + i] = line ? { text: fit(line.text, columns), tone: line.tone } : { text: "" };
    }
  }
  rows[props.total - 1] = { text: statusLine(props, columns) };
  // Defensive: any row `layout`/panels didn't account for still draws blank
  // rather than crashing on a hole in a sparse array.
  for (let i = 0; i < rows.length; i += 1) rows[i] ??= { text: "" };
  return { rows, cellSpans, nextCam };
};

// Any panel still running/arriving right now: while true, the frame clock
// (80 ms) keeps ticking; once false everywhere, it can idle at the slower
// (1000 ms) elapsed-time-only cadence (DESIGN §3, ticket's own wording).
const hasActiveCell = (props: BandProps, now: number): boolean =>
  props.panels.some((panel) => cellsOf(panel)?.cells.some((cell) => isActiveCell(cell, now)) ?? false);

export function Band(props: BandProps, surface: ClientSurface<BandState>) {
  const { Box, Text } = surface.elements;
  const columns = surface.columns || props.columnsHint;

  // Ticket 16, SDD §0 known gap: `surface.every` must be started once, while
  // `surface.state` is still `undefined` — calling it on every render would
  // stack a new timer per redraw instead of reusing one. Two cadences: an
  // 80 ms one drives running/arriving cells' animation (breathing, packet,
  // typewriter, camera); a 1000 ms one is enough for everything else (just
  // the elapsed-time counters). Both only ever call `setState`, which is
  // what actually triggers the next redraw — the callback itself does no
  // drawing.
  if (surface.state === undefined) {
    surface.setState({ down: null, frame: 0, cam: {} });
    // Known limitation (worth flagging, not fixed here): these two closures
    // keep the `props`/`columns` from THIS first render forever — "start
    // the clock once" (the doc's own instruction, and this ticket's) means
    // they can't re-close over later ones. The camera/active-cell math they
    // do is only ever a frame or two stale in practice (every prop update
    // also drives a real render, which reads the freshest `props` itself);
    // it would only visibly lag on a session with zero other invalidations
    // for a long time, which the poll loop rules out (`everyMs` <= a few
    // seconds for every panel, ticket 12/13).
    surface.every(80, () => {
      const prev = surface.state ?? { down: null, frame: 0, cam: {} };
      const now = Date.now();
      if (!hasActiveCell(props, now)) return; // nothing to animate this fast; the 1000ms clock covers it
      const { nextCam } = buildRows(props, columns, now, prev.frame + 1, prev.cam);
      surface.setState({ ...prev, frame: prev.frame + 1, cam: nextCam });
    });
    surface.every(1000, () => {
      const prev = surface.state ?? { down: null, frame: 0, cam: {} };
      const now = Date.now();
      const { nextCam } = buildRows(props, columns, now, prev.frame + 1, prev.cam);
      surface.setState({ ...prev, frame: prev.frame + 1, cam: nextCam });
    });
  }

  // Re-registered on every call (props/columns may have changed since the
  // last one); the handler itself reads `surface.state` fresh, never a
  // value captured by this closure from an earlier render.
  surface.onPointer((ev) => {
    if (ev.type === "down") {
      surface.setState({ ...(surface.state as BandState), down: { x: ev.x, y: ev.y } });
      return;
    }
    if (ev.type !== "up") return;
    const down = surface.state?.down ?? null;
    if (isClick(down, ev)) {
      const id = hitPanel(ev.y, ev.x, props, columns);
      if (id) {
        surface.post({ kind: "toggle", id });
      } else {
        const cellsAt = buildRows(props, columns, Date.now(), surface.state?.frame ?? 0, surface.state?.cam ?? {}).cellSpans;
        for (const [panelId, entry] of Object.entries(cellsAt)) {
          const cellId = hitCell(ev.y, ev.x, entry.startY, entry.spans, columns);
          if (cellId) {
            surface.post({ kind: "row", id: panelId, hit: cellId });
            break;
          }
        }
      }
    }
    surface.setState({ ...(surface.state as BandState), down: null });
  });

  // Narrower than MIN_COLUMNS: degrade to a single line, don't disappear.
  if (columns < MIN_COLUMNS) {
    return (
      <Box flexDirection="column">
        <Text>{fit(`telltale · ${props.panels.length} panels`, columns)}</Text>
      </Box>
    );
  }

  // `total === 1`: the hooks module only reports this for the empty-`wants`
  // layout special case, i.e. title and status collapse into one line.
  // Genuinely all off (nothing dropped either) gets the fixed message;
  // squeezed to one row while panels are actually on (dropped non-empty)
  // gets the ordinary status text instead of the misleading "all off" one.
  if (props.total === 1) {
    const text =
      props.panels.length === 0 && props.dropped.length === 0
        ? "telltale · all panels off · /telltale on"
        : statusLine(props, columns);
    return (
      <Box flexDirection="column">
        <Text>{fit(text, columns)}</Text>
      </Box>
    );
  }

  const frame = surface.state?.frame ?? 0;
  const cam = surface.state?.cam ?? {};
  // `render` must stay a pure read of `surface.state` (a `setState` from
  // inside it, unconditional or not, can loop: DESIGN §6 item 3's manual
  // probe hit exactly this — "set its state again after each of 3 renders"
  // — because `nextCam` is never bit-identical to `cam` while a camera is
  // still easing toward a moving target). The eased camera is instead
  // advanced from the frame-clock ticks below, which own every write to
  // `surface.state.cam`; this just reads whatever they last computed.
  const { rows } = buildRows(props, columns, Date.now(), frame, cam);

  return (
    <Box flexDirection="column">
      {rows.map((row) => {
        if ("spans" in row) {
          return (
            <Box>
              {row.spans.map((span) => {
                const tp = tone2Props(span.tone2);
                return (
                  <Text color={tp.color} backgroundColor={tp.backgroundColor} bold={tp.bold}>
                    {span.text}
                  </Text>
                );
              })}
            </Box>
          );
        }
        const tp = toneProps(row.tone);
        return (
          <Text color={tp.color} dimColor={tp.dimColor}>
            {row.text}
          </Text>
        );
      })}
    </Box>
  );
}
