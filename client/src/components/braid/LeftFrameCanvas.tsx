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
import { CHART_PAD, PRICE_PAD_FRACTION } from "./chartGeometry";

// Regime strip palette — coloured by *recommended playbook* per bar, not
// raw wire-angle bracket. Bars where no playbook is recommended (NO_TRADE
// vetoes everything, or all playbook composites fall below threshold)
// render blank — the chart background shows through. The strip becomes
// "where was a playbook applicable?" rather than "what was the angle?"
const PLAYBOOK_STRIP_COLOR: Record<string, string> = {
  accumulation: "rgba(200,154,74,0.55)",
  ranging: "rgba(58,141,101,0.55)",
  trending: "rgba(29,158,117,0.55)",
  breakout: "rgba(42,109,163,0.55)",
};

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

const PAD = CHART_PAD;
// Height is passed as a prop — set dynamically from viewport in Braid.tsx
const DEFAULT_H = 800;

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
  showSweptPools?: boolean;
  showDeadPools?: boolean;
  height?: number;
  // Aggregate strength threshold — levels with passes.aggregate.score
  // below this are hidden from the chart entirely (and their pools too).
  // 0 = show all (default), 1 = only the strongest. Driven by the slider
  // in PassPlayground.
  strengthThreshold?: number;
  // Top-edge regime strip — coloured per-candle band from the wire-angle
  // pass's per-bar history. Tied to the REGIME column's expanded state so
  // the chart stays clean when the operator isn't focused on regime.
  showRegimeStrip?: boolean;
  // Gate all level-line + level-tag + swing-marker + off-screen-indicator
  // rendering. Default true; set to false in scoped views (REGIME/ORDERS/
  // TRADES) where levels would be noise. The LEVELS scope sets this true.
  showLevels?: boolean;
}

// Off-screen indicator cap — only show the N closest to the visible range
// per side. The "+M more" badge handles the rest. Three was too noisy with
// far-away Weekly/Monthly levels dominating the visual edge.
const OFF_SCREEN_LIMIT = 1;

