// Left-frame chart — hybrid render: canvas for candles/pools/chrome,
// DOM overlay for levels and off-screen indicators.
//
// Why hybrid: the canvas approach is the standard for charts (perf, parity
// with TradingView/Highcharts), but everything painted into a canvas is
// opaque to browser tools — VisBug, DevTools inspect, accessibility tree,
// AI co-design. By moving levels (the things we collaborate on) into real
// DOM elements with rich data attributes, we get inspect-and-drag for free
// without losing canvas perf for the bulk renderer.

import { useEffect, useRef, useState, useMemo } from "react";
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
  resAlive: "rgba(226,75,74,0.13)",
  resAliveBdr: "rgba(226,75,74,0.65)",
  supAlive: "rgba(29,158,117,0.13)",
  supAliveBdr: "rgba(29,158,117,0.65)",
  resDead: "rgba(226,75,74,0.55)",
  resDeadBdr: "rgba(226,75,74,0.95)",
  supDead: "rgba(29,158,117,0.55)",
  supDeadBdr: "rgba(29,158,117,0.95)",
  nowLine: "rgba(61,61,58,0.45)",
};

const PAD = { l: 60, r: 100, t: 20, b: 32 };
const H = 540;

// Timeframe hierarchy — higher number = higher timeframe. A chart ALWAYS
// shows its own TF's levels AND every higher TF's levels. It NEVER shows
// lower-TF levels (those would be sub-resolution noise on the current
// chart). The user's rule: "A monthly only shows monthly; a 15m shows
// everything above it." Mirrors TF_PRIORITY in server/orchestrator.ts.
const TF_RANK: Record<string, number> = {
  "15m": 0,
  "1H": 1,
  "4H": 2,
  "12H": 3,
  D: 4,
  W: 5,
  M: 6,
};

interface Props {
  state: AnalysisStateClient;
  chartType?: "candles" | "line";
  // Target number of structural turning points when chartType="line".
  // The simplifier iterates epsilon via binary search until the RDP output
  // has approximately this many vertices. Universal across TFs — "give me
  // the 15 most structurally significant turning points" means the same
  // thing on Monthly and 15m. Replaces the old per-TF epsilon tuning.
  targetPoints?: number;
  showCurrentTf?: boolean;
  showOtherTfs?: boolean;
  showPools?: boolean;
}

// Off-screen indicator cap — only show the N closest to the visible range
// per side. The "+M more" badge handles the rest. Three was too noisy with
// far-away Weekly/Monthly levels dominating the visual edge.
const OFF_SCREEN_LIMIT = 1;

interface Dims {
  W: number;
  cw: number;
  ch: number;
  minP: number;
  maxP: number;
  pRange: number;
  N: number;
  toY: (p: number) => number;
  toX: (i: number) => number;
  candleWidth: number;
  halfWidth: number;
}

