// Ticket 02: displayWidth / fit. SDD §1.3, invariant I4.
// Pure functions, no dependencies, no `claude-code` import.

// East Asian Wide/Fullwidth ranges per SDD §1.3: CJK ideographs, kana, hangul,
// fullwidth ASCII, CJK punctuation & symbols. These count 2 display columns.
const WIDE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x115f],
  [0x2e80, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe4f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x20000, 0x2fffd],
  [0x30000, 0x3fffd],
];

const isWide = (codePoint: number): boolean =>
  WIDE_RANGES.some(([lo, hi]) => codePoint >= lo && codePoint <= hi);

// C0 controls and DEL count 0 columns.
const isControl = (codePoint: number): boolean => codePoint <= 0x1f || codePoint === 0x7f;

const widthOf = (codePoint: number): number => {
  if (isControl(codePoint)) return 0;
  return isWide(codePoint) ? 2 : 1;
};

export const displayWidth = (s: string): number => {
  let width = 0;
  for (const ch of s) {
    width += widthOf(ch.codePointAt(0) as number);
  }
  return width;
};

const ELLIPSIS = "…"; // 1 display column

export const fit = (s: string, columns: number): string => {
  if (columns <= 0) return "";
  if (displayWidth(s) <= columns) return s;

  const budget = columns - 1; // reserve 1 column for the ellipsis
  let width = 0;
  let result = "";
  for (const ch of s) {
    const w = widthOf(ch.codePointAt(0) as number);
    if (width + w > budget) break;
    width += w;
    result += ch;
  }
  return result + ELLIPSIS;
};
