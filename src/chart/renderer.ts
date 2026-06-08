// Thin @napi-rs/canvas wrapper: dumb drawing primitives only. Chart logic (scales, layout) lives in
// the composer modules (raceChart/trendChart/monthsChart). Renders at a device scale for crisp output.
import { existsSync } from "node:fs";
import { createCanvas, GlobalFonts, type SKRSContext2D } from "@napi-rs/canvas";
import { DIM, FONT_REGULAR, FONT_BOLD } from "./theme.js";

// Register DejaVu under our family aliases IF present (the Alpine image installs font-dejavu).
// On dev machines without these paths, canvas falls back to a system font — fine for tests/local.
for (const [path, alias] of [
  ["/usr/share/fonts/dejavu/DejaVuSans.ttf", FONT_REGULAR],
  ["/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf", FONT_BOLD],
] as const) {
  if (existsSync(path)) GlobalFonts.registerFromPath(path, alias);
}

export interface TextOpts { font: string; color: string; align?: CanvasTextAlign; baseline?: CanvasTextBaseline; }
export interface LineOpts { color: string; width: number; alpha?: number; }
export interface RectOpts { color: string; alpha?: number; }

export class ChartRenderer {
  private readonly canvas;
  private readonly ctx: SKRSContext2D;
  constructor(private readonly w: number, private readonly h: number, private readonly scale = DIM.scale) {
    this.canvas = createCanvas(w * scale, h * scale);
    this.ctx = this.canvas.getContext("2d");
    this.ctx.scale(scale, scale); // draw in logical (w×h) coordinates, output is scaled up
  }

  background(color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.w, this.h);
  }

  text(s: string, x: number, y: number, o: TextOpts): void {
    this.ctx.font = o.font;
    this.ctx.fillStyle = o.color;
    this.ctx.textAlign = o.align ?? "left";
    this.ctx.textBaseline = o.baseline ?? "alphabetic";
    this.ctx.fillText(s, x, y);
  }

  /** Truncate a string to fit `maxWidth` px in the given font, adding an ellipsis. */
  fit(s: string, maxWidth: number, font: string): string {
    this.ctx.font = font;
    if (this.ctx.measureText(s).width <= maxWidth) return s;
    let out = s;
    while (out.length > 1 && this.ctx.measureText(out + "…").width > maxWidth) out = out.slice(0, -1);
    return out + "…";
  }

  line(x1: number, y1: number, x2: number, y2: number, o: LineOpts): void {
    this.ctx.save();
    this.ctx.globalAlpha = o.alpha ?? 1;
    this.ctx.strokeStyle = o.color;
    this.ctx.lineWidth = o.width;
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();
    this.ctx.restore();
  }

  /** Polyline through pixel points; `null` x/y are not supported here — caller must split gaps. */
  polyline(points: [number, number][], o: LineOpts): void {
    if (points.length < 2) return;
    this.ctx.save();
    this.ctx.globalAlpha = o.alpha ?? 1;
    this.ctx.strokeStyle = o.color;
    this.ctx.lineWidth = o.width;
    this.ctx.lineJoin = "round";
    this.ctx.beginPath();
    this.ctx.moveTo(points[0]![0], points[0]![1]);
    for (let i = 1; i < points.length; i++) this.ctx.lineTo(points[i]![0], points[i]![1]);
    this.ctx.stroke();
    this.ctx.restore();
  }

  rect(x: number, y: number, w: number, h: number, o: RectOpts): void {
    this.ctx.save();
    this.ctx.globalAlpha = o.alpha ?? 1;
    this.ctx.fillStyle = o.color;
    this.ctx.fillRect(x, y, w, h);
    this.ctx.restore();
  }

  toBuffer(): Buffer {
    return this.canvas.toBuffer("image/png");
  }
}