export function LeftFrameCanvas({
  state,
  chartType = "candles",
  targetPoints = 15,
  showCurrentTf = true,
  showOtherTfs = true,
  showPools = true,
}: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [selectedCandleIndex, setSelectedCandleIndex] = useState<number | null>(
    null,
  );

  // Track wrapper width via ResizeObserver so canvas + overlay stay in sync
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const measure = () => setWidth(wrapper.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, []);

  // Coordinate mapping derived from state + width — shared by canvas and overlay
  const dims: Dims | null = useMemo(() => {
    if (width === 0 || state.candles.length === 0) return null;
    const cw = width - PAD.l - PAD.r;
    const ch = H - PAD.t - PAD.b;
    const candlePrices: number[] = state.candles.flatMap((c) => [c.high, c.low]);
    let minP = Math.min(...candlePrices);
    let maxP = Math.max(...candlePrices);
    const padPrice = (maxP - minP) * 0.02;
    minP -= padPrice;
    maxP += padPrice;
    const pRange = maxP - minP;
    const N = state.candles.length;
    const candleWidth = Math.max(2, Math.floor(cw / N) - 1);
    const halfWidth = Math.max(1, Math.floor(candleWidth / 2));
    return {
      W: width,
      cw,
      ch,
      minP,
      maxP,
      pRange,
      N,
      toY: (p: number) => PAD.t + ch - ((p - minP) / pRange) * ch,
      toX: (i: number) => PAD.l + ((i + 0.5) / N) * cw,
      candleWidth,
      halfWidth,
    };
  }, [width, state.candles]);

  // Canvas paint — bg, grid, axis labels, pools, candles/line, border, header
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !dims) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = dims.W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = dims.W + "px";
    canvas.style.height = H + "px";
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0); // reset before each paint
    ctx.scale(dpr, dpr);
    drawCanvas(ctx, state, dims, { showPools, chartType, targetPoints });
  }, [state, showPools, chartType, targetPoints, dims]);

  // Render every level that passes the hierarchy filter. The server-side
  // RDP detector now emits a small leg-skeleton set per TF (5 vertices),
  // so there's no need to further filter on the client by broken-ness,
  // distance, or priority. Every vertex IS a level — red for peaks, green
  // for troughs, broken or not.
  //
  // Hierarchy rule (unchanged): a chart shows its own TF's levels + higher
  // TFs' levels, never lower. `Current TF` and `Higher TFs` toggles control
  // which parts of the hierarchy get rendered.
  //
  // Partitioning into on-screen / off-above / off-below is kept because
  // higher-TF levels can sit far outside the visible Y range and the
  // off-screen indicator system handles those.
  const partitioned = useMemo(() => {
    if (!dims) return { onScreen: [], offAbove: [], offBelow: [] };
    const primaryRank = TF_RANK[state.primaryTimeframe] ?? 0;
    const onScreen: typeof state.levels = [];
    const offAbove: typeof state.levels = [];
    const offBelow: typeof state.levels = [];
    for (const level of state.levels) {
      if (level.graduatedToPoolId !== null && showPools) continue;
      const levelRank = TF_RANK[level.sourceTimeframe] ?? -1;
      if (levelRank < primaryRank) continue;
      const isPrimary = levelRank === primaryRank;
      const isHigherTf = levelRank > primaryRank;
      if (isPrimary && !showCurrentTf) continue;
      if (isHigherTf && !showOtherTfs) continue;

      const y = dims.toY(level.price);
      if (y < PAD.t) offAbove.push(level);
      else if (y > PAD.t + dims.ch) offBelow.push(level);
      else onScreen.push(level);
    }
    offAbove.sort((a, b) => a.price - b.price);
    offBelow.sort((a, b) => b.price - a.price);
    return { onScreen, offAbove, offBelow };
  }, [
    state.levels,
    state.primaryTimeframe,
    showCurrentTf,
    showOtherTfs,
    showPools,
    dims,
  ]);

  // Click anywhere in the chart area → select that candle.
  // Click outside the chart area (inside the wrapper) → clear selection.
  const handleChartClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dims) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (
      mx < PAD.l ||
      mx > PAD.l + dims.cw ||
      my < PAD.t ||
      my > PAD.t + dims.ch
    ) {
      setSelectedCandleIndex(null);
      return;
    }
    const idx = Math.floor(((mx - PAD.l) / dims.cw) * dims.N);
    if (idx >= 0 && idx < dims.N) setSelectedCandleIndex(idx);
  };

  const selectedCandle =
    selectedCandleIndex !== null ? state.candles[selectedCandleIndex] : null;

  return (
    <div
      ref={wrapperRef}
      className="relative block w-full"
      style={{ height: H, cursor: dims ? "crosshair" : "default" }}
      data-codesign-chart="left-frame"
      onClick={handleChartClick}
    >
      <canvas
        ref={canvasRef}
        className="block absolute top-0 left-0"
        data-codesign-layer="canvas"
      />
      {/* SVG overlay — level rects + selected-candle highlight band */}
      {dims && (
        <svg
          width={dims.W}
          height={H}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            pointerEvents: "none",
          }}
          data-codesign-layer="levels-svg"
        >
          {/* Selected candle highlight — vertical band, drawn first so levels
              and tags sit on top of it visually */}
          {selectedCandleIndex !== null && (
            <rect
              x={dims.toX(selectedCandleIndex) - dims.halfWidth - 2}
              y={PAD.t}
              width={dims.halfWidth * 2 + 4}
              height={dims.ch}
              fill="rgba(239,159,39,0.10)"
              stroke="rgba(239,159,39,0.85)"
              strokeWidth={1.5}
              pointerEvents="none"
              data-codesign-element="candle-highlight"
              data-candle-index={selectedCandleIndex}
            />
          )}
          {partitioned.onScreen.map((level) => (
            <LevelLine key={level.id} level={level} dims={dims} />
          ))}
          {/* Swing-candle markers — outline rects around the candles the
              algorithm identified as swing pivots. Red = swing high,
              green = swing low. Only shown in candles mode: on the line
              chart they're stale (from the old server-side detector, not
              from RDP) and would pollute the alignment view. */}
          {chartType === "candles" &&
            partitioned.onScreen.map((level) => (
              <SwingMarker
                key={`mark-${level.id}`}
                level={level}
                candles={state.candles}
                dims={dims}
              />
            ))}
        </svg>
      )}
      {/* DOM overlay — text labels (TF tags + off-screen indicators).
          Pools will move here when we get to them. */}
      {dims && (
        <div
          className="absolute top-0 left-0 w-full h-full"
          style={{ pointerEvents: "none" }}
          data-codesign-layer="text-overlay"
        >
          {partitioned.onScreen.map((level) => (
            <LevelTag
              key={level.id}
              level={level}
              dims={dims}
              primaryTimeframe={state.primaryTimeframe}
            />
          ))}
          <OffScreenStack
            levels={partitioned.offAbove.slice(0, OFF_SCREEN_LIMIT)}
            extraCount={Math.max(
              0,
              partitioned.offAbove.length - OFF_SCREEN_LIMIT,
            )}
            dims={dims}
            position="above"
            primaryTimeframe={state.primaryTimeframe}
          />
          <OffScreenStack
            levels={partitioned.offBelow.slice(0, OFF_SCREEN_LIMIT)}
            extraCount={Math.max(
              0,
              partitioned.offBelow.length - OFF_SCREEN_LIMIT,
            )}
            dims={dims}
            position="below"
            primaryTimeframe={state.primaryTimeframe}
          />
        </div>
      )}
      {/* Selected candle popup — copyable info card. Position flips left/right
          based on which half of the chart the candle is in, so the popup is
          always on the OPPOSITE side from the candle (never blocks it).
          Clicks inside don't bubble to the wrapper so the popup itself
          doesn't clear selection. */}
      {selectedCandle && selectedCandleIndex !== null && dims && (
        <CandleInfoPopup
          index={selectedCandleIndex}
          candle={selectedCandle}
          symbol={state.symbol}
          timeframe={state.primaryTimeframe}
          side={
            dims.toX(selectedCandleIndex) > PAD.l + dims.cw / 2
              ? "left"
              : "right"
          }
          onClose={() => setSelectedCandleIndex(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Candle info popup — small card pinned top-right of the chart, shows
// the selected candle's index, time, and OHLC. Has a Copy button that
// formats everything as a single line for pasting into chat.

function CandleInfoPopup({
  index,
  candle,
  symbol,
  timeframe,
  side,
  onClose,
}: {
  index: number;
  candle: AnalysisStateClient["candles"][number];
  symbol: string;
  timeframe: string;
  side: "left" | "right";
  onClose: () => void;
}) {
  const isoTime = new Date(candle.openTime)
    .toISOString()
    .replace("T", " ")
    .slice(0, 16);
  const copyText = `${symbol} ${timeframe} candle #${index} · ${isoTime} · O ${candle.open} H ${candle.high} L ${candle.low} C ${candle.close}`;

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      onClick={stop}
      style={{
        position: "absolute",
        top: 8,
        ...(side === "left" ? { left: PAD.l + 4 } : { right: 110 }),
        background: "white",
        border: "1px solid rgba(0,0,0,0.15)",
        borderRadius: 6,
        padding: "8px 12px",
        fontSize: "11px",
        fontFamily: "system-ui, sans-serif",
        boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
        pointerEvents: "auto",
        userSelect: "text",
        minWidth: 220,
        cursor: "default",
      }}
      data-codesign-element="candle-popup"
      data-candle-index={index}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 4,
        }}
      >
        <strong>Candle #{index}</strong>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="Close"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "0 2px",
            fontSize: "14px",
            lineHeight: 1,
            color: "rgba(0,0,0,0.4)",
          }}
        >
          ×
        </button>
      </div>
      <div
        style={{
          fontSize: "10px",
          color: "rgba(0,0,0,0.55)",
          marginBottom: 6,
        }}
      >
        {isoTime} UTC
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          columnGap: 12,
          rowGap: 2,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <span style={{ color: "rgba(0,0,0,0.5)" }}>O</span>
        <span>{candle.open.toLocaleString()}</span>
        <span style={{ color: "rgba(0,0,0,0.5)" }}>H</span>
        <span>{candle.high.toLocaleString()}</span>
        <span style={{ color: "rgba(0,0,0,0.5)" }}>L</span>
        <span>{candle.low.toLocaleString()}</span>
        <span style={{ color: "rgba(0,0,0,0.5)" }}>C</span>
        <span>{candle.close.toLocaleString()}</span>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (navigator.clipboard) {
            navigator.clipboard.writeText(copyText).catch(() => {});
          }
        }}
        style={{
          marginTop: 8,
          fontSize: "10px",
          padding: "3px 10px",
          border: "1px solid rgba(0,0,0,0.15)",
          borderRadius: 4,
          background: "white",
          cursor: "pointer",
          width: "100%",
        }}
      >
        Copy line
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Swing marker — outlines the specific candle that the algorithm flagged
// as a swing pivot (the source of the level). Red outline for swing highs,
// green for swing lows. Design-mode debugging aid: lets the user verify
// swing detection directly on the candle that caused the level, without
// relying on the horizontal line's position as a proxy.