interface Dims {
  W: number;
  H: number;
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
  showSweptPools = false,
  showDeadPools = false,
  height: H = DEFAULT_H,
  strengthThreshold = 0,
  showRegimeStrip = false,
  showLevels = true,
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
    const padPrice = (maxP - minP) * PRICE_PAD_FRACTION;
    minP -= padPrice;
    maxP += padPrice;
    const pRange = maxP - minP;
    const N = state.candles.length;
    const candleWidth = Math.max(2, Math.floor(cw / N) - 1);
    const halfWidth = Math.max(1, Math.floor(candleWidth / 2));
    return {
      W: width,
      H,
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
    drawCanvas(ctx, state, dims, {
      showPools,
      showSweptPools,
      showDeadPools,
      chartType,
      targetPoints,
      showRegimeStrip,
    });
  }, [
    state,
    showPools,
    showSweptPools,
    showDeadPools,
    chartType,
    targetPoints,
    showRegimeStrip,
    dims,
  ]);

  // Render every structural level that passes the hierarchy filter.
  // Creation/filtering stays in the engine; the client only applies
  // display toggles and aggregate visibility.
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
      const levelRank = TF_RANK[level.sourceTimeframe] ?? -1;
      if (levelRank < primaryRank) continue;
      const isPrimary = levelRank === primaryRank;
      const isHigherTf = levelRank > primaryRank;
      if (isPrimary && !showCurrentTf) continue;
      if (isHigherTf && !showOtherTfs) continue;

      // Aggregate strength filter — hide levels below threshold. Only
      // applies when an aggregate score has been computed (pass enabled).
      // Without aggregate data we don't filter — equivalent to threshold 0.
      if (strengthThreshold > 0) {
        const aggScore = level.passes?.aggregate?.score;
        if (aggScore !== undefined && aggScore < strengthThreshold) continue;
      }

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
    strengthThreshold,
    dims,
  ]);

  // Swing markers are diagnostic: they answer "which candle did the engine
  // identify?" Keep them independent from pool/aggregate line filtering so
  // a real pivot candle does not disappear just because its line became a
  // pool, got down-scored, or was hidden by the strength slider.
  const swingMarkerLevels = useMemo(() => {
    if (!dims) return [];
    const primaryRank = TF_RANK[state.primaryTimeframe] ?? 0;
    return state.levels.filter((level) => {
      if (level.source !== "swing") return false;
      const levelRank = TF_RANK[level.sourceTimeframe] ?? -1;
      if (levelRank < primaryRank) return false;
      const isPrimary = levelRank === primaryRank;
      const isHigherTf = levelRank > primaryRank;
      if (isPrimary && !showCurrentTf) return false;
      if (isHigherTf && !showOtherTfs) return false;
      const y = dims.toY(level.price);
      return y >= PAD.t && y <= PAD.t + dims.ch;
    });
  }, [
    dims,
    showCurrentTf,
    showOtherTfs,
    state.levels,
    state.primaryTimeframe,
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
          {showLevels &&
            partitioned.onScreen.map((level) => (
              <LevelLine key={level.id} level={level} dims={dims} />
            ))}
          {/* Swing-candle markers — outline rects around the candles the
              algorithm identified as swing pivots. Red = swing high,
              green = swing low. Only shown in candles mode: on the line
              chart they would pollute the alignment view. */}
          {showLevels &&
            chartType === "candles" &&
            swingMarkerLevels.map((level) => (
              <SwingMarker
                key={`mark-${level.id}`}
                level={level}
                candles={state.candles}
                dims={dims}
              />
            ))}
          {/* Last-leg swing markers — structural reference lines at the
              ZigZag swing prices. Drawn whenever the lastLeg pass is
              enabled (passInfo.lastLeg present), independent of TF/Higher
              gating because they're structural, not source-TF-bound.
              Coloured by current price relationship: above current close
              = resistance (red), below = support (green). The original
              swing TYPE is preserved in data attributes for inspection. */}
          {state.passInfo?.lastLeg?.swings.map((swing, i) => {
            const y = dims.toY(swing.price);
            if (y < PAD.t || y > PAD.t + dims.ch) return null;
            const lastClose =
              state.candles.length > 0
                ? state.candles[state.candles.length - 1].close
                : swing.price;
            const isAboveCurrentPrice = swing.price > lastClose;
            const stroke = isAboveCurrentPrice
              ? "rgba(226,75,74,0.8)"
              : "rgba(29,158,117,0.8)";
            const sideLabel = isAboveCurrentPrice ? "R" : "S";
            const startX = dims.toX(
              Math.max(0, Math.min(dims.N - 1, swing.index)),
            );
            return (
              <g
                key={`leg-${i}-${swing.index}-${swing.price}`}
                data-codesign-element="last-leg-swing"
                data-swing-type={swing.type}
                data-effective-side={
                  isAboveCurrentPrice ? "RESISTANCE" : "SUPPORT"
                }
                data-swing-price={swing.price}
              >
                <line
                  x1={startX}
                  y1={y}
                  x2={PAD.l + dims.cw}
                  y2={y}
                  stroke={stroke}
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  pointerEvents="none"
                />
                <text
                  x={startX + 4}
                  y={y - 3}
                  fill={stroke}
                  fontSize={10}
                  fontWeight={700}
                  fontFamily="system-ui, sans-serif"
                  pointerEvents="none"
                >
                  {sideLabel} ${swing.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {/* DOM overlay — text labels (TF tags + off-screen indicators).
          Pool rectangles intentionally remain canvas-rendered; structural
          level tags live in DOM for crisp labels and inspection hooks. */}
      {dims && (
        <div
          className="absolute top-0 left-0 w-full h-full"
          style={{ pointerEvents: "none" }}
          data-codesign-layer="text-overlay"
        >
          {showLevels &&
            partitioned.onScreen.map((level) => (
              <LevelTag
                key={level.id}
                level={level}
                dims={dims}
                primaryTimeframe={state.primaryTimeframe}
              />
            ))}
          {showLevels && (
            <>
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
            </>
          )}
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
          candleX={dims.toX(selectedCandleIndex)}
          chartWidth={dims.W}
          verticalSide={
            (selectedCandle.high + selectedCandle.low) / 2 > (dims.minP + dims.maxP) / 2
              ? "bottom"
              : "top"
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
  candleX,
  chartWidth,
  verticalSide,
  onClose,
}: {
  index: number;
  candle: AnalysisStateClient["candles"][number];
  symbol: string;
  timeframe: string;
  candleX: number;
  chartWidth: number;
  verticalSide: "top" | "bottom";
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
        ...(verticalSide === "top" ? { top: 8 } : { bottom: PAD.b + 8 }),
        left: Math.max(PAD.l, Math.min(candleX - 110, chartWidth - 240)),
        background: "white",
        border: "1px solid rgba(0,0,0,0.15)",
        borderRadius: 6,
        padding: "8px 12px",
        fontSize: "12px",
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
          fontSize: "11px",
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
          fontSize: "11px",
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

  // Multi-pass prominence — drives both opacity and thickness so levels
  // rated "important" by enabled passes pop, others fade. When no passes
  // are present (all disabled), prominence is 1.0 and rendering matches
  // the pre-pass baseline (no regression).
  const prominence = computeProminence(level);

  // Effective side from polarity flip pass (when enabled). Falls back
  // to the level's original side. DEAD = the level has been crossed
  // multiple times; render as muted gray.
  const polarity = level.passes?.polarityFlip;
  const effectiveSide = polarity?.effectiveSide ?? level.side;

  const baseOpacity = levelOpacity(level.strength);
  const baseHeight = strengthLineHeightPx(level.strength);
  const opacity = baseOpacity * (0.15 + 0.85 * prominence);
  const visibleHeight = Math.max(1, baseHeight * (0.5 + 2 * prominence));

  let rgb: string;
  if (effectiveSide === "DEAD") rgb = "120,120,120";
  else if (effectiveSide === "RESISTANCE") rgb = "226,75,74";
  else rgb = "29,158,117";

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
      data-effective-side={effectiveSide}
      data-flipped={polarity?.flipped ? "true" : "false"}
      data-original-price={level.price}
      data-wick-price={level.wickPrice}
      data-confluence-count={level.confluenceCount}
      data-matching-tfs={level.matchingTimeframes.join(",")}
      data-strength={level.strength}
      data-prominence={prominence.toFixed(3)}
    />
  );
}

// computeProminence — combines enabled-pass results into a single 0..1
// score the renderer uses to scale opacity + thickness. Rule: any active
// pass that says "this matters" lifts prominence (max-of). Recency's
// wouldFilter knocks it back down.
//
// When no passes are present (all disabled at the route level), the
// function returns 1.0 — meaning the chart renders identically to the
// pre-pass behaviour. Toggling any pass on starts to differentiate
// levels visually.
function computeProminence(
  level: AnalysisStateClient["levels"][number],
): number {
  const passes = level.passes;
  if (!passes) return 1;
  const recency = passes.recency;
  const lastLeg = passes.lastLeg;
  const touchCount = passes.touchCount;

  if (!recency && !lastLeg && !touchCount) return 1;

  // Each pass votes for prominence independently; max-of wins. A pass
  // that thinks the level doesn't matter contributes 0 (its own opinion),
  // not a multiplier that overrides other passes. So a level filtered by
  // recency but flagged by lastLeg as a structural swing still shows.
  let p = 0;
  if (recency) {
    // Recency votes its value, or 0 if it'd filter.
    p = Math.max(p, recency.wouldFilter ? 0 : recency.value);
  }
  if (lastLeg) p = Math.max(p, lastLeg.value);
  if (touchCount) {
    // Normalise touch count: 0 → 0, 3+ → 1.
    const tn = Math.min(1, touchCount.value / 3);
    p = Math.max(p, tn);
  }
  return Math.max(0, Math.min(1, p));
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
  const polarity = level.passes?.polarityFlip;
  const effectiveSide = polarity?.effectiveSide ?? level.side;
  let rgb: string;
  if (effectiveSide === "DEAD") rgb = "120,120,120";
  else if (effectiveSide === "RESISTANCE") rgb = "226,75,74";
  else rgb = "29,158,117";
  const isProminent =
    level.strength === "very_strong" || level.strength === "strong";

  return (
    <div
      style={{
        position: "absolute",
        top: y - 6,
        left: endX + 4,
        fontSize: "11px",
        color: `rgba(${rgb},${Math.min(1, opacity + 0.25)})`,
        fontWeight: isProminent ? 500 : 400,
        fontFamily: "system-ui, sans-serif",
        pointerEvents: "none",
        whiteSpace: "nowrap",
      }}
      data-codesign-element="level-tag"
      data-level-tag-for={level.id}
      data-effective-side={effectiveSide}
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
              maxWidth: PAD.r - 8,
              overflow: "hidden",
              textOverflow: "ellipsis",
              fontSize: "11px",
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
            maxWidth: PAD.r - 8,
            overflow: "hidden",
            textOverflow: "ellipsis",
            fontSize: "11px",
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
    showSweptPools: boolean;
    showDeadPools: boolean;
    chartType: "candles" | "line";
    targetPoints: number;
    showRegimeStrip: boolean;
  },
): void {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, dims.W, dims.H);

  if (state.candles.length === 0) {
    ctx.fillStyle = C.txt;
    ctx.font = "12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("no candles", dims.W / 2, dims.H / 2);
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

  // Active and swept pools (translucent, behind candles). Active pools
  // extend to the chart edge; swept pools stop at the sweep candle because
  // their wick-side liquidity has already been consumed, even if the body
  // line has not structurally broken.
  const renderablePool = (pool: AnalysisStateClient["pools"][number]) => {
    const yTop = dims.toY(pool.wickHigh);
    const yBot = dims.toY(pool.wickLow);
    return !(yBot < PAD.t || yTop > PAD.t + dims.ch);
  };
  const activePools = opts.showPools
    ? selectPoolsForRender(
        state.pools.filter(
          (p) =>
            p.status === "active" &&
            renderablePool(p),
        ),
      )
    : [];
  const sweptPools =
    opts.showPools && opts.showSweptPools
      ? selectPoolsForRender(
          state.pools.filter(
            (p) =>
              p.status === "swept" &&
              renderablePool(p),
          ),
        )
      : [];
  const deadPools =
    opts.showPools && opts.showDeadPools
      ? selectPoolsForRender(
          state.pools.filter((p) => p.status === "dead" && renderablePool(p)),
        )
      : [];

  for (const pool of [...sweptPools, ...deadPools]) {
    const yTop = dims.toY(pool.wickHigh);
    const yBot = dims.toY(pool.wickLow);
    const birthIdx = pool.birthCandleIndexOnPrimary;
    const endIdx =
      pool.status === "dead"
        ? (pool.deathCandleIndexOnPrimary ?? pool.sweptCandleIndexOnPrimary)
        : pool.sweptCandleIndexOnPrimary;
    const x1 =
      birthIdx < 0
        ? PAD.l
        : dims.toX(Math.max(0, Math.min(dims.N - 1, birthIdx)));
    const x2 =
      endIdx !== null && endIdx !== undefined
        ? dims.toX(Math.max(0, Math.min(dims.N - 1, endIdx)))
        : PAD.l + dims.cw;
    const rgb = pool.type === "RESISTANCE" ? "226,75,74" : "29,158,117";
    const w = Math.max(1, x2 - x1);
    const h = yBot - yTop;
    const fillOpacity = pool.status === "dead" ? 0.035 : 0.055;
    const strokeOpacity = pool.status === "dead" ? 0.18 : 0.26;
    ctx.fillStyle = `rgba(${rgb},${fillOpacity})`;
    ctx.fillRect(x1, yTop, w, h);
    ctx.strokeStyle = `rgba(${rgb},${strokeOpacity})`;
    ctx.lineWidth = 1;
    ctx.setLineDash(pool.status === "dead" ? [4, 3] : []);
    ctx.strokeRect(x1, yTop, w, h);
    ctx.setLineDash([]);

    ctx.save();
    ctx.beginPath();
    ctx.rect(x1, yTop, w, h);
    ctx.clip();
    ctx.strokeStyle = `rgba(${rgb},0.14)`;
    ctx.lineWidth = 1;
    for (let x = x1 - h; x < x1 + w + h; x += 8) {
      ctx.beginPath();
      ctx.moveTo(x, yBot);
      ctx.lineTo(x + h, yTop);
      ctx.stroke();
    }
    ctx.restore();
  }

  for (const pool of activePools) {
    const yTop = dims.toY(pool.wickHigh);
    const yBot = dims.toY(pool.wickLow);
    const idx = pool.birthCandleIndexOnPrimary;
    const x1 =
      idx < 0 ? PAD.l : dims.toX(Math.max(0, Math.min(dims.N - 1, idx)));
    const x2 = PAD.l + dims.cw;
    const rgb = pool.type === "RESISTANCE" ? "226,75,74" : "29,158,117";
    ctx.fillStyle = `rgba(${rgb},0.11)`;
    ctx.fillRect(x1, yTop, x2 - x1, yBot - yTop);
    ctx.strokeStyle = `rgba(${rgb},0.52)`;
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

  // Mark price line — dashed line at the last candle's close + bold price label
  if (state.candles.length > 0) {
    const lastClose = state.candles[state.candles.length - 1].close;
    const markY = dims.toY(lastClose);
    ctx.strokeStyle = "rgba(61,61,58,0.3)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(PAD.l, markY);
    ctx.lineTo(PAD.l + dims.cw, markY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Bold price label on both Y axes
    ctx.fillStyle = C.txtP;
    ctx.font = "bold 11px system-ui";
    ctx.textAlign = "right";
    ctx.fillText(formatPrice(lastClose), PAD.l - 4, markY + 4);

    const rhsLabel = formatPrice(lastClose);
    const rhsW = Math.min(PAD.r - 12, Math.max(52, ctx.measureText(rhsLabel).width + 14));
    const rhsX = PAD.l + dims.cw + PAD.r - rhsW - 4;
    const rhsY = Math.max(PAD.t + 1, Math.min(PAD.t + dims.ch - 17, markY - 9));
    ctx.strokeStyle = "rgba(61,61,58,0.38)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD.l + dims.cw, markY);
    ctx.lineTo(rhsX, markY);
    ctx.stroke();
    ctx.fillStyle = "rgba(61,61,58,0.92)";
    ctx.fillRect(rhsX, rhsY, rhsW, 18);
    ctx.strokeStyle = "rgba(61,61,58,0.92)";
    ctx.lineWidth = 1;
    ctx.strokeRect(rhsX, rhsY, rhsW, 18);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.fillText(rhsLabel, rhsX + 7, rhsY + 13);
  }

  // Regime strip — top-edge band, one segment per primary candle. Each
  // segment is coloured by the recommended playbook at that bar (from the
  // full per-bar regime composite, not just the wire-angle bracket). Bars
  // where no playbook is recommended render blank — chart background shows
  // through. The first ~16 bars (smoothing + lookback) and the last 2 bars
  // (smoothing tail) have no data and also render blank — honest about
  // the lookback boundary rather than fabricating a value.
  if (opts.showRegimeStrip && state.regimeHistory.length > 0) {
    const stripTop = 6;
    const stripHeight = 6;
    for (const entry of state.regimeHistory) {
      if (entry.candleIndex < 0 || entry.candleIndex >= dims.N) continue;
      if (!entry.recommended) continue; // blank when no playbook applies
      const cx = dims.toX(entry.candleIndex);
      const x = cx - dims.halfWidth;
      const w = Math.max(1, dims.candleWidth);
      const fill = PLAYBOOK_STRIP_COLOR[entry.recommended.playbook];
      if (!fill) continue;
      ctx.fillStyle = fill;
      ctx.fillRect(x, stripTop, w, stripHeight);
    }
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

function selectPoolsForRender<T extends AnalysisStateClient["pools"][number]>(
  pools: T[],
): T[] {
  const bySide = {
    RESISTANCE: [] as T[],
    SUPPORT: [] as T[],
  };
  for (const pool of pools) bySide[pool.type].push(pool);
  return [
    ...selectPoolsForSide(bySide.RESISTANCE),
    ...selectPoolsForSide(bySide.SUPPORT),
  ];
}

function selectPoolsForSide<T extends AnalysisStateClient["pools"][number]>(
  pools: T[],
): T[] {
  const maxPerSide = 8;
  return [...pools]
    .sort((a, b) => {
      const tf = (TF_RANK[b.sourceTimeframe] ?? 0) - (TF_RANK[a.sourceTimeframe] ?? 0);
      if (tf !== 0) return tf;
      const pull = (b.pull?.decayed ?? 0) - (a.pull?.decayed ?? 0);
      if (pull !== 0) return pull;
      const strength = strengthRank(b.strength) - strengthRank(a.strength);
      if (strength !== 0) return strength;
      return b.birthCandleIndexOnPrimary - a.birthCandleIndexOnPrimary;
    })
    .slice(0, maxPerSide)
    .sort((a, b) => a.birthCandleIndexOnPrimary - b.birthCandleIndexOnPrimary);
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
