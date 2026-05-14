// ORDERS column content - the strategy for the current regime and the
// concrete order intentions it produced for the active timeframe.
//
// The chart can render multiple intentions at once (for example TAKE and
// REACH on the same timeframe). This column needs to tell the same truth as
// the chart, not collapse everything down to a single backward-compat plan.

import type {
  PaperPositionClient,
  PlaybookClient,
  RegimeAssessmentResultClient,
  TradePlanClient,
} from "./types";

const C = {
  text: "#888780",
  textStrong: "#3d3d3a",
  textDim: "#aaaaa3",
  rule: "rgba(0,0,0,0.06)",
  long: "#1d9e75",
  short: "#b14746",
};

const PLAYBOOK_LABEL: Record<PlaybookClient, string> = {
  accumulation: "ACCUMULATION",
  ranging: "RANGING",
  trending: "TRENDING",
  breakout: "BREAKOUT",
};

const PLAYBOOK_TAGLINE: Record<PlaybookClient, string> = {
  accumulation: "Buy-and-hold / DCA in a defined zone",
  ranging: "Mean-revert at pool extremes",
  trending: "Continuation on pullbacks",
  breakout: "Initial break + retest, reduced size",
};

const PLAYBOOK_COLOR: Record<PlaybookClient, string> = {
  accumulation: "#c89a4a",
  ranging: "#3a8d65",
  trending: "#1d9e75",
  breakout: "#2a6da3",
};

interface Props {
  tradePlan: TradePlanClient | null;
  tradePlans: TradePlanClient[];
  restingOrders: PaperPositionClient[];
  assessment: RegimeAssessmentResultClient | null;
  chartHeight: number;
}

export function OrdersStrategyColumnCollapsed({
  tradePlan,
  tradePlans,
  restingOrders,
  chartHeight,
}: Props) {
  const displayPlan = tradePlan ?? tradePlans[0] ?? null;
  if (!displayPlan) {
    if (restingOrders.length > 0) {
      const displayOrder = restingOrders[0];
      const orderStateLabel =
        displayOrder.submittedAtBarTs != null ? "on book" : "queued";
      const sideColor = displayOrder.side === "long" ? C.long : C.short;
      return (
        <div
          className="relative w-full flex flex-col items-center justify-center gap-1"
          style={{ height: chartHeight }}
        >
          <div
            style={{ color: sideColor, fontSize: 13, fontWeight: 600, lineHeight: 1 }}
          >
            {displayOrder.side === "long" ? "▲" : "▼"}
          </div>
          <div
            style={{
              color: C.textStrong,
              fontSize: 8,
              fontWeight: 600,
              lineHeight: 1,
              letterSpacing: "0.04em",
            }}
          >
            {displayOrder.phase.slice(0, 3).toUpperCase()}
          </div>
          <div style={{ color: C.textDim, fontSize: 8, lineHeight: 1 }}>
            {orderStateLabel}
          </div>
        </div>
      );
    }
    return (
      <div
        className="relative w-full flex items-center justify-center"
        style={{ height: chartHeight, color: C.textDim, fontSize: 10 }}
      >
        <span style={{ writingMode: "vertical-rl", letterSpacing: "0.05em" }}>
          no trade
        </span>
      </div>
    );
  }

  const sideColor = displayPlan.side === "long" ? C.long : C.short;
  const arrow = displayPlan.side === "long" ? "▲" : "▼";
  const playbookColor = PLAYBOOK_COLOR[displayPlan.playbook];
  const hasSubmittedOrder = restingOrders.some(
    (order) => order.submittedAtBarTs != null,
  );
  const hasQueuedOrder =
    restingOrders.length > 0 && !hasSubmittedOrder;
  const restingLabel = hasSubmittedOrder ? "on book" : "queued";

  return (
    <div
      className="relative w-full flex flex-col items-center justify-center gap-1"
      style={{ height: chartHeight }}
      title={`${PLAYBOOK_LABEL[displayPlan.playbook]} ${displayPlan.side.toUpperCase()} - entry ${formatPrice(displayPlan.entry)} - stop ${formatPrice(displayPlan.stop)} - target ${formatPrice(displayPlan.target)} - R:R ${displayPlan.riskRewardRatio.toFixed(1)}x - size ${displayPlan.sizeMultiplier.toFixed(1)}x`}
    >
      <div
        style={{ color: sideColor, fontSize: 13, fontWeight: 600, lineHeight: 1 }}
      >
        {arrow}
      </div>
      <div
        className="tabular-nums"
        style={{
          color: C.textStrong,
          fontSize: 11,
          fontWeight: 500,
          lineHeight: 1,
        }}
      >
        {displayPlan.riskRewardRatio.toFixed(1)}R
      </div>
      <div
        style={{
          color: playbookColor,
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: "0.04em",
          lineHeight: 1,
        }}
      >
        {displayPlan.playbook.slice(0, 3).toUpperCase()}
      </div>
      {tradePlans.length > 1 && (
        <div style={{ color: C.textDim, fontSize: 8, lineHeight: 1 }}>
          {tradePlans.length}x
        </div>
      )}
      {restingOrders.length > 0 && (
        <div style={{ color: C.textDim, fontSize: 8, lineHeight: 1 }}>
          {restingLabel}
        </div>
      )}
    </div>
  );
}