function SwingMarker({
  level,
  candles,
  dims,
}: {
  level: AnalysisStateClient["levels"][number];
  candles: AnalysisStateClient["candles"];
  dims: Dims;
}) {
  const idx = level.swingCandleIndexOnPrimary;
  if (idx < 0 || idx >= candles.length) return null;
  const candle = candles[idx];
  const cx = dims.toX(idx);
  const yHigh = dims.toY(candle.high);
  const yLow = dims.toY(candle.low);
  // Outline spans wick-to-wick + 2px padding on top and bottom, and a
  // couple of pixels wider than the candle body for visibility.
  const paddingY = 2;
  const halfW = dims.halfWidth + 2;
  const rgb = level.side === "RESISTANCE" ? "226,75,74" : "29,158,117";
  return (
    <rect
      x={cx - halfW}
      y={yHigh - paddingY}
      width={halfW * 2}
      height={yLow - yHigh + paddingY * 2}
      fill="none"
      stroke={`rgba(${rgb},0.9)`}
      strokeWidth={1.5}
      pointerEvents="none"
      data-codesign-element="swing-marker"
      data-level-id={level.id}
      data-candle-index={idx}
      data-side={level.side}
    />
  );
}

// ---------------------------------------------------------------------------
// SVG level line — a thin <rect>. Non-interactive: clicks pass through to
// the candle layer so the user can click candles. Data attributes preserved
// for DevTools inspection.

