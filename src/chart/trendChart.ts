import { ChartRenderer } from "./renderer.js";
import { DIM, BG, FG, MUTED, GRID, FONT_REGULAR, FONT_BOLD, colorForIndex, makeScale } from "./theme.js";
import { shortMonth, tickIndices, type MonthKey } from "./series.js";

export interface TrendChartData {
  axis: MonthKey[];
  values: number[];
  title: string;     // person name (already resolved)
  subtitle: string;  // category
  unit: string;
}

export function renderTrendChart(d: TrendChartData): Buffer {
  const r = new ChartRenderer(DIM.width, DIM.height);
  r.background(BG);
  const { pad } = DIM;
  const plotW = DIM.width - pad.left - pad.right;
  const plotH = DIM.height - pad.top - pad.bottom;
  const x0 = pad.left, y0 = pad.top, x1 = pad.left + plotW, y1 = pad.top + plotH;

  r.text(d.title, pad.left, 46, { font: `bold 32px ${FONT_BOLD}`, color: FG });
  r.text(`${d.subtitle} · per month (${d.unit})`, pad.left, 74, { font: `16px ${FONT_REGULAR}`, color: MUTED });

  const yMax = Math.max(1, ...d.values);
  const sx = makeScale(0, Math.max(1, d.axis.length - 1), x0, x1);
  const sy = makeScale(0, yMax, y1, y0);
  for (let i = 0; i <= 5; i++) {
    const v = (yMax / 5) * i, yy = sy(v);
    r.line(x0, yy, x1, yy, { color: GRID, width: 1 });
    r.text(Math.round(v).toLocaleString("en-US"), x0 - 10, yy + 4, { font: `14px ${FONT_REGULAR}`, color: MUTED, align: "right" });
  }
  for (const i of tickIndices(d.axis.length)) {
    r.text(shortMonth(d.axis[i]!), sx(i), y1 + 22, { font: `13px ${FONT_REGULAR}`, color: MUTED, align: "center" });
  }
  const pts: [number, number][] = d.values.map((v, i) => [sx(i), sy(v)]);
  const lineColor = colorForIndex(0); // colorForIndex returns a guaranteed string (PALETTE[0] is string|undefined under noUncheckedIndexedAccess)
  r.polyline(pts, { color: lineColor, width: 3 });
  if (pts.length === 1) r.rect(pts[0]![0] - 3, pts[0]![1] - 3, 6, 6, { color: lineColor }); // single point marker
  return r.toBuffer();
}
