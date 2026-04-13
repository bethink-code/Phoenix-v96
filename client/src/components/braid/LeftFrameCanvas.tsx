// Left-frame canvas — renders candles + levels + pools.
// Phase 1 minimum: no wire, no verdict dots, no right-frame arms, no now badge.
// Visual values borrowed directly from Scratch/zenny_braid_three_layer.html (per the
// "HTML mockups are visual references only" rule — they win on colours and spacing).

import { useEffect, useRef } from "react";
import type { AnalysisStateClient } from "./types";

// Palette — extracted from the mockup
const C = {
  bg: "#f8f7f4",
  grid: "rgba(0,0,0,0.035)",
  txt: "#888780",
  txtP: "#3d3d3a",
  bodyUp: "rgba(29,158,117,0.88)",
  bodyDn: "rgba(226,75,74,0.88)",
  wickUp: "rgba(29,158,117,0.5)",
  wickDn: "rgba(226,75,74,0.5)",
  res: "rgba(226,75,74,0.13)",
  resBdr: "rgba(226,75,74,0.65)",
  sup: "rgba(29,158,117,0.13)",
  supBdr: "rgba(29,158,117,0.65)",
  level: "rgba(61,61,58,0.25)",
  nowLine: "rgba(61,61,58,0.45)",
};

interface Props {
  state: AnalysisStateClient;
}

export function LeftFrameCanvas({ state }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const dpr = window.devicePixelRatio || 1;
    const W = parent.clientWidth;
    const H = 540;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    drawScene(ctx, W, H, state);
  }, [state]);

  return <canvas ref={canvasRef} className="block w-full" />;
}

// ---------------------------------------------------------------------------

function drawScene(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  state: AnalysisStateClient,
): void {
  // Padding — leaves room for the price axis on the left and time labels on the bottom
  const pad = { l: 60, r: 16, t: 20, b: 32 };
  const cw = W - pad.l - pad.r;
  const ch = H - pad.t - pad.b;

  // Background
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  if (state.candles.length === 0) {
    ctx.fillStyle = C.txt;
    ctx.font = "12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("no candles", W / 2, H / 2);
    return;
  }

  // Y axis: derive from candle high/low across all candles, with a small padding
  const allPrices = state.candles.flatMap((c) => [c.high, c.low]);
  let minP = Math.min(...allPrices);
  let maxP = Math.max(...allPrices);
  // Pad the Y range by 2% so candles don't sit on the edges
  const padPrice = (maxP - minP) * 0.02;
  minP -= padPrice;
  maxP += padPrice;
  const pRange = maxP - minP;
  const toY = (p: number): number => pad.t + ch - ((p - minP) / pRange) * ch;
  const N = state.candles.length;
  const candleWidth = Math.max(2, Math.floor(cw / N) - 1);
  const halfWidth = Math.max(1, Math.floor(candleWidth / 2));
  const toX = (i: number): number => pad.l + ((i + 0.5) / N) * cw;

  // Grid lines (5 horizontal divisions)
  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 0.5;
  for (let g = 0; g <= 5; g++) {
    const gy = pad.t + (g / 5) * ch;
    ctx.beginPath();
    ctx.moveTo(pad.l, gy);
    ctx.lineTo(pad.l + cw, gy);
    ctx.stroke();
  }

  // Y axis labels
  ctx.fillStyle = C.txt;
  ctx.font = "10px system-ui";
  ctx.textAlign = "right";
  for (let g = 0; g <= 5; g++) {
    const p = minP + (g / 5) * pRange;
    const gy = pad.t + ch - (g / 5) * ch;
    ctx.fillText(formatPrice(p), pad.l - 5, gy + 3.5);
  }

  // ---- LEVELS (drawn first, behind everything) ----
  ctx.strokeStyle = C.level;
  ctx.lineWidth = 0.5;
  for (const level of state.levels) {
    if (level.graduatedToPoolId !== null) continue; // pools draw the line themselves
    const y = toY(level.price);
    if (y < pad.t || y > pad.t + ch) continue;
    const startX = toX(Math.max(0, level.swingCandleIndex));
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(pad.l + cw, y);
    ctx.stroke();
  }

  // ---- POOLS (translucent rectangles, behind candles) ----
  for (const pool of state.pools) {
    const yTop = toY(pool.wickHigh);
    const yBot = toY(pool.wickLow);
    const x1 = toX(Math.max(0, pool.birthCandleIndex));
    const x2 = pad.l + cw; // active pools extend to "now"
    const fill = pool.type === "RESISTANCE" ? C.res : C.sup;
    const border = pool.type === "RESISTANCE" ? C.resBdr : C.supBdr;
    ctx.fillStyle = fill;
    ctx.fillRect(x1, yTop, x2 - x1, yBot - yTop);
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.strokeRect(x1, yTop, x2 - x1, yBot - yTop);
  }

  // ---- CANDLES ----
  for (let i = 0; i < N; i++) {
    const c = state.candles[i];
    const x = toX(i);
    const yO = toY(c.open);
    const yC = toY(c.close);
    const yH = toY(c.high);
    const yL = toY(c.low);
    const isUp = c.close >= c.open;

    // Wick
    ctx.strokeStyle = isUp ? C.wickUp : C.wickDn;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, yH);
    ctx.lineTo(x, Math.min(yO, yC));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, Math.max(yO, yC));
    ctx.lineTo(x, yL);
    ctx.stroke();

    // Body
    const bT = Math.min(yO, yC);
    const bH = Math.max(1.5, Math.abs(yC - yO));
    ctx.fillStyle = isUp ? C.bodyUp : C.bodyDn;
    ctx.fillRect(x - halfWidth, bT, halfWidth * 2, bH);
  }

  // Border around the chart area
  ctx.strokeStyle = "rgba(0,0,0,0.04)";
  ctx.lineWidth = 0.5;
  ctx.strokeRect(pad.l, pad.t, cw, ch);

  // Header label — symbol + timeframe + candle count + computed time
  ctx.fillStyle = C.txtP;
  ctx.font = "500 11px system-ui";
  ctx.textAlign = "left";
  ctx.fillText(
    `${state.symbol} · ${state.timeframe} · ${state.candles.length} candles`,
    pad.l + 4,
    pad.t + 13,
  );
}

function formatPrice(p: number): string {
  if (p >= 10_000) return "$" + (p / 1000).toFixed(1) + "K";
  if (p >= 1_000) return "$" + p.toFixed(0);
  if (p >= 1) return "$" + p.toFixed(2);
  return "$" + p.toFixed(4);
}