function LevelLine({
  level,
  dims,
}: {
  level: AnalysisStateClient["levels"][number];
  dims: Dims;
}) {
  const y = dims.toY(level.price);
  const idx = level.swingCandleIndexOnPrimary;
  const startX =
    idx < 0 ? PAD.l : dims.toX(Math.max(0, Math.min(dims.N - 1, idx)));
  const endX = PAD.l + dims.cw;
  const width = endX - startX;
  const opacity = levelOpacity(level.strength);
  const visibleHeight = strengthLineHeightPx(level.strength);
  const rgb = level.side === "RESISTANCE" ? "226,75,74" : "29,158,117";

  return (
    <rect
      x={startX}
      y={y - visibleHeight / 2}
      width={width}
      height={visibleHeight}
      fill={`rgba(${rgb},${opacity})`}
      pointerEvents="none"
      data-codesign-element="level-line"
      data-level-id={level.id}
      data-source-tf={level.sourceTimeframe}
      data-side={level.side}
      data-original-price={level.price}
      data-wick-price={level.wickPrice}
      data-confluence-count={level.confluenceCount}
      data-matching-tfs={level.matchingTimeframes.join(",")}
      data-strength={level.strength}
      data-graduated-pool-id={level.graduatedToPoolId ?? ""}
    />
  );
}

// DOM tag for a level — kept as a div so browser font rendering stays crisp
// and the typography hooks (font-family, font-weight) are CSS-native.

