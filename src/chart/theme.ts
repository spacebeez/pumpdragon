// Dragon-styled chart theme: dark canvas, ember/gold palette. Pure constants + helpers (no canvas import).

export const DIM = {
  width: 1200,
  height: 675,
  scale: 2, // device pixel ratio — render at 2x for crisp text, canvas is width*scale × height*scale
  pad: { top: 96, right: 220, bottom: 72, left: 88 }, // right pad leaves room for an inline legend
} as const;

export const BG = "#0d0d12";
export const FG = "#e8e6e3";
export const MUTED = "#8a8a99";
export const GRID = "#23232e";
export const FAINT_LINE = "#34343f"; // non-top "everyone else" race lines

// Registered DejaVu family aliases (see renderer.ts). On dev machines without the TTFs,
// canvas falls back to a default font — fine for smoke tests.
export const FONT_REGULAR = "DragonChart";
export const FONT_BOLD = "DragonChartBold";

export const PALETTE = [
  "#ff6b35", "#ffd166", "#06d6a0", "#4cc9f0",
  "#c77dff", "#ef476f", "#f4a261", "#90be6d",
] as const;

export function colorForIndex(i: number): string {
  return PALETTE[i % PALETTE.length]!;
}

/** Deterministic id→color by position (caller passes ids already ordered, e.g. top→bottom). */
export function assignColors(ids: string[]): Map<string, string> {
  const m = new Map<string, string>();
  ids.forEach((id, i) => m.set(id, colorForIndex(i)));
  return m;
}

/** Linear scale domain→range. Zero-width domain → constant range midpoint (no divide-by-zero). */
export function makeScale(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  if (d1 === d0) return () => (r0 + r1) / 2;
  const m = (r1 - r0) / (d1 - d0);
  return (v: number) => r0 + (v - d0) * m;
}
