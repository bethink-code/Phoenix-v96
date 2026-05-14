// Trade overlay.
//
// The old renderer drew trades as horizontal level lines, which made them
// compete visually with actual structure levels on the chart. This renderer
// treats each trade as a vertical object:
// - a stem from stop to target
// - dots at the two ends
// - an entry dot on the stem
// - one compact badge describing whether the trade is a plan or live state

import type { Candle } from "@shared/zennyTypes";
import type {
  PaperPositionClient,
  PositionStatusClient,
  TradePhaseClient,
  TradePlanClient,
} from "./types";

interface Props {
  candles: Candle[];
  plans: TradePlanClient[];
  positions: PaperPositionClient[];
  priceMin: number;
  priceMax: number;
  padLeft: number;
  padRight: number;
  padTop: number;
  padBottom: number;
}

const COLORS = {
  stop: "rgba(226,75,74,0.95)",
  stopSoft: "rgba(226,75,74,0.22)",
  target: "rgba(29,158,117,0.95)",
  targetSoft: "rgba(29,158,117,0.22)",
  reach: "rgba(155,89,182,0.92)",
  reachSoft: "rgba(155,89,182,0.22)",
  take: "rgba(80,120,200,0.92)",
  takeSoft: "rgba(80,120,200,0.22)",
  neutral: "rgba(61,61,58,0.72)",
  neutralSoft: "rgba(61,61,58,0.12)",
  white: "#ffffff",
};

const PHASE_LABEL: Record<TradePhaseClient, string> = {
  reach: "REACH",
  take: "TAKE",
};

const PLAN_FUTURE_LANE_STEP_PX = 14;
const PLAN_PRICE_INDICATOR_OFFSET_PX = 28;
const PLAN_FUTURE_LANE_MIN_PX = 12;

export function TradeOverlay({
  candles,
  plans,
  positions,
  priceMin,
  priceMax,
  padLeft,
  padRight,
  padTop,
  padBottom,
}: Props) {
  const priceRange = priceMax - priceMin;
  if (priceRange <= 0 || candles.length === 0) return null;

  const candleCount = candles.length;
  const yFrac = (price: number) =>
    Math.max(0, Math.min(1, 1 - (price - priceMin) / priceRange));
  const xFracForTime = (barTime: number): number | null => {
    let closestIndex = -1;
    let closestDelta = Number.POSITIVE_INFINITY;
    for (let i = 0; i < candleCount; i++) {
      const delta = Math.abs(candles[i].openTime - barTime);
      if (delta < closestDelta) {
        closestDelta = delta;
        closestIndex = i;
      }
    }
    if (closestIndex < 0) return null;
    return (closestIndex + 0.5) / candleCount;
  };

  // Planned orders are future intent, not historical events. Anchor them in
  // the same right-hand lane as the current-price indicator so they read as
  // "current plan from here", while staying off the live candle area.
  const indicatorLanePx = Math.max(
    PLAN_FUTURE_LANE_MIN_PX,
    padRight - PLAN_PRICE_INDICATOR_OFFSET_PX,
  );
  const planAnchors = plans.map((_plan, index) => ({
    xFrac: 1,
    laneOffsetPx: Math.max(
      PLAN_FUTURE_LANE_MIN_PX,
      indicatorLanePx - index * PLAN_FUTURE_LANE_STEP_PX,
    ),
  }));

  const laneCounts = new Map<string, number>();
  const positionAnchors = positions.map((pos) => {
    const startTime =
      pos.filledAtBarTs ?? pos.submittedAtBarTs ?? pos.emittedAtBarTs;
    const xFrac = xFracForTime(startTime) ?? 0.96;
    const laneKey = `${Math.round(xFrac * 1000)}`;
    const laneIndex = laneCounts.get(laneKey) ?? 0;
    laneCounts.set(laneKey, laneIndex + 1);
    return {
      xFrac,
      laneOffsetPx: laneOffsetForIndex(laneIndex),
    };
  });

  return (
    <div className="absolute inset-0 z-10" style={{ pointerEvents: "none" }}>
      <div
        className="absolute"
        style={{
          left: padLeft,
          right: padRight,
          top: padTop,
          bottom: padBottom,
        }}
      >
        {plans.map((plan, index) => (
          <PlannedTradeStem
            key={`plan-${plan.phase}-${plan.side}-${plan.entry}-${index}`}
            plan={plan}
            xFrac={planAnchors[index].xFrac}
            laneOffsetPx={planAnchors[index].laneOffsetPx}
            yFrac={yFrac}
          />
        ))}

        {positions.map((pos, index) => (
          <PaperTradeStem
            key={pos.id}
            pos={pos}
            xFrac={positionAnchors[index].xFrac}
            laneOffsetPx={positionAnchors[index].laneOffsetPx}
            yFrac={yFrac}
            xFracForTime={xFracForTime}
          />
        ))}
      </div>
    </div>
  );
}