function LevelTag({
  level,
  dims,
  primaryTimeframe,
}: {
  level: AnalysisStateClient["levels"][number];
  dims: Dims;
  primaryTimeframe: string;
}) {
  const tag = buildTfTag(
    level.sourceTimeframe,
    level.matchingTimeframes,
    primaryTimeframe,
  );
  // Suppress the tag if it adds no information — i.e. after hierarchy
  // filtering the tag is empty, or it collapses to just the primary TF.
  // The line itself is enough in both cases.
  if (tag === "" || tag === primaryTimeframe) return null;

  const y = dims.toY(level.price);
  const endX = PAD.l + dims.cw;
  const opacity = levelOpacity(level.strength);
  const rgb = level.side === "RESISTANCE" ? "226,75,74" : "29,158,117";
  const isProminent =
    level.strength === "very_strong" || level.strength === "strong";

  return (
    <div
      style={{
        position: "absolute",
        top: y - 6,
        left: endX + 4,
        fontSize: "10px",
        color: `rgba(${rgb},${Math.min(1, opacity + 0.25)})`,
        fontWeight: isProminent ? 500 : 400,
        fontFamily: "system-ui, sans-serif",
        pointerEvents: "none",
        whiteSpace: "nowrap",
      }}
      data-codesign-element="level-tag"
      data-level-tag-for={level.id}
    >
      {tag}
    </div>
  );
}

