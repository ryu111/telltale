// clock panel. SDD §2.2a.
// Pure data + pure functions. No `claude-code` import, no `$`.

import type { Panel } from "../panel";
import { fit } from "../width";

type ClockData = { now: number };

const pad2 = (n: number): string => n.toString().padStart(2, "0");

// Local time zone HH:MM:SS per the ticket note.
const hhmmss = (ms: number): string => {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
};

export const clock: Panel<ClockData> = {
  id: "clock",
  label: "clock",
  defaultOn: true,
  minRows: 1,
  wantRows: 1,
  everyMs: 1000,
  poll: async (io) => ({ now: io.now() }),
  view: (data, columns) => {
    if (data === undefined) {
      return { id: "clock", lines: [{ text: fit("--:--:--", columns), tone: "dim" }] };
    }
    return { id: "clock", lines: [{ text: fit(hhmmss(data.now), columns) }] };
  },
};
