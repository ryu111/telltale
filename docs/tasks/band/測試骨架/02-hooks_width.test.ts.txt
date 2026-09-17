// Ticket 02: displayWidth / fit. SDD §1.3, invariant I4. Evaluation: exact match.
import { expect, test } from "bun:test";
import { displayWidth, fit } from "../../plugins/telltale/hooks/width";

test("ascii counts 1 per char", () => {
  expect(displayWidth("hello")).toBe(5);
});

test("CJK ideographs count 2", () => {
  expect(displayWidth("寬度")).toBe(4);
});

test("mixed ascii and CJK", () => {
  expect(displayWidth("a寬b")).toBe(4);
});

test("fullwidth ascii, hangul and kana are wide", () => {
  expect(displayWidth("Ａ")).toBe(2);
  expect(displayWidth("한")).toBe(2);
  expect(displayWidth("あ")).toBe(2);
});

test("CJK punctuation is wide, box drawing is not", () => {
  expect(displayWidth("，")).toBe(2);
  expect(displayWidth("─")).toBe(1);
  expect(displayWidth("…")).toBe(1);
});

test("control characters count 0", () => {
  expect(displayWidth("ab")).toBe(2);
  expect(displayWidth("")).toBe(0);
});

test("empty string is 0", () => {
  expect(displayWidth("")).toBe(0);
});

test("fit leaves a string that fits untouched, exact width included", () => {
  expect(fit("abc", 3)).toBe("abc");
  expect(fit("abc", 10)).toBe("abc");
  expect(fit("寬度", 4)).toBe("寬度");
});

test("fit truncates with an ellipsis inside the budget", () => {
  const s = fit("hello world", 5);
  expect(s).toBe("hell…");
  expect(displayWidth(s)).toBe(5);
});

test("fit never splits a wide char", () => {
  // 寬度 = 4 columns, ellipsis = 1: "寬度…" is exactly 5; "寬度計" would be 6.
  expect(fit("寬度計算", 5)).toBe("寬度…");
  // budget 4: "寬…" (3) — "寬度" (4) would leave no room for the ellipsis.
  expect(fit("寬度計算", 4)).toBe("寬…");
});

test("fit with a budget of 1 keeps only the ellipsis; 0 or less gives empty", () => {
  expect(fit("hello", 1)).toBe("…");
  expect(fit("hello", 0)).toBe("");
  expect(fit("hello", -3)).toBe("");
});

test("fit output always satisfies displayWidth <= columns", () => {
  for (const s of ["a", "寬", "a寬b寬c", "hello 世界 ok", "─".repeat(50)]) {
    for (let c = 0; c <= 12; c++) {
      expect(displayWidth(fit(s, c))).toBeLessThanOrEqual(Math.max(c, 0));
    }
  }
});

test("astral-plane CJK (surrogate pairs) and the compatibility ranges are wide", () => {
  expect(displayWidth("\u{20000}")).toBe(2); // CJK Extension B
  expect(displayWidth("\u{30000}")).toBe(2); // CJK Extension G
  expect(displayWidth("a\u{20000}b")).toBe(4);
  expect(fit("\u{20000}\u{20000}", 3)).toBe("\u{20000}…");
  expect(displayWidth("ᄀ")).toBe(2); // Hangul Jamo
  expect(displayWidth("豈")).toBe(2); // CJK Compatibility Ideographs
  expect(displayWidth("︰")).toBe(2); // CJK Compatibility Forms
  expect(displayWidth("￠")).toBe(2); // Fullwidth signs
});
