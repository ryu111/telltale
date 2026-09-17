// Panel contract types. SDD §1.1.
// Pure data + types only. No `claude-code` import, no `$`.

export type Tone = "up" | "down" | "flat" | "dim";

export type PanelLine = {
  text: string; // display width (CJK wide chars count 2) <= given columns; no \n, \t, control chars
  tone?: Tone;
};

export type PanelView = {
  id: string;
  lines: PanelLine[]; // length <= given rows
};

export type PanelIo = {
  now: () => number; // framework passes `() => $.clock.now()` (wrapped, never the bare $.clock.now)
  // v0.1: no panel needs fetch yet. The day one does, validate's `calls:` gains $.http.fetch — update README too.
};

export type Panel<D = unknown> = {
  id: string; // ^[a-z][a-z0-9-]{0,15}$; used as $.store key, /telltale arg, userConfig key suffix
  label: string; // panel title row and /telltale status display
  defaultOn: boolean;
  minRows: number; // >= 1
  wantRows: number; // >= minRows
  everyMs?: number; // present only when poll is present; >= 1000
  poll?: (io: PanelIo) => Promise<D>; // return value round-trips through JSON into $.store
  view: (data: D | undefined, columns: number, rows: number) => PanelView; // pure function
};
