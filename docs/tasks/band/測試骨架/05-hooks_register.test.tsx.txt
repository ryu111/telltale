// Ticket 05: fake engine + register.tsx (session.start, poll loop, ui.render, ui.message).
// SDD §1.4, §1.5, §2.1, §3, §4; invariants I1, I4, I5, I7 (fake level only), I8, I10, I11.
// Evaluation: exact match. I7 / DoD #3 in the real engine are verified by tmux (ticket 06).
import { expect, test } from "bun:test";
import { clientOf, fakeEngine } from "./harness";
import type { Panel } from "./panel";
import { makeRegister, register } from "./register";
import { displayWidth } from "./width";

const ALLOWED = [
  "$.ui.resolve",
  "$.ui.invalidate",
  "$.clock.now",
  "$.clock.every",
  "$.store.get",
  "$.store.set",
  "$.command.register",
];

type Opts = Parameters<typeof fakeEngine>[0];

const boot = async (opts?: Opts, reg = register) => {
  const eng = fakeEngine(opts);
  reg(eng.on, opts?.options ?? {});
  await eng.fire("session.start", {});
  return eng;
};

const render = (
  eng: ReturnType<typeof fakeEngine>,
  props: Record<string, unknown> = {},
  viewport: { columns: number; rows: number } | undefined = { columns: 80, rows: 40 },
) =>
  eng.fire("ui.render", {
    surface: "terminal",
    component: "AbovePrompt",
    requestId: "r1",
    ...(viewport ? { viewport } : {}),
    props: { hasSurvey: false, isWorking: false, maxRows: 14, scroll: { offset: 0, bodyRows: 13 }, ...props },
  });

// ── session.start ──
test("session.start seeds panels from options / defaultOn and registers /telltale", async () => {
  const eng = await boot({ options: { "panel_hello": false } });
  expect(eng.store.panels).toEqual({ hello: false, clock: true });
  expect(eng.registered).toEqual(["telltale"]);
});

test("session.start keeps existing store toggles over options (store is the truth)", async () => {
  const eng = await boot({ store: { panels: { hello: true, clock: false } }, options: { "panel_hello": false } });
  expect(eng.store.panels).toEqual({ hello: true, clock: false });
});

test("session.start polls once immediately, then schedules clock.every per panel", async () => {
  const eng = await boot({ now: 5000 });
  expect(eng.store["data.hello"]).toEqual({ at: 5000, data: { tick: 5000 } });
  expect(eng.store["data.clock"]).toEqual({ at: 5000, data: { now: 5000 } });
  expect(eng.timers.map((t) => t.ms).sort()).toEqual([1000, 5000]);
});

test("tick writes data.<id>, clears error.<id>, invalidates ui.render", async () => {
  const eng = await boot({ now: 5000 });
  const before = eng.invalidations;
  eng.now = 9000;
  await eng.tick("hello");
  expect(eng.store["data.hello"]).toEqual({ at: 9000, data: { tick: 9000 } });
  expect(eng.store["error.hello"]).toBe("");
  expect(eng.invalidations).toBeGreaterThan(before);
});

// ── ui.render ──
test("I8: hasSurvey yields to next", async () => {
  const eng = await boot();
  expect(await render(eng, { hasSurvey: true })).toEqual(eng.NEXT_RENDER);
});

test("render hands a Client 'band' / module 'Band' whose props are plain JSON without undefined", async () => {
  const eng = await boot();
  const c = clientOf(await render(eng));
  expect(c).not.toBeNull();
  expect(c!.props.key).toBe("band");
  expect(c!.props.module).toBe("Band");
  const p = c!.props.props as Record<string, unknown>;
  expect(JSON.parse(JSON.stringify(p))).toEqual(p);
  expect(Object.keys(p).sort()).toEqual(["columnsHint", "dropped", "now", "panels", "total"]);
});

test("I10: render before any data still draws every panel's placeholder", async () => {
  const eng = fakeEngine();
  register(eng.on, {});
  // no session.start: nothing polled, panels seeded lazily by render? No — SDD: seeds happen at start.
  await eng.fire("session.start", {});
  eng.store["data.hello"] = undefined;
  eng.store["data.clock"] = undefined;
  const p = clientOf(await render(eng))!.props.props as { panels: { id: string; lines: { text: string }[] }[] };
  expect(p.panels.map((x) => x.id)).toEqual(["hello", "clock"]);
  expect(p.panels[0]!.lines[0]!.text).toContain("waiting");
  expect(p.panels[1]!.lines[0]!.text).toBe("--:--:--");
});

test("layout is applied: maxRows 3 keeps hello (1 row) and reports clock as dropped", async () => {
  const eng = await boot();
  const p = clientOf(await render(eng, { maxRows: 3 }))!.props.props as {
    panels: { id: string; rows: number }[];
    dropped: string[];
    total: number;
  };
  expect(p.panels).toHaveLength(1);
  expect(p.panels[0]).toMatchObject({ id: "hello", rows: 1 });
  expect(p.dropped).toEqual(["clock"]);
  expect(p.total).toBe(3);
});

