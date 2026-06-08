import { ChartRenderer } from "./renderer.js";
import { DIM, BG, FG, MUTED, GRID, FAINT_LINE, FONT_REGULAR, FONT_BOLD, assignColors, makeScale } from "./theme.js";
import { shortMonth, tickIndices, type RaceLine, type MonthKey } from "./series.js";

const TOP_BOLD = 8; // top N lines get a bold color + legend entry; the rest are faint grey

export interface RaceChartData {
  axis: MonthKey[];
  lines: RaceLine[]; // pre-sorted by total desc
  names: Map<string, string>;
  title: string;
  unit: string;
}

export function renderRaceChart(d: RaceChartData): Buffer {
  const r = new ChartRenderer(DIM.width, DIM.height);
  r.background(BG);
  const { pad } = DIM;
  const plotW = DIM.width - pad.left - pad.right;
  const plotH = DIM.height - pad.top - pad.bottom;
  const x0 = pad.left, y0 = pad.top, x1 = pad.left + plotW, y1 = pad.top + plotH;

  r.text(d.title, pad.left, 52, { font: `bold 34px ${FONT_BOLD}`, color: FG });

  const yMax = Math.max(1, ...d.lines.map((l) => l.total));
  const sx = makeScale(0, Math.max(1, d.axis.length - 1), x0, x1);
  const sy = makeScale(0, yMax, y1, y0); // inverted: 0 at bottom

  // y gridlines + labels (5 bands)
  for (let i = 0; i <= 5; i++) {
    const v = (yMax / 5) * i;
    const yy = sy(v);
    r.line(x0, yy, x1, yy, { color: GRID, width: 1 });
    r.text(Math.round(v).toLocaleString("en-US"), x0 - 10, yy + 4, { font: `14px ${FONT_REGULAR}`, color: MUTED, align: "right" });
  }
  // x labels
  for (const i of tickIndices(d.axis.length)) {
    r.text(shortMonth(d.axis[i]!), sx(i), y1 + 22, { font: `13px ${FONT_REGULAR}`, color: MUTED, align: "center" });
  }

  const boldIds = d.lines.slice(0, TOP_BOLD).map((l) => l.userId);
  const colors = assignColors(boldIds);

  // faint lines first (background), then bold on top
  const draw = (l: RaceLine, color: string, width: number, alpha: number) => {
    // split into contiguous non-null runs so gaps before a user's first month aren't drawn
    let run: [number, number][] = [];
    const flush = () => { r.polyline(run, { color, width, alpha }); run = []; };
    l.points.forEach((p, i) => { if (p === null) flush(); else run.push([sx(i), sy(p)]); });
    flush();
  };
  for (const l of d.lines.slice(TOP_BOLD)) draw(l, FAINT_LINE, 1.5, 0.7);
  d.lines.slice(0, TOP_BOLD).forEach((l) => draw(l, colors.get(l.userId)!, 3, 1));

  // legend (right gutter), top lines only
  let ly = pad.top + 6;
  for (const l of d.lines.slice(0, TOP_BOLD)) {
    const color = colors.get(l.userId)!;
    r.rect(x1 + 24, ly - 9, 14, 14, { color });
    const label = r.fit(d.names.get(l.userId) ?? l.userId, pad.right - 56, `15px ${FONT_REGULAR}`);
    r.text(label, x1 + 44, ly + 3, { font: `15px ${FONT_REGULAR}`, color: FG });
    ly += 26;
  }
  r.text(`(${d.unit}, all-time cumulative)`, pad.left, DIM.height - 24, { font: `13px ${FONT_REGULAR}`, color: MUTED });
  return r.toBuffer();
}