export function OrdersStrategyColumnExpanded({
  tradePlan,
  tradePlans,
  restingOrders,
  assessment,
}: Props) {
  const displayPlans =
    tradePlans.length > 0 ? tradePlans : tradePlan ? [tradePlan] : [];
  const sortedRestingOrders = restingOrders
    .slice()
    .sort(
      (a, b) =>
        (b.submittedAtBarTs ?? b.emittedAtBarTs) -
        (a.submittedAtBarTs ?? a.emittedAtBarTs),
    );
  if (displayPlans.length === 0 && sortedRestingOrders.length === 0) {
    return <NoTradeBlock assessment={assessment} />;
  }

  const primaryPlan = tradePlan ?? displayPlans[0] ?? null;

  return (
    <div className="flex flex-col gap-3" style={{ color: C.textStrong }}>
      {primaryPlan ? (
        <StrategyBlock playbook={primaryPlan.playbook} assessment={assessment} />
      ) : (
        <OrderStateOnlyBlock />
      )}
      {sortedRestingOrders.length > 0 && (
        <RestingOrdersBlock restingOrders={sortedRestingOrders} />
      )}
      {displayPlans.length > 1 && (
        <div
          style={{
            color: C.text,
            fontSize: 11,
            paddingTop: 8,
            borderTop: `1px solid ${C.rule}`,
          }}
        >
          {displayPlans.length} active order intentions on this timeframe.
        </div>
      )}
      {displayPlans.map((plan, index) => (
        <TradePlanBlock
          key={`${plan.phase}-${plan.side}-${plan.entry}-${index}`}
          plan={plan}
          heading={
            displayPlans.length > 1
              ? `CURRENT ANALYSIS ${index + 1}`
              : sortedRestingOrders.length > 0
                ? "CURRENT ANALYSIS"
                : "POSSIBLE TRADE"
          }
        />
      ))}
    </div>
  );
}

function RestingOrdersBlock({
  restingOrders,
}: {
  restingOrders: PaperPositionClient[];
}) {
  const submittedOrders = restingOrders.filter(
    (order) => order.submittedAtBarTs != null,
  );
  const queuedOrders = restingOrders.filter(
    (order) => order.submittedAtBarTs == null,
  );
  const summaryText =
    submittedOrders.length > 0 && queuedOrders.length > 0
      ? `${submittedOrders.length} paper order${submittedOrders.length === 1 ? "" : "s"} ${submittedOrders.length === 1 ? "is" : "are"} already on the book, and ${queuedOrders.length} ${queuedOrders.length === 1 ? "is" : "are"} still queued for the next runner step.`
      : submittedOrders.length > 0
        ? submittedOrders.length === 1
          ? "1 paper order is already on the book and waiting for a wick fill."
          : `${submittedOrders.length} paper orders are already on the book and waiting for wick fills.`
        : queuedOrders.length === 1
          ? "1 paper order is queued but has not been submitted onto the book yet."
          : `${queuedOrders.length} paper orders are queued but have not been submitted onto the book yet.`;

  return (
    <div
      style={{
        color: C.text,
        fontSize: 11,
        paddingTop: 8,
        borderTop: `1px solid ${C.rule}`,
      }}
    >
      <div style={{ marginBottom: 8 }}>{summaryText}</div>
      <div className="flex flex-col gap-2">
        {restingOrders.map((order) => (
          <RestingOrderBlock key={order.id} order={order} />
        ))}
      </div>
    </div>
  );
}