function OffScreenStack({
  levels,
  extraCount,
  dims,
  position,
  primaryTimeframe,
}: {
  levels: AnalysisStateClient["levels"];
  extraCount: number;
  dims: Dims;
  position: "above" | "below";
  primaryTimeframe: string;
}) {
  const x = PAD.l + dims.cw + 4;
  const baseY = position === "above" ? PAD.t + 4 : PAD.t + dims.ch - 4;
  const arrow = position === "above" ? "↑" : "↓";
  const lineHeight = 11;

  return (
    <>
      {levels.map((level, i) => {
        const yOffset = position === "above" ? i * lineHeight : -i * lineHeight;
        const rgb = level.side === "RESISTANCE" ? "226,75,74" : "29,158,117";
        const opacity = Math.min(1, levelOpacity(level.strength) + 0.25);
        const tag = buildTfTag(
          level.sourceTimeframe,
          level.matchingTimeframes,
          primaryTimeframe,
        );
        return (
          <div
            key={level.id}
            style={{
              position: "absolute",
              left: x,
              top: baseY + yOffset - 6,
              fontSize: "9px",
              fontWeight: 500,
              color: `rgba(${rgb},${opacity})`,
              whiteSpace: "nowrap",
              fontFamily: "system-ui, sans-serif",
              pointerEvents: "auto",
            }}
            data-codesign-element="off-screen-indicator"
            data-level-id={level.id}
            data-source-tf={level.sourceTimeframe}
            data-side={level.side}
            data-original-price={level.price}
            data-strength={level.strength}
            data-off-screen={position}
          >
            {arrow} {formatPrice(level.price)} {tag}
          </div>
        );
      })}
      {extraCount > 0 && (
        <div
          style={{
            position: "absolute",
            left: x,
            top:
              baseY +
              (position === "above" ? levels.length : -levels.length) *
                lineHeight -
              6,
            fontSize: "9px",
            color: "rgba(136,135,128,0.7)",
            fontFamily: "system-ui, sans-serif",
            pointerEvents: "none",
          }}
        >
          +{extraCount} more
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Canvas-only paint — bg, grid, axis labels, pools, candles, border, header.

function drawCanvas(
  ctx: CanvasRenderingContext2D,
  state: AnalysisStateClient,
  dims: Dims,
  opts: {
    showPools: boolean;
    chartType: "candles" | "line";
    targetPoints: number;
  },
): void {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, dims.W, H);

  if (state.candles.length === 0) {
    ctx.fillStyle = C.txt;
    ctx.font = "12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("no candles", dims.W / 2, H / 2);
    return;
  }

  // Grid
  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 0.5;
  for (let g = 0; g <= 5; g++) {
    const gy = PAD.t + (g / 5) * dims.ch;
    ctx.beginPath();
    ctx.moveTo(PAD.l, gy);
    ctx.lineTo(PAD.l + dims.cw, gy);
    ctx.stroke();
  }

  // Y axis labels
  ctx.fillStyle = C.txt;
  ctx.font = "10px system-ui";
  ctx.textAlign = "right";
  for (let g = 0; g <= 5; g++) {
    const p = dims.minP + (g / 5) * dims.pRange;
    const gy = PAD.t + dims.ch - (g / 5) * dims.ch;
    ctx.fillText(formatPrice(p), PAD.l - 5, gy + 3.5);
  }

  // Active pools (translucent, behind candles)
  const activePools = opts.showPools
    ? state.pools.filter((p) => p.status === "active")
    : [];
  const deadPools = opts.showPools
    ? state.pools.filter((p) => p.status === "dead")
    : [];
  for (const pool of activePools) {
    const yTop = dims.toY(pool.wickHigh);
    const yBot = dims.toY(pool.wickLow);
    if (yBot < PAD.t || yTop > PAD.t + dims.ch) continue;
    const idx = pool.birthCandleIndexOnPrimary;
    const x1 =
      idx < 0 ? PAD.l : dims.toX(Math.max(0, Math.min(dims.N - 1, idx)));
    const x2 = PAD.l + dims.cw;
    const fill = pool.type === "RESISTANCE" ? C.resAlive : C.supAlive;
    const border = pool.type === "RESISTANCE" ? C.resAliveBdr : C.supAliveBdr;
    ctx.fillStyle = fill;
    ctx.fillRect(x1, yTop, x2 - x1, yBot - yTop);
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.strokeRect(x1, yTop, x2 - x1, yBot - yTop);
  }

  if (opts.chartType === "line") {
    // Line chart — a single polyline through candle closes, simplified
    // via Ramer-Douglas-Peucker to approximately the target structural
    // point count. Binary search finds the epsilon that produces as close
    // to N vertices as RDP can deliver (RDP is discrete so exact target
    // count isn't always achievable). Structural turning points survive;
    // noise is removed. Sharp angles preserved, no smoothing.
    const rawPoints: Array<[number, number]> = state.candles.map((c, i) => [
      i,
      c.close,
    ]);
    const simplified = simplifyToTargetCount(
      rawPoints,
      opts.targetPoints,
      dims.pRange,
    );

    ctx.strokeStyle = C.txtP;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let i = 0; i < simplified.length; i++) {
      const [idx, close] = simplified[i];
      const x = dims.toX(idx);
      const y = dims.toY(close);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Small diagnostic readout at top-left of chart area.
    ctx.fillStyle = C.txt;
    ctx.font = "10px system-ui";
    ctx.textAlign = "left";
    ctx.fillText(
      `${simplified.length} pts (target ${opts.targetPoints})`,
      PAD.l + 4,
      PAD.t + 28,
    );
  } else {
    // Candles — OHLC with wicks and coloured bodies.
    for (let i = 0; i < dims.N; i++) {
      const c = state.candles[i];
      const x = dims.toX(i);
      const yO = dims.toY(c.open);
      const yC = dims.toY(c.close);
      const yH = dims.toY(c.high);
      const yL = dims.toY(c.low);
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
      ctx.fillRect(x - dims.halfWidth, bT, dims.halfWidth * 2, bH);
    }
  }

  // Dead pools (opaque, on top of candles)
  for (const pool of deadPools) {
    const yTop = dims.toY(pool.wickHigh);
    const yBot = dims.toY(pool.wickLow);
    const x1 = dims.toX(
      Math.max(0, Math.min(dims.N - 1, pool.birthCandleIndexOnPrimary)),
    );
    const x2 =
      pool.deathCandleIndexOnPrimary !== null
        ? dims.toX(pool.deathCandleIndexOnPrimary)
        : PAD.l + dims.cw;
    const fill = pool.type === "RESISTANCE" ? C.resDead : C.supDead;
    const border = pool.type === "RESISTANCE" ? C.resDeadBdr : C.supDeadBdr;
    ctx.fillStyle = fill;
    ctx.fillRect(x1, yTop, x2 - x1, yBot - yTop);
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.strokeRect(x1, yTop, x2 - x1, yBot - yTop);
  }

  // Border
  ctx.strokeStyle = "rgba(0,0,0,0.04)";
  ctx.lineWidth = 0.5;
  ctx.strokeRect(PAD.l, PAD.t, dims.cw, dims.ch);

  // Header label
  ctx.fillStyle = C.txtP;
  ctx.font = "500 11px system-ui";
  ctx.textAlign = "left";
  ctx.fillText(
    `${state.symbol} · ${state.primaryTimeframe} · ${state.candles.length} candles · TFs: ${state.analysedTimeframes.join("/")}`,
    PAD.l + 4,
    PAD.t + 13,
  );
}

// ---------------------------------------------------------------------------
// Helpers

// simplifyToTargetCount — iterate epsilon via binary search until RDP
// produces approximately the requested number of vertices. RDP is a
// discrete algorithm (vertex counts step, not slide), so the result
// won't always hit the target exactly — this function returns the
// closest-count result it found during the search. Works across every
// timeframe with the same semantics: "give me the N most structural
// turning points in this line."
function simplifyToTargetCount(
  points: Array<[number, number]>,
  targetCount: number,
  priceRange: number,
): Array<[number, number]> {
  if (points.length <= targetCount) return points.slice();
  if (targetCount < 2) return [points[0], points[points.length - 1]];

  let lo = 0;
  let hi = priceRange; // max useful epsilon — anything larger collapses to 2 pts
  let best = simplifyRDP(points, (lo + hi) / 2);
  let bestDiff = Math.abs(best.length - targetCount);

  for (let iter = 0; iter < 30; iter++) {
    const mid = (lo + hi) / 2;
    const candidate = simplifyRDP(points, mid);
    const diff = Math.abs(candidate.length - targetCount);
    if (diff < bestDiff) {
      best = candidate;
      bestDiff = diff;
    }
    if (candidate.length === targetCount) return candidate;
    if (candidate.length > targetCount) {
      lo = mid; // need stronger simplification
    } else {
      hi = mid; // need gentler simplification
    }
    if (hi - lo < 1e-6) break;
  }
  return best;
}

// Ramer-Douglas-Peucker line simplification for PRICE series.
// Given a polyline as [index, price] pairs and an epsilon tolerance in
// price units, returns the subset of points whose PRICE DEVIATION from
// the linear interpolation between their kept neighbours is at least
// epsilon. Turning points survive; noise is discarded. No smoothing —
// remaining vertices are originals.
//
// Critical: this uses VERTICAL (price-axis) distance, not Euclidean
// perpendicular distance. A price chart has wildly different x and y
// units (index 0..N vs dollars) — perpendicular distance is dominated
// by the larger axis and produces meaningless values on high TFs with
// big price ranges (a $30K deviation from the diagonal on a Monthly
// chart computes as ~$50 perpendicular, because the line is effectively
// vertical in the geometric space). Vertical distance measures exactly
// what we care about: "how far is this close from the straight-line
// interpolation at the same time, measured in dollars?"
function simplifyRDP(
  points: Array<[number, number]>,
  epsilon: number,
): Array<[number, number]> {
  if (points.length < 3) return points.slice();

  let maxDist = 0;
  let maxIdx = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = verticalDistance(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyRDP(points.slice(0, maxIdx + 1), epsilon);
    const right = simplifyRDP(points.slice(maxIdx), epsilon);
    // Stitch: drop the duplicate pivot from the left half
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

// Vertical (price-axis) distance from point p to the straight-line
// interpolation between a and b at p's x coordinate.
function verticalDistance(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): number {
  const [px, py] = p;
  const [ax, ay] = a;
  const [bx, by] = b;
  if (bx === ax) return Math.abs(py - ay);
  const slope = (by - ay) / (bx - ax);
  const expectedY = ay + slope * (px - ax);
  return Math.abs(py - expectedY);
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

function strengthLineHeightPx(s: LevelStrengthClient): number {
  switch (s) {
    case "very_strong":
      return 3;
    case "strong":
      return 2;
    case "medium":
      return 2;
    case "weak":
      return 1;
    case "trivial":
    default:
      return 1;
  }
}

function strengthRank(s: LevelStrengthClient): number {
  const r = { trivial: 0, weak: 1, medium: 2, strong: 3, very_strong: 4 };
  return r[s];
}

// Build a compact TF tag for the right-edge label, respecting the TF
// hierarchy: only TFs at or ABOVE the primary timeframe are shown. On a
// Monthly chart, confluence with D/W/4H is NOT meaningful visually —
// those are lower-TF overlaps the user doesn't care about at that zoom
// level. On a 15m chart, everything is at-or-above, so every confluent
// TF appears.
//
// Example: sourceTimeframe="M", matching=["4H","D","W"], primary="M"
//   → full set [4H, D, W, M] → filtered to [M] → single-TF, caller hides
// Example: sourceTimeframe="W", matching=["4H","M"], primary="D"
//   → full set [4H, W, M] → filtered to [W, M] → "W+M"
function buildTfTag(
  source: string,
  matching: string[],
  primary: string,
): string {
  const primaryRank = TF_RANK[primary] ?? 0;
  const all = new Set([source, ...matching]);
  const order = ["15m", "1H", "4H", "12H", "D", "W", "M"];
  const sorted = order.filter(
    (tf) => all.has(tf) && (TF_RANK[tf] ?? -1) >= primaryRank,
  );
  return sorted.join("+");
}
