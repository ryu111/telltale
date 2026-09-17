// Ticket 07: /telltale. SDD §1.6 table + the command.run hook. Exact match.
import { expect, test } from "bun:test";
import { runTelltale, type TelltaleState } from "./command";
import { fakeEngine } from "./harness";
import { register } from "./register";

const state = (panels: Record<string, boolean> = { hello: true, clock: true }): TelltaleState => ({
  order: [
    { id: "hello", label: "hello" },
    { id: "clock", label: "clock" },
  ],
  panels,
  layout: {
    slots: Object.entries(panels)
      .filter(([, on]) => on)
      .map(([id]) => ({ id, rows: id === "hello" ? 2 : 1 })),
    dropped: [],
    total: 2 + Object.values(panels).filter(Boolean).length + (panels.hello ? 1 : 0),
  },
  available: 14,
});

test("status (also the bare command): one line per panel, then the band line", () => {
  const { text, panels } = runTelltale("status", state());
  expect(text.split("\n")).toEqual(["● hello  on   2 rows", "● clock  on   1 rows", "band: 5 rows of 14 available"]);
  expect(runTelltale("", state()).text).toBe(text);
  expect(panels).toEqual({ hello: true, clock: true });
});

test("status shows off panels and dropped-for-height panels differently", () => {
  const s = state({ hello: true, clock: false });
  s.layout.dropped = ["hello"];
  s.layout.slots = [];
  s.layout.total = 2;
  const lines = runTelltale("status", s).text.split("\n");
  expect(lines[0]).toBe("⋯ hello  on  dropped (height)");
  expect(lines[1]).toBe("○ clock  off");
});

test("<id> toggles and reports on → off", () => {
  const r = runTelltale("hello", state());
  expect(r.text).toBe("hello: on → off");
  expect(r.panels).toEqual({ hello: false, clock: true });
});

test("<id> on|off sets; setting the current value says unchanged", () => {
  expect(runTelltale("clock off", state()).text).toBe("clock: on → off");
  expect(runTelltale("clock on", state()).text).toBe("clock: on (unchanged)");
  expect(runTelltale("clock on", state()).panels).toEqual({ hello: true, clock: true });
});

test("on / off apply to every panel, one line each", () => {
  const r = runTelltale("off", state());
  expect(r.text.split("\n")).toEqual(["hello: on → off", "clock: on → off"]);
  expect(r.panels).toEqual({ hello: false, clock: false });
  expect(runTelltale("on", state({ hello: false, clock: true })).text.split("\n")).toEqual([
    "hello: off → on",
    "clock: on (unchanged)",
  ]);
});

test("help and malformed input print the usage line and change nothing", () => {
  const usage = "usage: /telltale [status|help|on|off|<panel> [on|off]]  panels: hello, clock";
  for (const args of ["help", "hello maybe", "hello on extra", "on off", "status now"]) {
    const r = runTelltale(args, state());
    expect(r.text).toBe(usage);
    expect(r.panels).toEqual({ hello: true, clock: true });
  }
});

test("unknown id is reported, never guessed", () => {
  expect(runTelltale("helo", state()).text).toBe('unknown panel "helo"; known: hello, clock');
  expect(runTelltale("helo on", state()).text).toBe('unknown panel "helo"; known: hello, clock');
});

test("command.run hook: writes the store, invalidates, answers { text } without next", async () => {
  const eng = fakeEngine({ now: 1000 });
  register(eng.on, {});
  await eng.fire("session.start", {});
  const before = eng.invalidations;
  const out = await eng.fire("command.run", { command: "telltale", args: "clock off", origin: { kind: "composer" } });
  expect(out).toEqual({ text: "clock: on → off" });
  expect((eng.store.panels as Record<string, boolean>).clock).toBe(false);
  expect(eng.invalidations).toBeGreaterThan(before);
  const again = await eng.fire("command.run", { command: "telltale", args: "status", origin: { kind: "composer" } });
  expect((again as { text: string }).text).toContain("○ clock  off");
  expect(eng.invalidations).toBe(before + 1); // status does not invalidate
});