function PlannedTradeStem({
  plan,
  xFrac,
  laneOffsetPx,
  yFrac,
}: {
  plan: TradePlanClient;
  xFrac: number;
  laneOffsetPx: number;
  yFrac: (price: number) => number;
}) {
  return (
    <TradeStemShape
      xFrac={xFrac}
      laneOffsetPx={laneOffsetPx}
      entryYFrac={yFrac(plan.entry)}
      stopYFrac={yFrac(plan.stop)}
      targetYFrac={yFrac(plan.target)}
      dashed={true}
      entryRing={true}
      secondaryTargetYFrac={plan.target2 != null ? yFrac(plan.target2) : null}
    />
  );
}

function PaperTradeStem({
  pos,
  xFrac,
  laneOffsetPx,
  yFrac,
  xFracForTime,
}: {
  pos: PaperPositionClient;
  xFrac: number;
  laneOffsetPx: number;
  yFrac: (price: number) => number;
  xFracForTime: (barTime: number) => number | null;
}) {
  const isOpen = pos.status === "LIVE" || pos.status === "FILLED";
  const isClosed = pos.status === "CLOSED";
  const isPlanned = pos.status === "PLANNED";
  const isTerminal = !isOpen && !isPlanned;

  const exitXFrac =
    pos.closedAtBarTs != null ? xFracForTime(pos.closedAtBarTs) : null;
  const exitYFrac =
    pos.closePrice != null ? yFrac(pos.closePrice) : yFrac(pos.targetPrice);

  return (
    <>
      <TradeStemShape
        xFrac={xFrac}
        laneOffsetPx={laneOffsetPx}
        entryYFrac={yFrac(pos.fillPrice ?? pos.entryPrice)}
        stopYFrac={yFrac(pos.stopPrice)}
        targetYFrac={yFrac(pos.targetPrice)}
        dashed={isPlanned}
        faded={isClosed || isTerminal}
      />
      {exitXFrac != null && (
        <ExitMarker
          xFrac={exitXFrac}
          yFrac={exitYFrac}
          color={
            pos.realisedPnl != null
              ? pos.realisedPnl >= 0
                ? COLORS.target
                : COLORS.stop
              : pos.exitReason === "target"
                ? COLORS.target
                : COLORS.stop
          }
        />
      )}
    </>
  );
}

