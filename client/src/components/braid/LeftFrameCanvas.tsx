// Left-frame canvas — multi-TF levels with confluence weighting.
// Phase 2 refactor: lines are drawn at the close of the swing candle on each
// source TF, extending from the source candle X-position to the right edge.
// Stronger levels (higher confluence) render with more opacity + weight.
// Pools are one-sided rectangles on the stops side of the line.

import { useEffect, useRef } from "react";
import type { AnalysisStateClient, LevelStrengthClient } from "./types";

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
  // Active pools — translucent
  resAlive: "rgba(226,75,74,0.13)",
  resAliveBdr: "rgba(226,75,74,0.65)",
  supAlive: "rgba(29,158,117,0.13)",
  supAliveBdr: "rgba(29,158,117,0.65)",
  // Taken pools — opaque
  resDead: "rgba(226,75,74,0.55)",
  resDeadBdr: "rgba(226,75,74,0.95)",
  supDead: "rgba(29,158,117,0.55)",
  supDeadBdr: "rgba(29,158,117,0.95)",
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
  const pad = { l: 60, r: 100, t: 20, b: 32 };
  const cw = W - pad.l - pad.r;
  const ch = H - pad.t - pad.b;

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  if (state.candles.length === 0) {
    ctx.fillStyle = C.txt;
    ctx.font = "12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("no candles", W / 2, H / 2);
    return;
  }

  // Y axis derived ONLY from candles. Level prices outside this range are
  // simply not drawn — including them in the bounds would squish the candles
  // into a tiny band when a higher-TF level is far away (e.g. a Monthly $108k
  // level on a 15m chart with current price $71k). This matches every
  // standard charting tool.
  const candlePrices: number[] = state.candles.flatMap((c) => [c.high, c.low]);
  let minP = Math.min(...candlePrices);
  let maxP = Math.max(...candlePrices);
  const padPrice = (maxP - minP) * 0.02;
  minP -= padPrice;
  maxP += padPrice;
  const pRange = maxP - minP;
  const toY = (p: number): number => pad.t + ch - ((p - minP) / pRange) * ch;
  const N = state.candles.length;
  const candleWidth = Math.max(2, Math.floor(cw / N) - 1);
  const halfWidth = Math.max(1, Math.floor(candleWidth / 2));
  const toX = (i: number): number => pad.l + ((i + 0.5) / N) * cw;

  // Grid
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

  // ---- LEVELS ----
  // Sort weakest → strongest so strong levels draw on top
  const sortedLevels = [...state.levels].sort(
    (a, b) => strengthRank(a.strength) - strengthRank(b.strength),
  );
  for (const level of sortedLevels) {
    if (level.graduatedToPoolId !== null) continue; // pools own the rectangle
    const y = toY(level.price);
    if (y < pad.t || y > pad.t + ch) continue;
    const opacity = levelOpacity(level.strength);
    const rgb = level.side === "RESISTANCE" ? "226,75,74" : "29,158,117";
    ctx.strokeStyle = `rgba(${rgb},${opacity})`;
    ctx.lineWidth =
      level.strength === "very_strong"
        ? 2.2
        : level.strength === "strong"
          ? 1.6
          : level.strength === "medium"
            ? 1.1
            : level.strength === "weak"
              ? 0.7
              : 0.5;
    const startX = toX(Math.max(0, Math.min(N - 1, level.swingCandleIndexOnPrimary)));
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(pad.l + cw, y);
    ctx.stroke();

    // Right-edge TF tag — shows which TFs confirm this level
    // e.g. "W+D+4H" for a 3-TF confluent level
    const tag = buildTfTag(level.sourceTimeframe, level.matchingTimeframes);
    ctx.fillStyle = `rgba(${rgb},${Math.min(1, opacity + 0.25)})`;
    ctx.font = `${level.strength === "very_strong" || level.strength === "strong" ? "500 " : ""}10px system-ui`;
    ctx.textAlign = "left";
    ctx.fillText(tag, pad.l + cw + 4, y + 3);
  }
  ctx.lineWidth = 1;

  // ---- ACTIVE POOLS (translucent, behind candles) ----
  const activePools = state.pools.filter((p) => p.status === "active");
  const deadPools = state.pools.filter((p) => p.status === "dead");
  for (const pool of activePools) {
    const yTop = toY(pool.wickHigh);
    const yBot = toY(pool.wickLow);
    const x1 = toX(
      Math.max(0, Math.min(N - 1, pool.birthCandleIndexOnPrimary)),
    );
    const x2 = pad.l + cw;
    const fill = pool.type === "RESISTANCE" ? C.resAlive : C.supAlive;
    const border = pool.type === "RESISTANCE" ? C.resAliveBdr : C.supAliveBdr;
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

    const bT = Math.min(yO, yC);
    const bH = Math.max(1.5, Math.abs(yC - yO));
    ctx.fillStyle = isUp ? C.bodyUp : C.bodyDn;
    ctx.fillRect(x - halfWidth, bT, halfWidth * 2, bH);
  }

  // ---- DEAD POOLS (opaque, on top of candles) ----
  for (const pool of deadPools) {
    const yTop = toY(pool.wickHigh);
    const yBot = toY(pool.wickLow);
    const x1 = toX(
      Math.max(0, Math.min(N - 1, pool.birthCandleIndexOnPrimary)),
    );
    const x2 =
      pool.deathCandleIndexOnPrimary !== null
        ? toX(pool.deathCandleIndexOnPrimary)
        : pad.l + cw;
    const fill = pool.type === "RESISTANCE" ? C.resDead : C.supDead;
    const border = pool.type === "RESISTANCE" ? C.resDeadBdr : C.supDeadBdr;
    ctx.fillStyle = fill;
    ctx.fillRect(x1, yTop, x2 - x1, yBot - yTop);
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.strokeRect(x1, yTop, x2 - x1, yBot - yTop);
  }

  // Border around the chart area
  ctx.strokeStyle = "rgba(0,0,0,0.04)";
  ctx.lineWidth = 0.5;
  ctx.strokeRect(pad.l, pad.t, cw, ch);

  // Header label
  ctx.fillStyle = C.txtP;
  ctx.font = "500 11px system-ui";
  ctx.textAlign = "left";
  ctx.fillText(
    `${state.symbol} · ${state.primaryTimeframe} · ${state.candles.length} candles · TFs: ${state.analysedTimeframes.join("/")}`,
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

function levelOpacity(strength: LevelStrengthClient): number {
  switch (strength) {
    case "very_strong":
      return 0.9;
    case "strong":
      return 0.7;
    case "medium":
      return 0.5;
    case "weak":
      return 0.3;
    case "trivial":
    default:
      return 0.15;
  }
}

function strengthRank(s: LevelStrengthClient): number {
  const r = { trivial: 0, weak: 1, medium: 2, strong: 3, very_strong: 4 };
  return r[s];
}

// Build a compact TF tag for the right-edge label.
// E.g. sourceTimeframe="D" + matchingTimeframes=["W","4H"] → "4H+D+W"
function buildTfTag(source: string, matching: string[]): string {
  const all = new Set([source, ...matching]);
  // Display in a consistent order: smallest to largest
  const order = ["15m", "1H", "4H", "12H", "D", "W", "M"];
  const sorted = order.filter((tf) => all.has(tf));
  return sorted.join("+");
}
