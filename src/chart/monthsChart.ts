import { ChartRenderer } from "./renderer.js";
import { DIM, BG, FG, MUTED, GRID, FAINT_LINE, FONT_REGULAR, FONT_BOLD, colorForIndex, makeScale } from "./theme.js";
import { OTHERS_ID, shortMonth, tickIndices, type MonthKey } from "./series.js";

export interface MonthsChartData {
  axis: MonthKey[];
  users: string[];      // top-N ids, optional trailing OTHERS_ID
  perMonth: number[][]; // [monthIndex][userIndex]
  names: Map<string, string>;
  title: string;
  unit: string;
}

export function renderMonthsChart(d: MonthsChartData): Buffer {
  const r = new ChartRenderer(DIM.width, DIM.height);
  r.background(BG);
  const { pad } = DIM;
  const plotW = DIM.width - pad.left - pad.right;
  const plotH = DIM.height - pad.top - pad.bottom;
  const x0 = pad.left, y0 = pad.top, x1 = pad.left + plotW, y1 = pad.top + plotH;

  r.text(d.title, pad.left, 52, { font: `bold 34px ${FONT_BOLD}`, color: FG });

  const totals = d.perMonth.map((seg) => seg.reduce((a, b) => a + b, 0));
  const yMax = Math.max(1, ...totals);
  const sy = makeScale(0, yMax, y1, y0);
  for (let i = 0; i <= 5; i++) {
    const v = (yMax / 5) * i, yy = sy(v);
    r.line(x0, yy, x1, yy, { color: GRID, width: 1 });
    r.text(Math.round(v).toLocaleString("en-US"), x0 - 10, yy + 4, { font: `14px ${FONT_REGULAR}`, color: MUTED, align: "right" });
  }

  const n = d.axis.length;
  const slot = plotW / Math.max(1, n);
  const barW = Math.min(48, slot * 0.7);
  const colorFor = (ui: number) => (d.users[ui] === OTHERS_ID ? FAINT_LINE : colorForIndex(ui));

  d.perMonth.forEach((seg, mi) => {
    const cx = x0 + slot * (mi + 0.5);
    let acc = 0;
    seg.forEach((v, ui) => {
      if (v <= 0) return;
      const yTop = sy(acc + v), yBot = sy(acc);
      r.rect(cx - barW / 2, yTop, barW, yBot - yTop, { color: colorFor(ui) });
      acc += v;
    });
  });
  for (const i of tickIndices(n, 12)) {
    r.text(shortMonth(d.axis[i]!), x0 + slot * (i + 0.5), y1 + 22, { font: `13px ${FONT_REGULAR}`, color: MUTED, align: "center" });
  }

  let ly = pad.top + 6;
  d.users.forEach((u, ui) => {
    r.rect(x1 + 24, ly - 9, 14, 14, { color: colorFor(ui) });
    const label = r.fit(u === OTHERS_ID ? "the rest of us" : (d.names.get(u) ?? u), pad.right - 56, `15px ${FONT_REGULAR}`);
    r.text(label, x1 + 44, ly + 3, { font: `15px ${FONT_REGULAR}`, color: FG });
    ly += 26;
  });
  r.text(`(${d.unit} per month, stacked)`, pad.left, DIM.height - 24, { font: `13px ${FONT_REGULAR}`, color: MUTED });
  return r.toBuffer();
}
