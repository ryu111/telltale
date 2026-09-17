// Ticket 06: the band's surface module. SDD §1.5. Runs on the drawing thread;
// no `claude-code` value import beyond types, no `$`. Click handling is
// tested indirectly through the pure functions in `hit.ts` (hitPanel/isClick/
// rowsOf); this file's own output has no automated test (SDD §1.5), the tmux
// script in the ticket covers it.

import type { ClientSurface } from "claude-code";
import { hitPanel, isClick, TITLE_RESERVE } from "./hit";
import { MIN_COLUMNS } from "./layout";
import type { Tone } from "./panel";
import type { BandProps } from "./register";
import { displayWidth, fit } from "./width";

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

  // All panels off (or, defensively, everything dropped for height): the
  // hooks module reports `total: 1` for exactly this case — one line, title
  // and status merged into it.
  if (props.panels.length === 0) {
    return (
      <Box flexDirection="column">
        <Text>{fit("telltale · all panels off · /telltale on", columns)}</Text>
      </Box>
    );
  }

  const bandTitle = fit(`telltale · ${props.panels.length} panels`, columns - TITLE_RESERVE);

  return (
    <Box flexDirection="column">
      <Text>{bandTitle}</Text>
      {props.panels.map((panel) => (
        <Box flexDirection="column">
          <Text>{panelTitleLine(panel.label, columns)}</Text>
          {panel.lines.map((line) => {
            const tp = toneProps(line.tone);
            return (
              <Text color={tp.color} dimColor={tp.dimColor}>
                {fit(line.text, columns)}
              </Text>
            );
          })}
        </Box>
      ))}
      <Text>{statusLine(props, columns)}</Text>
    </Box>
  );
}
