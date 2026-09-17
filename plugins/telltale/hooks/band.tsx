// Ticket 06: the band's surface module. SDD §1.5. Runs on the drawing thread;
// no `claude-code` value import beyond types, no `$`. Click handling is
// tested indirectly through the pure functions in `hit.ts` (hitPanel/isClick/
// rowsOf); this file's own output has no automated test (SDD §1.5), the tmux
// script in the ticket covers it.

import type { ClientSurface } from "claude-code";
import { hitPanel, isClick, rowsOf, TITLE_RESERVE } from "./hit";
import type { BandPanel, BandProps } from "./hit";
import { MIN_COLUMNS } from "./layout";
import type { Tone } from "./panel";
import { displayWidth, fit } from "./width";

export type { BandPanel, BandProps };

// Local to this surface module — never crosses the `$`/Client JSON boundary.
export type BandState = { down: { x: number; y: number } | null };

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

type Row = { text: string; tone?: Tone };

// The single source of truth for row *positions* is `rowsOf` (hit.ts); this
// builds the array of what to draw at each of those positions so drawing and
// hit-testing can never disagree about where a panel's title row is.
const buildRows = (props: BandProps, columns: number): Row[] => {
  const rows: Row[] = new Array(props.total);
  rows[0] = { text: fit(`telltale · ${props.panels.length} panels`, columns - TITLE_RESERVE) };
  const titleRowOf = rowsOf(props);
  for (const panel of props.panels) {
    const titleY = titleRowOf[panel.id];
    rows[titleY] = { text: panelTitleLine(panel.label, columns) };
    for (let i = 0; i < panel.rows; i += 1) {
      const line = panel.lines[i];
      rows[titleY + 1 + i] = line ? { text: fit(line.text, columns), tone: line.tone } : { text: "" };
    }
  }
  rows[props.total - 1] = { text: statusLine(props, columns) };
  // Defensive: any row `layout`/panels didn't account for still draws blank
  // rather than crashing on a hole in a sparse array.
  for (let i = 0; i < rows.length; i += 1) rows[i] ??= { text: "" };
  return rows;
};

export function Band(props: BandProps, surface: ClientSurface<BandState>) {
  const { Box, Text } = surface.elements;
  const columns = surface.columns || props.columnsHint;

  // Re-registered on every call (props/columns may have changed since the
  // last one); the handler itself reads `surface.state` fresh, never a
  // value captured by this closure from an earlier render.
  surface.onPointer((ev) => {
    if (ev.type === "down") {
      surface.setState({ down: { x: ev.x, y: ev.y } });
      return;
    }
    if (ev.type !== "up") return;
    const down = surface.state?.down ?? null;
    if (isClick(down, ev)) {
      const id = hitPanel(ev.y, ev.x, props, columns);
      if (id) surface.post({ kind: "toggle", id });
    }
    surface.setState({ down: null });
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

  const rows = buildRows(props, columns);

  return (
    <Box flexDirection="column">
      {rows.map((row) => {
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
