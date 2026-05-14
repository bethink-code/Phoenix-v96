// Trades column - collapsed shows actual filled/open trade count, expanded
// shows only the persisted trade lifecycle after an entry has filled.

import type { PaperPositionClient } from "./types";

const C = {
  text: "#888780",
  textStrong: "#3d3d3a",
  textDim: "#aaaaa3",
  rule: "rgba(0,0,0,0.06)",
  long: "#1d9e75",
  short: "#b14746",
};

interface CollapsedProps {
  chartHeight: number;
  openPositions: PaperPositionClient[];
}

interface ExpandedProps {
  positions: PaperPositionClient[];
  openPositions: PaperPositionClient[];
}

export function TradesColumnCollapsed({
  chartHeight,
  openPositions,
}: CollapsedProps) {
  return (
    <div
      className="relative w-full h-full flex flex-col items-center justify-center"
      style={{ paddingTop: 24, color: C.text }}
    >
      <div style={{ fontSize: 18, fontWeight: 600, color: C.textStrong }}>
        {openPositions.length}
      </div>
      <div style={{ fontSize: 9, marginTop: 2 }}>active</div>
    </div>
  );
}

export function TradesColumnExpanded({
  positions,
  openPositions,
}: ExpandedProps) {
  const closedPositions = positions
    .filter((p) => p.status === "CLOSED")
    .slice()
    .sort((a, b) => (b.closedAtBarTs ?? 0) - (a.closedAtBarTs ?? 0));

  return (
    <div className="flex flex-col gap-3" style={{ color: C.textStrong }}>
      <SectionHeading
        title="ACTIVE PAPER STATE"
        subtitle={
          openPositions.length > 0
            ? `${openPositions.length} open paper trade${openPositions.length === 1 ? "" : "s"} on this timeframe.`
            : "No filled paper trades are currently open on this timeframe."
        }
      />

      {openPositions.length > 0 ? (
        <div className="flex flex-col gap-2">
          {openPositions
            .slice()
            .sort((a, b) => b.emittedAtBarTs - a.emittedAtBarTs)
            .map((pos) => (
              <PositionCard key={pos.id} pos={pos} />
            ))}
        </div>
      ) : (
        <EmptyBlock text="Nothing has filled here yet." />
      )}

      <SectionHeading
        title="CLOSED HISTORY"
        subtitle={
          closedPositions.length > 0
            ? `${closedPositions.length} closed paper trades in history.`
            : "No closed paper trades yet."
        }
      />

      {closedPositions.length > 0 ? (
        <div className="flex flex-col gap-2">
          {closedPositions.slice(0, 8).map((pos) => (
            <PositionCard key={pos.id} pos={pos} compact={true} />
          ))}
        </div>
      ) : (
        <EmptyBlock text="Nothing has fully completed on this timeframe yet." />
      )}
    </div>
  );
}

function SectionHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div>
      <div
        style={{
          color: C.text,
          fontSize: 10,
          letterSpacing: "0.06em",
          marginBottom: 4,
        }}
      >
        {title}
      </div>
      <div style={{ color: C.text, fontSize: 11 }}>{subtitle}</div>
    </div>
  );
}

function PositionCard({
  pos,
  compact = false,
}: {
  pos: PaperPositionClient;
  compact?: boolean;
}) {
  const sideColor = pos.side === "long" ? C.long : C.short;
  const pnl = pos.realisedPnl;
  const pnlColor =
    pnl == null ? C.textStrong : pnl >= 0 ? C.long : C.short;

  return (
    <div
      style={{
        paddingTop: 8,
        borderTop: `1px solid ${C.rule}`,
      }}
    >
      <div className="flex justify-between items-baseline">
        <div
          style={{
            color: sideColor,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.04em",
          }}
        >
          {pos.phase.toUpperCase()} {pos.side.toUpperCase()}
        </div>
        <div
          style={{
            color: C.text,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.04em",
          }}
        >
          {pos.status}
        </div>
      </div>

      <div className="flex flex-col gap-1" style={{ marginTop: 6 }}>
        <Row label="Entry" value={formatPrice(pos.entryPrice)} />
        <Row label="Stop" value={formatPrice(pos.stopPrice)} tone="negative" />
        <Row label="Target" value={formatPrice(pos.targetPrice)} tone="positive" />
        {pos.fillPrice != null && (
          <Row label="Fill" value={formatPrice(pos.fillPrice)} />
        )}
        {pos.closePrice != null && (
          <Row label="Close" value={formatPrice(pos.closePrice)} />
        )}
      </div>

      <div
        className="flex gap-4"
        style={{
          marginTop: 8,
          paddingTop: 8,
          borderTop: `1px dashed ${C.rule}`,
          fontSize: 11,
        }}
      >
        <span style={{ color: C.text }}>
          Risk{" "}
          <span className="tabular-nums" style={{ color: C.textStrong }}>
            {pos.riskPct.toFixed(2)}%
          </span>
        </span>
        <span style={{ color: C.text }}>
          Size{" "}
          <span className="tabular-nums" style={{ color: C.textStrong }}>
            {pos.sizeMultiplier.toFixed(1)}x
          </span>
        </span>
        {pnl != null && (
          <span style={{ color: C.text }}>
            PnL{" "}
            <span className="tabular-nums" style={{ color: pnlColor, fontWeight: 600 }}>
              {formatPnl(pnl)}
            </span>
          </span>
        )}
      </div>

      {!compact && (pos.exitReason || pos.rejectionReason) && (
        <div style={{ marginTop: 8, color: C.text, fontSize: 11 }}>
          {pos.rejectionReason ?? pos.exitReason}
        </div>
      )}
    </div>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return (
    <div
      style={{
        color: C.text,
        fontStyle: "italic",
        paddingTop: 8,
        borderTop: `1px solid ${C.rule}`,
      }}
    >
      {text}
    </div>
  );
}

function Row({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const valueColor =
    tone === "positive"
      ? C.long
      : tone === "negative"
        ? C.short
        : C.textStrong;

  return (
    <div className="flex justify-between items-baseline">
      <span style={{ color: C.text, fontSize: 11 }}>{label}</span>
      <span
        className="tabular-nums"
        style={{ color: valueColor, fontSize: 12, fontWeight: 500 }}
      >
        {value}
      </span>
    </div>
  );
}

function formatPrice(p: number): string {
  if (p >= 10_000) return "$" + (p / 1000).toFixed(2) + "K";
  if (p >= 1_000) return "$" + p.toFixed(0);
  if (p >= 1) return "$" + p.toFixed(2);
  return "$" + p.toFixed(4);
}

function formatPnl(p: number): string {
  const sign = p >= 0 ? "+" : "";
  return `${sign}${p.toFixed(2)}`;
}
