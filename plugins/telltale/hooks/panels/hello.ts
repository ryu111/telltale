// hello panel. SDD §2.3.
// Pure data + pure functions. No `claude-code` import, no `$`.

import type { Panel, PanelLine } from "../panel";
import { fit } from "../width";

type HelloData = { tick: number };

const pad2 = (n: number): string => n.toString().padStart(2, "0");

// Local time zone HH:MM:SS per the ticket note.
const hhmmss = (ms: number): string => {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
};

export const hello: Panel<HelloData> = {
  id: "hello",
  label: "hello",
  defaultOn: true,
  minRows: 1,
  wantRows: 2,
  everyMs: 5000,
  poll: async (io) => ({ tick: await io.now() }),
  view: (data, columns, rows) => {
    const lines: PanelLine[] = [];

    if (data === undefined) {
      lines.push({ text: fit("hello · waiting for first tick", columns), tone: "dim" });
    } else {
      const seconds = new Date(data.tick).getSeconds();
      lines.push({
        text: fit(`hello · ${hhmmss(data.tick)}`, columns),
        tone: seconds % 2 === 0 ? "up" : "flat",
      });
    }

    if (rows >= 2) {
      lines.push({ text: fit(`寬 ${columns} 欄 · 高 ${rows} 列`, columns), tone: "dim" });
    }

    return { id: "hello", lines };
  },
};