test("I4/I11: every line handed to the Client fits the viewport, CJK counted 2; at least one line shown", async () => {
  const eng = await boot();
  for (const columns of [30, 45, 80, 200]) {
    const p = clientOf(await render(eng, {}, { columns, rows: 40 }))!.props.props as {
      panels: { lines: { text: string }[] }[];
    };
    const lines = p.panels.flatMap((x) => x.lines);
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(displayWidth(l.text)).toBeLessThanOrEqual(columns);
  }
});

test("columnsHint mirrors viewport.columns and falls back to 80 when the viewport is absent", async () => {
  const eng = await boot();
  expect((clientOf(await render(eng, {}, { columns: 123, rows: 9 }))!.props.props as { columnsHint: number }).columnsHint).toBe(123);
  expect((clientOf(await render(eng, {}, undefined))!.props.props as { columnsHint: number }).columnsHint).toBe(80);
});

test("all panels off: zero panels, total 1, nothing dropped", async () => {
  const eng = await boot({ store: { panels: { hello: false, clock: false } } });
  const p = clientOf(await render(eng))!.props.props as { panels: unknown[]; total: number; dropped: string[] };
  expect(p.panels).toEqual([]);
  expect(p.total).toBe(1);
  expect(p.dropped).toEqual([]);
});

// ── I5 ──
test("I5: a poll result over 64 KiB is not stored; error.<id> is set; the next good poll clears it", async () => {
  let big = true;
  const fat: Panel<{ blob: string }> = {
    id: "fat",
    label: "fat",
    defaultOn: true,
    minRows: 1,
    wantRows: 1,
    everyMs: 1000,
    poll: async () => ({ blob: big ? "x".repeat(70 * 1024) : "ok" }),
    view: () => ({ id: "fat", lines: [{ text: "fat" }] }),
  };
  const eng = await boot({}, makeRegister([fat]));
  expect(eng.store["data.fat"]).toBeUndefined();
  expect(eng.store["error.fat"]).toBe("data too large");
  big = false;
  await eng.tick("fat");
  expect(eng.store["data.fat"]).toMatchObject({ data: { blob: "ok" } });
  expect(eng.store["error.fat"]).toBe("");
});

test("a throwing poll lands in error.<id> and never breaks the loop", async () => {
  const boom: Panel<never> = {
    id: "boom",
    label: "boom",
    defaultOn: true,
    minRows: 1,
    wantRows: 1,
    everyMs: 1000,
    poll: async () => {
      throw new Error("nope");
    },
    view: () => ({ id: "boom", lines: [{ text: "boom" }] }),
  };
  const eng = await boot({}, makeRegister([boom]));
  expect(String(eng.store["error.boom"])).toContain("nope");
  const p = clientOf(await render(eng))!.props.props as { panels: { error: string | null }[] };
  expect(p.panels[0]!.error).toContain("nope");
});

// ── ui.message / I7 (fake level) ──
test("ui.message toggle flips store.panels, invalidates, leaves data.* untouched, never re-registers", async () => {
  const eng = await boot({ now: 5000 });
  const dataBefore = JSON.stringify(eng.store["data.hello"]);
  const before = eng.invalidations;
  await eng.fire("ui.message", { data: { kind: "toggle", id: "clock" } });
  expect((eng.store.panels as Record<string, boolean>).clock).toBe(false);
  expect(eng.invalidations).toBeGreaterThan(before);
  expect(JSON.stringify(eng.store["data.hello"])).toBe(dataBefore);
  expect(eng.registered).toEqual(["telltale"]);
  const p = clientOf(await render(eng))!.props.props as { panels: { id: string }[] };
  expect(p.panels.map((x) => x.id)).toEqual(["hello"]);
});

test("ui.message with unknown id or other data is ignored", async () => {
  const eng = await boot();
  const snapshot = JSON.stringify(eng.store);
  await eng.fire("ui.message", { data: { kind: "toggle", id: "nope" } });
  await eng.fire("ui.message", { data: { kind: "other" } });
  expect(JSON.stringify(eng.store)).toBe(snapshot);
});

// ── I1 ──
test("I1: every allowed op is exercised at least once across start + tick + render + toggle", async () => {
  const eng = await boot();
  await eng.tick("clock");
  await render(eng);
  await eng.fire("ui.message", { data: { kind: "toggle", id: "clock" } });
  for (const op of ALLOWED) expect(eng.calls[op] ?? 0).toBeGreaterThan(0);
  expect(Object.keys(eng.calls).sort()).toEqual([...ALLOWED].sort());
});

test("I1: claude plugin validate --strict reports exactly the seven allowed calls", () => {
  const r = Bun.spawnSync(["claude", "plugin", "validate", "--strict", "--json", "."], {
    env: { ...process.env, CLAUDE_CODE_ENABLE_FUNCTION_HOOKS: "1" },
  });
  const report = JSON.parse(r.stdout.toString()) as { success: boolean; contents: { type: string; notes: string[] }[] };
  expect(report.success).toBe(true);
  const notes = report.contents.filter((c) => c.type === "hooks").flatMap((c) => c.notes);
  const calls = notes
    .filter((n) => n.includes(" calls: "))
    .flatMap((n) => n.split("calls:")[1]!.split(",").map((s) => s.trim()));
  expect(new Set(calls)).toEqual(new Set(ALLOWED));
});
