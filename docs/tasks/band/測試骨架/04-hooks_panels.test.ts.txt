// Ticket 04: panel types, hello, clock, registry. SDD §1.1, §2.2, §2.2a, §2.3; I6, I10. Exact match.
import { expect, test } from "bun:test";
import type { Panel } from "../../plugins/telltale/hooks/panel";
import { clock } from "../../plugins/telltale/hooks/panels/clock";
import { hello } from "../../plugins/telltale/hooks/panels/hello";
import { PANELS } from "../../plugins/telltale/hooks/panels/index";
import { displayWidth } from "../../plugins/telltale/hooks/width";

const ID = /^[a-z][a-z0-9-]{0,15}$/;

test("registry: hello then clock, unique ids that match the id grammar", () => {
  expect(PANELS.map((p) => p.id)).toEqual(["hello", "clock"]);
  expect(new Set(PANELS.map((p) => p.id)).size).toBe(PANELS.length);
  for (const p of PANELS) expect(p.id).toMatch(ID);
});

test("metadata per SDD §2.3 / §2.2a", () => {
  expect([hello.minRows, hello.wantRows, hello.everyMs, hello.defaultOn]).toEqual([1, 2, 5000, true]);
  expect([clock.minRows, clock.wantRows, clock.everyMs, clock.defaultOn]).toEqual([1, 1, 1000, true]);
  for (const p of PANELS) {
    expect(p.minRows).toBeGreaterThanOrEqual(1);
    expect(p.wantRows).toBeGreaterThanOrEqual(p.minRows);
    if (p.poll) expect(p.everyMs ?? 0).toBeGreaterThanOrEqual(1000);
  }
});

test("I10: hello without data draws a visible dim placeholder, never nothing", () => {
  const v = hello.view(undefined, 40, 2);
  expect(v.id).toBe("hello");
  expect(v.lines.length).toBeGreaterThanOrEqual(1);
  expect(v.lines[0]!.text).toContain("waiting for first tick");
  expect(v.lines[0]!.tone).toBe("dim");
});

test("hello view is pure: same input, same output", () => {
  const d = { tick: 1_700_000_000_000 };
  expect(hello.view(d, 40, 2)).toEqual(hello.view(d, 40, 2));
});

test("hello line 1: HH:MM:SS of the tick, tone by parity of the second (even up / odd flat)", () => {
  const even = { tick: Date.UTC(2026, 0, 1, 0, 0, 2) };
  const odd = { tick: Date.UTC(2026, 0, 1, 0, 0, 3) };
  expect(hello.view(even, 40, 2).lines[0]!.text).toMatch(/^hello · \d\d:\d\d:\d\d$/);
  expect(hello.view(even, 40, 2).lines[0]!.tone).toBe("up");
  expect(hello.view(odd, 40, 2).lines[0]!.tone).toBe("flat");
});

test("hello line 2 is dim, carries CJK and names the room it was given", () => {
  const v = hello.view({ tick: 0 }, 30, 2);
  expect(v.lines.length).toBe(2);
  expect(v.lines[1]!.text).toBe("寬 30 欄 · 高 2 列");
  expect(v.lines[1]!.tone).toBe("dim");
});

test("hello with one row draws one line only", () => {
  expect(hello.view({ tick: 0 }, 40, 1).lines.length).toBe(1);
});

test("hello.poll returns the tick from io.now (I6: pure in its input)", async () => {
  expect(await hello.poll!({ now: () => 42 })).toEqual({ tick: 42 });
  expect(await hello.poll!({ now: () => 42 })).toEqual(await hello.poll!({ now: () => 42 }));
});

test("clock: HH:MM:SS, or a visible --:--:-- placeholder without data", () => {
  expect(clock.view(undefined, 20, 1).lines).toEqual([{ text: "--:--:--", tone: "dim" }]);
  const v = clock.view({ now: Date.UTC(2026, 0, 1, 12, 34, 56) }, 20, 1);
  expect(v.lines.length).toBe(1);
  expect(v.lines[0]!.text).toMatch(/^\d\d:\d\d:\d\d$/);
});

test("clock.poll returns now", async () => {
  expect(await clock.poll!({ now: () => 7 })).toEqual({ now: 7 });
});

test("every panel line fits the columns it was given (CJK counts 2) and rows are respected", () => {
  const samples: Record<string, unknown> = { hello: { tick: 0 }, clock: { now: 0 } };
  for (const p of PANELS as readonly Panel<unknown>[]) {
    for (const cols of [20, 30, 45, 80]) {
      for (const rows of [p.minRows, p.wantRows]) {
        for (const data of [undefined, samples[p.id]]) {
          const v = p.view(data, cols, rows);
          expect(v.lines.length).toBeLessThanOrEqual(rows);
          expect(v.lines.length).toBeGreaterThanOrEqual(1);
          for (const l of v.lines) expect(displayWidth(l.text)).toBeLessThanOrEqual(cols);
        }
      }
    }
  }
});