function TradeStemShape({
  xFrac,
  laneOffsetPx,
  entryYFrac,
  stopYFrac,
  targetYFrac,
  dashed = false,
  faded = false,
  entryRing = false,
  secondaryTargetYFrac = null,
}: {
  xFrac: number;
  laneOffsetPx: number;
  entryYFrac: number;
  stopYFrac: number;
  targetYFrac: number;
  dashed?: boolean;
  faded?: boolean;
  entryRing?: boolean;
  secondaryTargetYFrac?: number | null;
}) {
  const segmentOpacity = faded ? 0.22 : 0.4;
  const dotOpacity = faded ? 0.55 : 0.95;
  const stopTopYFrac = Math.min(entryYFrac, stopYFrac);
  const stopHeightPct = Math.max(0, Math.abs(stopYFrac - entryYFrac) * 100);
  const targetTopYFrac = Math.min(entryYFrac, targetYFrac);
  const targetHeightPct = Math.max(0, Math.abs(targetYFrac - entryYFrac) * 100);

  return (
    <>
      <div
        className="absolute"
        style={{
          left: `calc(${xFrac * 100}% + ${laneOffsetPx}px)`,
          top: `${stopTopYFrac * 100}%`,
          height: `${stopHeightPct}%`,
          borderLeft: dashed
            ? `2px dashed ${applyOpacity(COLORS.stop, segmentOpacity)}`
            : `2px solid ${applyOpacity(COLORS.stop, segmentOpacity)}`,
          transform: "translateX(-50%)",
        }}
      />
      <div
        className="absolute"
        style={{
          left: `calc(${xFrac * 100}% + ${laneOffsetPx}px)`,
          top: `${targetTopYFrac * 100}%`,
          height: `${targetHeightPct}%`,
          borderLeft: dashed
            ? `2px dashed ${applyOpacity(COLORS.target, segmentOpacity)}`
            : `2px solid ${applyOpacity(COLORS.target, segmentOpacity)}`,
          transform: "translateX(-50%)",
        }}
      />

      <StemDot
        xFrac={xFrac}
        laneOffsetPx={laneOffsetPx}
        yFrac={stopYFrac}
        color={applyOpacity(COLORS.stop, dotOpacity)}
        sizePx={10}
      />
      <StemDot
        xFrac={xFrac}
        laneOffsetPx={laneOffsetPx}
        yFrac={targetYFrac}
        color={applyOpacity(COLORS.target, dotOpacity)}
        sizePx={10}
      />
      {secondaryTargetYFrac != null && (
        <StemDot
        xFrac={xFrac}
        laneOffsetPx={laneOffsetPx}
        yFrac={secondaryTargetYFrac}
        color={applyOpacity(COLORS.target, faded ? 0.3 : 0.65)}
        sizePx={8}
        ring={true}
      />
      )}
      <StemDot
        xFrac={xFrac}
        laneOffsetPx={laneOffsetPx}
        yFrac={entryYFrac}
        color={applyOpacity(COLORS.neutral, dotOpacity)}
        sizePx={12}
        ring={entryRing}
      />
    </>
  );
}

function StemDot({
  xFrac,
  laneOffsetPx,
  yFrac,
  color,
  sizePx,
  ring = false,
}: {
  xFrac: number;
  laneOffsetPx: number;
  yFrac: number;
  color: string;
  sizePx: number;
  ring?: boolean;
}) {
  return (
    <div
      className="absolute rounded-full"
      style={{
        left: `calc(${xFrac * 100}% + ${laneOffsetPx}px)`,
        top: `${yFrac * 100}%`,
        width: sizePx,
        height: sizePx,
        transform: "translate(-50%, -50%)",
        background: ring ? COLORS.white : color,
        border: `2px solid ${color}`,
        boxShadow: "0 0 0 3px rgba(255,255,255,0.78)",
      }}
    />
  );
}

function ExitMarker({
  xFrac,
  yFrac,
  color,
}: {
  xFrac: number;
  yFrac: number;
  color: string;
}) {
  return (
    <>
      <div
        className="absolute"
        style={{
          left: `${xFrac * 100}%`,
          top: `calc(${yFrac * 100}% - 14px)`,
          height: 28,
          borderLeft: `1px solid ${applyOpacity(color, 0.6)}`,
          transform: "translateX(-50%)",
        }}
      />
      <StemDot
        xFrac={xFrac}
        laneOffsetPx={0}
        yFrac={yFrac}
        color={color}
        sizePx={10}
      />
    </>
  );
}

function laneOffsetForIndex(index: number): number {
  if (index === 0) return 0;
  const lane = Math.ceil(index / 2);
  return index % 2 === 1 ? lane * 12 : -lane * 12;
}

function applyOpacity(color: string, opacity: number): string {
  if (!color.startsWith("rgba(")) return color;
  const body = color.slice(5, -1);
  const parts = body.split(",");
  if (parts.length !== 4) return color;
  return `rgba(${parts[0]},${parts[1]},${parts[2]},${opacity})`;
}