function StrategyBlock({
  playbook,
  assessment,
}: {
  playbook: PlaybookClient;
  assessment: RegimeAssessmentResultClient | null;
}) {
  const color = PLAYBOOK_COLOR[playbook];
  const playbookData = assessment?.primary.playbooks[playbook];

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
        STRATEGY
      </div>
      <div
        style={{
          color,
          fontSize: 16,
          fontWeight: 600,
          letterSpacing: "0.03em",
        }}
      >
        {PLAYBOOK_LABEL[playbook]}
      </div>
      <div style={{ color: C.text, fontSize: 11, marginTop: 2 }}>
        {PLAYBOOK_TAGLINE[playbook]}
      </div>
      {playbookData && (
        <div
          className="flex gap-3"
          style={{ marginTop: 4, fontSize: 11, color: C.text }}
        >
          <span>
            strength{" "}
            <span style={{ color: C.textStrong }}>
              {playbookData.strength.toFixed(2)}
            </span>
          </span>
          <span>
            confidence{" "}
            <span style={{ color: C.textStrong }}>
              {Math.round(playbookData.confidence * 100)}%
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

function OrderStateOnlyBlock() {
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
        STRATEGY
      </div>
      <div
        style={{
          color: C.textStrong,
          fontSize: 16,
          fontWeight: 600,
          letterSpacing: "0.03em",
        }}
      >
        ORDER STATE
      </div>
      <div style={{ color: C.text, fontSize: 11, marginTop: 2 }}>
        No fresh setup is being proposed right now, but an older paper order is
        still resting.
      </div>
    </div>
  );
}

function TradePlanBlock({
  plan,
  heading,
}: {
  plan: TradePlanClient;
  heading: string;
}) {
  const sideColor = plan.side === "long" ? C.long : C.short;
  const stopDistance = ((plan.stop - plan.entry) / plan.entry) * 100;
  const targetDistance = ((plan.target - plan.entry) / plan.entry) * 100;

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
            color: C.text,
            fontSize: 10,
            letterSpacing: "0.06em",
          }}
        >
          {heading}
        </div>
        <div
          style={{
            color: C.textDim,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.04em",
          }}
        >
          {plan.phase.toUpperCase()}
        </div>
      </div>

      <div className="flex justify-between items-baseline" style={{ marginTop: 6 }}>
        <div
          style={{
            color: sideColor,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.04em",
          }}
        >
          {plan.side === "long" ? "▲ LONG" : "▼ SHORT"}
        </div>
        <div style={{ color: C.text, fontSize: 11 }}>
          {PLAYBOOK_LABEL[plan.playbook]}
        </div>
      </div>

      <div className="flex flex-col gap-1" style={{ marginTop: 8 }}>
        <Row label="Entry" value={formatPrice(plan.entry)} />
        <Row
          label="Stop"
          value={`${formatPrice(plan.stop)}  (${formatSignedPct(stopDistance)})`}
          tone="negative"
        />
        <Row
          label="Target"
          value={`${formatPrice(plan.target)}  (${formatSignedPct(targetDistance)})`}
          tone="positive"
        />
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
          R:R{" "}
          <span
            className="tabular-nums"
            style={{ color: C.textStrong, fontWeight: 600 }}
          >
            {plan.riskRewardRatio.toFixed(1)}x
          </span>
        </span>
        <span style={{ color: C.text }}>
          Risk{" "}
          <span className="tabular-nums" style={{ color: C.textStrong }}>
            {plan.riskPct.toFixed(2)}%
          </span>
        </span>
        <span style={{ color: C.text }}>
          Size{" "}
          <span className="tabular-nums" style={{ color: C.textStrong }}>
            {plan.sizeMultiplier.toFixed(1)}x
          </span>
        </span>
      </div>

      {plan.rationale.length > 0 && (
        <div
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: `1px dashed ${C.rule}`,
          }}
        >
          <div
            style={{
              color: C.text,
              fontSize: 10,
              letterSpacing: "0.06em",
              marginBottom: 4,
            }}
          >
            WHY THIS GEOMETRY
          </div>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              fontSize: 11,
              color: C.textStrong,
              lineHeight: 1.5,
            }}
          >
            {plan.rationale.map((line, i) => (
              <li key={i} style={{ position: "relative", paddingLeft: 10 }}>
                <span
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    color: C.textDim,
                  }}
                >
                  .
                </span>
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function RestingOrderBlock({
  order,
}: {
  order: PaperPositionClient;
}) {
  const sideColor = order.side === "long" ? C.long : C.short;
  const stateLabel =
    order.submittedAtBarTs != null ? "RESTING PAPER ORDER" : "QUEUED PAPER ORDER";
  const stopDistance = ((order.stopPrice - order.entryPrice) / order.entryPrice) * 100;
  const targetDistance = ((order.targetPrice - order.entryPrice) / order.entryPrice) * 100;

  return (
    <div
      style={{
        paddingTop: 8,
        borderTop: `1px dashed ${C.rule}`,
      }}
    >
      <div className="flex justify-between items-baseline">
        <div
          style={{
            color: C.text,
            fontSize: 10,
            letterSpacing: "0.06em",
          }}
        >
          {stateLabel}
        </div>
        <div
          style={{
            color: C.textDim,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.04em",
          }}
        >
          {order.phase.toUpperCase()}
        </div>
      </div>

      <div className="flex justify-between items-baseline" style={{ marginTop: 6 }}>
        <div
          style={{
            color: sideColor,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.04em",
          }}
        >
          {order.side === "long" ? "▲ LONG" : "▼ SHORT"}
        </div>
        <div style={{ color: C.text, fontSize: 11 }}>{order.status}</div>
      </div>

      <div className="flex flex-col gap-1" style={{ marginTop: 8 }}>
        <Row label="Entry" value={formatPrice(order.entryPrice)} />
        <Row
          label="Stop"
          value={`${formatPrice(order.stopPrice)}  (${formatSignedPct(stopDistance)})`}
          tone="negative"
        />
        <Row
          label="Target"
          value={`${formatPrice(order.targetPrice)}  (${formatSignedPct(targetDistance)})`}
          tone="positive"
        />
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
            {order.riskPct.toFixed(2)}%
          </span>
        </span>
        <span style={{ color: C.text }}>
          Size{" "}
          <span className="tabular-nums" style={{ color: C.textStrong }}>
            {order.sizeMultiplier.toFixed(1)}x
          </span>
        </span>
      </div>
    </div>
  );
}

function NoTradeBlock({
  assessment,
}: {
  assessment: RegimeAssessmentResultClient | null;
}) {
  const recommendedPlaybook = assessment?.primary.recommended?.playbook ?? null;
  const regimeAllowsTrading = recommendedPlaybook !== null;

  return (
    <div className="flex flex-col gap-3" style={{ color: C.textStrong }}>
      <div>
        <div
          style={{
            color: C.text,
            fontSize: 10,
            letterSpacing: "0.06em",
            marginBottom: 4,
          }}
        >
          STRATEGY
        </div>
        <div
          style={{
            color: C.short,
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: "0.03em",
          }}
        >
          NO TRADE
        </div>
        <div style={{ color: C.text, fontSize: 11, marginTop: 2 }}>
          {regimeAllowsTrading && recommendedPlaybook
            ? `${PLAYBOOK_LABEL[recommendedPlaybook]} is tradeable as the current environment, but the order engine did not find an executable setup on this timeframe.`
            : "No playbook is recommended on the primary timeframe."}
        </div>
      </div>
      {assessment && (
        <div
          style={{
            paddingTop: 8,
            borderTop: `1px solid ${C.rule}`,
            fontSize: 11,
            color: C.text,
          }}
        >
          {regimeAllowsTrading
            ? "The regime layer is open, but the concrete order rules still did not produce a valid geometry. Open REGIME for context and wait for the actual setup conditions."
            : "Each playbook is either below threshold or vetoed by the regime layer. Open the REGIME column to inspect the evidence."}
        </div>
      )}
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

function formatSignedPct(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}
