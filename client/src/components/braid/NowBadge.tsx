// Now badge — first column in the NOW zone.
//
// The regime layer answers two questions every tick:
//   Q1 — What pattern are we in?     → wire-angle bracket (the playbook router)
//   Q2 — Is this a trading environment?  → per-playbook composite verdict
//
// The collapsed pill summarises both (bracket + a tradeable indicator dot
// from the recommended playbook). The expanded card shows the full
// per-playbook table, the detailed input contract that produced each
// verdict, and the per-TF chip strip.
//
// Math source: spec §1 + §1.3 (wire angle), §2.9 (RegimeGuard / now
// reframed as the "regime router"). Server contract:
// server/modules/zenny/analysis/regime/types.ts.

import type { Timeframe } from "@shared/zennyTypes";
import type {
  GannBracketClient,
  PlaybookAssessmentClient,
  PlaybookClient,
  RegimeAssessmentResultClient,
  RegimeInputsClient,
  TfRegimeClient,
  WireAnglePassResultClient,
  WireDirectionClient,
} from "./types";

const C = {
  text: "#888780",
  textStrong: "#3d3d3a",
  textDim: "#aaaaa3",
  amber: "#c89a4a",
  rule: "rgba(0,0,0,0.06)",
  bgSubtle: "rgba(0,0,0,0.025)",
};

const BRACKET_COLOR: Record<GannBracketClient, string> = {
  NO_TRADE: "#b14746",
  ACCUMULATION: "#c89a4a",
  RANGING: "#3a8d65",
  TRENDING: "#1d9e75",
  BREAKOUT: "#2a6da3",
};

const BRACKET_LABEL: Record<GannBracketClient, string> = {
  NO_TRADE: "NO TRADE",
  ACCUMULATION: "ACCUMULATION",
  RANGING: "RANGING",
  TRENDING: "TRENDING",
  BREAKOUT: "BREAKOUT",
};

const BRACKET_ABBR: Record<GannBracketClient, string> = {
  NO_TRADE: "—",
  ACCUMULATION: "ACC",
  RANGING: "RNG",
  TRENDING: "TRN",
  BREAKOUT: "BRK",
};

const PLAYBOOK_LABEL: Record<PlaybookClient, string> = {
  accumulation: "Accum",
  ranging: "Range",
  trending: "Trend",
  breakout: "Break",
};

// Each playbook's primary colour borrows from its native bracket palette.
const PLAYBOOK_COLOR: Record<PlaybookClient, string> = {
  accumulation: BRACKET_COLOR.ACCUMULATION,
  ranging: BRACKET_COLOR.RANGING,
  trending: BRACKET_COLOR.TRENDING,
  breakout: BRACKET_COLOR.BREAKOUT,
};

// One-line playbook description — how the playbook trades the regime.
const PLAYBOOK_TAGLINE: Record<PlaybookClient, string> = {
  accumulation: "Buy-and-hold / DCA in defined zone",
  ranging: "Mean-revert at pool extremes",
  trending: "Continuation on pullbacks",
  breakout: "Initial break + retest, reduced size",
};

const PLAYBOOK_ORDER: PlaybookClient[] = [
  "accumulation",
  "ranging",
  "trending",
  "breakout",
];

const TF_ORDER: Timeframe[] = ["15m", "1H", "4H", "12H", "D", "W", "M"];

// Human-readable labels for input rows. Keeps the card from leaking
// internal field names. Order also drives display order.
const INPUT_LABELS: Array<[keyof RegimeInputsClient, string]> = [
  ["angle", "Wire angle"],
  ["dwell", "Dwell / lock"],
  ["boundaryDistance", "Boundary distance"],
  ["htfAgreement", "HTF agreement"],
  ["armPull", "Arm pull"],
  ["poolStrength", "Pool strength"],
  ["touchQuality", "Touch quality"],
  ["recency", "Recency"],
  ["polarityFlips", "Polarity flips"],
  ["liquidationProximity", "Liq. proximity"],
  ["feedHealth", "Feed health"],
  ["spread", "Spread"],
  ["depth", "Order-book depth"],
  ["ofi", "Order-flow imbalance"],
  ["volumeDelta", "Volume delta"],
  ["cancelPullRatio", "Cancel/pull ratio"],
  ["realizedVolatility", "Realised volatility"],
  ["tickDensity", "Tick density"],
  ["absorption", "Absorption"],
];

interface Props {
  result: WireAnglePassResultClient | null;
  assessment: RegimeAssessmentResultClient | null;
  primaryTf: Timeframe;
  chartHeight: number;
}

// ---------------------------------------------------------------------------
// Collapsed — the small vertical pill at the now line
// ---------------------------------------------------------------------------

export function NowBadgeCollapsed({
  result,
  assessment,
  primaryTf,
  chartHeight,
}: Props) {
  const primaryRegime = result?.perTimeframe[primaryTf];
  if (!result || !primaryRegime) {
    return (
      <div
        className="relative w-full flex items-center justify-center"
        style={{ height: chartHeight, color: C.textDim, fontSize: 10 }}
      >
        <span style={{ writingMode: "vertical-rl", letterSpacing: "0.05em" }}>
          no wire
        </span>
      </div>
    );
  }

  const primary = primaryRegime.info;
  const dwell = primaryRegime.dwell;
  const color = BRACKET_COLOR[primary.gannBracket];
  const arrow = directionArrow(primary.direction);
  const recommended = assessment?.primary.recommended ?? null;

  return (
    <div
      className="relative w-full flex flex-col items-center justify-center gap-1"
      style={{ height: chartHeight }}
      title={
        recommended
          ? `${BRACKET_LABEL[primary.gannBracket]} pattern · ${PLAYBOOK_LABEL[recommended.playbook]} playbook tradeable (strength ${recommended.strength.toFixed(2)})`
          : `${BRACKET_LABEL[primary.gannBracket]} pattern · no tradeable playbook`
      }
    >
      <div style={{ color, fontSize: 13, fontWeight: 600, lineHeight: 1 }}>
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
        {formatAngle(primary.angleDeg)}
      </div>
      <div
        style={{
          color,
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: "0.04em",
          lineHeight: 1,
        }}
      >
        {BRACKET_ABBR[primary.gannBracket]}
        {dwell.pendingFlip ? "·" : ""}
      </div>
      {/* Tradeable dot — filled when a playbook is recommended, hollow if
          none. Quick scan for "is there an opportunity right now?" */}
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: recommended
            ? PLAYBOOK_COLOR[recommended.playbook]
            : "transparent",
          border: `1px solid ${recommended ? PLAYBOOK_COLOR[recommended.playbook] : C.textDim}`,
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expanded — the full regime detail card
// ---------------------------------------------------------------------------

export function NowBadgeExpanded({
  result,
  assessment,
  primaryTf,
}: Props) {
  const primaryRegime = result?.perTimeframe[primaryTf];
  if (!result || !primaryRegime) {
    return (
      <div className="text-sm" style={{ color: C.textDim }}>
        Wire angle pass disabled or not enough candles for the lookback window.
      </div>
    );
  }

  const primary = primaryRegime.info;
  const tfAssessment = assessment?.primary ?? null;

  return (
    <div className="flex flex-col gap-3" style={{ color: C.textStrong }}>
      {/* Pattern (Q1) — what playbook are we in. The router output. */}
      <PatternBlock primary={primary} />

      {/* Vol-normalisation diagnostics — the slope is now a Z-score, so
          the operator can see "what's a typical move on this TF" and how
          far the current move is from that. Replaces the bar-count
          interpretation that used to live here. */}
      <VolDiagnosticsBlock primary={primary} />

      {/* Verdict (Q2) — is this a trading environment, per playbook. */}
      {tfAssessment ? (
        <>
          <RecommendedBlock recommended={tfAssessment.recommended} />
          <PlaybookStrip
            playbooks={tfAssessment.playbooks}
            recommended={tfAssessment.recommended}
          />
        </>
      ) : (
        <div style={{ fontSize: 11, color: C.textDim }}>
          Regime assessment unavailable.
        </div>
      )}

      {/* Inputs — the constituent signals that produced the verdicts. */}
      {tfAssessment && <InputsBlock inputs={tfAssessment.inputs} />}

      {/* HTF strip — what pattern each TF is in. */}
      <HtfStrip
        result={result}
        primaryTf={primaryTf}
        assessment={assessment}
      />

      {/* Bracket legend — kept from the previous card. */}
      <div
        style={{
          fontSize: 11,
          color: C.text,
          lineHeight: 1.5,
          marginTop: 4,
          paddingTop: 8,
          borderTop: `1px solid ${C.rule}`,
        }}
      >
        Bracket from |angle| (spec §1.3): &lt;14° NO_TRADE, 14–26.25 ACCUM,
        26.25–45 RANGING, 45–63.75 TRENDING, &gt;63.75 BREAKOUT. Sign drives
        direction. The bracket routes which playbook applies; tradeability is
        the per-playbook composite below.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function VolDiagnosticsBlock({
  primary,
}: {
  primary: TfRegimeClient["info"];
}) {
  return (
    <div
      style={{
        fontSize: 11,
        color: C.text,
        padding: "6px 8px",
        background: C.bgSubtle,
        borderRadius: 4,
        display: "flex",
        flexDirection: "column",
        gap: 3,
      }}
      title="Volatility normalisation: slope = pct / (k · σ · √N). Angle is the Z-score of the smoothed move vs the TF's typical N-bar excursion."
    >
      <div className="flex justify-between">
        <span>% over {primary.lookback} bars</span>
        <span className="tabular-nums" style={{ color: C.textStrong }}>
          {primary.pctChange >= 0 ? "+" : ""}
          {primary.pctChange.toFixed(2)}%
        </span>
      </div>
      <div className="flex justify-between">
        <span>σ (per bar)</span>
        <span className="tabular-nums" style={{ color: C.textStrong }}>
          {primary.realizedVolPct.toFixed(2)}%
        </span>
      </div>
      <div className="flex justify-between">
        <span>Typical {primary.lookback}-bar move (σ·√N)</span>
        <span className="tabular-nums" style={{ color: C.textStrong }}>
          {primary.expectedWindowMovePct.toFixed(2)}%
        </span>
      </div>
      <div className="flex justify-between">
        <span>Z-score (move ÷ typical)</span>
        <span className="tabular-nums" style={{ color: C.textStrong }}>
          {primary.zScore >= 0 ? "+" : ""}
          {primary.zScore.toFixed(2)}σ
        </span>
      </div>
    </div>
  );
}

function PatternBlock({
  primary,
}: {
  primary: TfRegimeClient["info"];
}) {
  const color = BRACKET_COLOR[primary.gannBracket];
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
        PATTERN
      </div>
      <div
        style={{
          color,
          fontSize: 16,
          fontWeight: 600,
          letterSpacing: "0.03em",
        }}
      >
        {BRACKET_LABEL[primary.gannBracket]}
      </div>
      <div style={{ color: C.text, fontSize: 11, marginTop: 2 }}>
        {primary.gannBracket === "NO_TRADE"
          ? "No clear regime — sit out"
          : `${PLAYBOOK_TAGLINE[bracketToPlaybook(primary.gannBracket)]} `}
      </div>
    </div>
  );
}

function RecommendedBlock({
  recommended,
}: {
  recommended:
    | { playbook: PlaybookClient; strength: number }
    | null;
}) {
  if (!recommended) {
    return (
      <div
        style={{
          fontSize: 11,
          color: C.text,
          padding: "6px 8px",
          background: C.bgSubtle,
          borderRadius: 4,
          borderLeft: `2px solid ${BRACKET_COLOR.NO_TRADE}`,
        }}
      >
        <span style={{ fontWeight: 600 }}>No tradeable playbook</span>
        <div style={{ marginTop: 2, fontSize: 11 }}>
          Composite verdict: every playbook is below threshold or vetoed.
        </div>
      </div>
    );
  }
  const color = PLAYBOOK_COLOR[recommended.playbook];
  return (
    <div
      style={{
        fontSize: 11,
        color: C.textStrong,
        padding: "6px 8px",
        background: "rgba(58,141,101,0.08)",
        borderLeft: `2px solid ${color}`,
        borderRadius: 4,
      }}
    >
      <div className="flex items-center justify-between">
        <span style={{ fontWeight: 600, color }}>
          {PLAYBOOK_LABEL[recommended.playbook]} tradeable
        </span>
        <span className="tabular-nums">
          strength {recommended.strength.toFixed(2)}
        </span>
      </div>
      <div style={{ marginTop: 2, color: C.text }}>
        {PLAYBOOK_TAGLINE[recommended.playbook]}
      </div>
    </div>
  );
}

function PlaybookStrip({
  playbooks,
  recommended,
}: {
  playbooks: Record<PlaybookClient, PlaybookAssessmentClient>;
  recommended: { playbook: PlaybookClient; strength: number } | null;
}) {
  return (
    <div
      style={{ marginTop: 2, paddingTop: 6, borderTop: `1px solid ${C.rule}` }}
    >
      <div
        style={{
          color: C.text,
          fontSize: 10,
          letterSpacing: "0.06em",
          marginBottom: 4,
        }}
      >
        PLAYBOOKS
      </div>
      <div className="flex flex-col gap-1">
        {PLAYBOOK_ORDER.map((p) => (
          <PlaybookRow
            key={p}
            assessment={playbooks[p]}
            isRecommended={recommended?.playbook === p}
          />
        ))}
      </div>
    </div>
  );
}

function PlaybookRow({
  assessment,
  isRecommended,
}: {
  assessment: PlaybookAssessmentClient;
  isRecommended: boolean;
}) {
  const color = PLAYBOOK_COLOR[assessment.playbook];
  const dimmed = !assessment.tradeable;
  return (
    <div
      title={
        assessment.reasons.length > 0
          ? assessment.reasons.join(" · ")
          : assessment.tradeable
            ? "tradeable"
            : "not tradeable"
      }
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        opacity: dimmed ? 0.55 : 1,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: assessment.tradeable ? color : "transparent",
          border: `1px solid ${color}`,
          flex: "0 0 auto",
        }}
      />
      <span
        style={{
          fontWeight: isRecommended ? 600 : 500,
          color: dimmed ? C.text : C.textStrong,
          width: 56,
        }}
      >
        {PLAYBOOK_LABEL[assessment.playbook]}
      </span>
      {/* Strength bar */}
      <div
        style={{
          flex: 1,
          height: 4,
          background: C.bgSubtle,
          borderRadius: 2,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            width: `${Math.round(assessment.strength * 100)}%`,
            background: color,
            opacity: assessment.tradeable ? 0.9 : 0.4,
          }}
        />
      </div>
      <span
        className="tabular-nums"
        style={{
          color: C.textStrong,
          fontSize: 11,
          width: 32,
          textAlign: "right",
        }}
      >
        {assessment.strength.toFixed(2)}
      </span>
      <span
        className="tabular-nums"
        style={{
          color: C.textDim,
          fontSize: 10,
          width: 36,
          textAlign: "right",
        }}
        title={`Confidence ${(assessment.confidence * 100).toFixed(0)}% — fraction of input weight that has data`}
      >
        c{Math.round(assessment.confidence * 100)}
      </span>
    </div>
  );
}

function InputsBlock({ inputs }: { inputs: RegimeInputsClient }) {
  // Split into available vs unavailable so the card can show the evidence
  // we have prominently and group the missing slots into a "needs" block.
  const available: Array<[keyof RegimeInputsClient, string]> = [];
  const unavailable: Array<[keyof RegimeInputsClient, string]> = [];
  for (const [key, label] of INPUT_LABELS) {
    if (inputs[key].available) available.push([key, label]);
    else unavailable.push([key, label]);
  }
  return (
    <div
      style={{ marginTop: 2, paddingTop: 6, borderTop: `1px solid ${C.rule}` }}
    >
      <div
        style={{
          color: C.text,
          fontSize: 10,
          letterSpacing: "0.06em",
          marginBottom: 4,
        }}
      >
        INPUTS
      </div>
      <div className="flex flex-col gap-1">
        {available.map(([key, label]) => (
          <InputRow key={key} label={label} input={inputs[key]} />
        ))}
      </div>
      {unavailable.length > 0 && (
        <div
          style={{
            marginTop: 6,
            paddingTop: 4,
            borderTop: `1px dashed ${C.rule}`,
            fontSize: 10,
            color: C.textDim,
          }}
        >
          Not yet wired: {unavailable.map(([, label]) => label).join(", ")}
        </div>
      )}
    </div>
  );
}

function InputRow({
  label,
  input,
}: {
  label: string;
  input: RegimeInputsClient[keyof RegimeInputsClient];
}) {
  return (
    <div
      className="flex justify-between items-baseline"
      title={input.available ? "" : input.reason}
    >
      <span style={{ color: C.text, fontSize: 11 }}>{label}</span>
      <span
        className="tabular-nums"
        style={{
          color: input.available ? C.textStrong : C.textDim,
          fontSize: 11,
          fontWeight: input.available ? 500 : 400,
        }}
      >
        {input.available
          ? formatInputValue(label, input.value as Record<string, unknown>)
          : "—"}
      </span>
    </div>
  );
}

function HtfStrip({
  result,
  primaryTf,
  assessment,
}: {
  result: WireAnglePassResultClient;
  primaryTf: Timeframe;
  assessment: RegimeAssessmentResultClient | null;
}) {
  const tfs = TF_ORDER.filter((tf) => result.perTimeframe[tf]);
  if (tfs.length === 0) return null;
  const agreement = result.agreement;
  const verdict = agreement.htfConfirms;
  const verdictColor =
    verdict === "yes"
      ? BRACKET_COLOR.RANGING
      : verdict === "no"
        ? BRACKET_COLOR.NO_TRADE
        : C.text;
  const verdictLabel =
    verdict === "yes"
      ? "HTFs confirm ✓"
      : verdict === "no"
        ? "HTFs oppose ✗"
        : "HTFs mixed";

  // The recommended primary playbook surfaces a colour cue per chip when
  // that TF's bracket matches the playbook's bracket family.
  const recommended = assessment?.primary.recommended ?? null;

  return (
    <div
      style={{ marginTop: 2, paddingTop: 6, borderTop: `1px solid ${C.rule}` }}
    >
      <div className="flex items-center justify-between">
        <span
          style={{ color: C.text, fontSize: 10, letterSpacing: "0.06em" }}
        >
          PER-TF
        </span>
        <span
          className="tabular-nums"
          style={{ fontSize: 11, fontWeight: 500, color: verdictColor }}
        >
          {agreement.matchingDirectionCount}/{agreement.totalAnalysed} ·{" "}
          {verdictLabel}
        </span>
      </div>
      <div className="flex flex-wrap gap-1" style={{ marginTop: 4 }}>
        {tfs.map((tf) => {
          const regime = result.perTimeframe[tf]!;
          return (
            <TfChip
              key={tf}
              tf={tf}
              regime={regime}
              isPrimary={tf === primaryTf}
              recommendedPlaybook={recommended?.playbook ?? null}
            />
          );
        })}
      </div>
    </div>
  );
}

function TfChip({
  tf,
  regime,
  isPrimary,
  recommendedPlaybook,
}: {
  tf: Timeframe;
  regime: TfRegimeClient;
  isPrimary: boolean;
  recommendedPlaybook: PlaybookClient | null;
}) {
  const { info, dwell } = regime;
  const color = BRACKET_COLOR[info.gannBracket];
  // The chip lights up as "in same playbook family as primary's
  // recommendation" — solid ring when the TF's bracket matches the
  // recommended playbook's bracket. That answers "does this TF support
  // the trade we'd take" at a glance.
  const tfPlaybook = bracketToPlaybook(info.gannBracket);
  const matchesRecommended =
    recommendedPlaybook !== null && tfPlaybook === recommendedPlaybook;
  return (
    <div
      title={`${tf} · ${BRACKET_LABEL[info.gannBracket]} · ${formatAngle(info.angleDeg)} · locked ${BRACKET_LABEL[dwell.lockedBracket]} (${dwell.candidateBarsObserved}/${dwell.dwellBarsRequired})`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 3,
        padding: "2px 6px",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.03em",
        color,
        border: matchesRecommended
          ? `2px solid ${color}`
          : `1px solid ${C.rule}`,
        background: isPrimary ? "rgba(0,0,0,0.04)" : "transparent",
        borderRadius: 3,
      }}
    >
      <span style={{ color: C.textStrong, fontWeight: 500 }}>{tf}</span>
      <span>{directionArrow(info.direction)}</span>
      <span>
        {BRACKET_ABBR[info.gannBracket]}
        {dwell.pendingFlip ? "·" : ""}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAngle(angleDeg: number): string {
  const sign = angleDeg > 0 ? "+" : "";
  return `${sign}${angleDeg.toFixed(1)}°`;
}

function directionArrow(d: WireDirectionClient): string {
  return d === "up" ? "▲" : d === "down" ? "▼" : "·";
}

// Map a bracket to the playbook that takes it on. NO_TRADE has no playbook —
// caller must guard. Used for chip-colour matching against the recommended
// playbook + for the pattern-block tagline.
function bracketToPlaybook(bracket: GannBracketClient): PlaybookClient {
  switch (bracket) {
    case "ACCUMULATION":
      return "accumulation";
    case "RANGING":
      return "ranging";
    case "TRENDING":
      return "trending";
    case "BREAKOUT":
      return "breakout";
    case "NO_TRADE":
    default:
      // Caller must handle NO_TRADE separately (no playbook). Fall through
      // to accumulation so the type system stays happy; visual code that
      // uses this should already have NO_TRADE-specific rendering.
      return "accumulation";
  }
}

// Render an input value as a compact one-line string. Format depends on
// the input's shape — angle gets degrees, dwell gets X/Y bars, etc. The
// label is passed in so the formatter can pick a per-input renderer
// without re-keying off the inputs Record.
function formatInputValue(
  label: string,
  v: Record<string, unknown> | undefined,
): string {
  if (!v) return "—";
  // Branch by label so the formatter is data-shape-agnostic and doesn't
  // need to know the keyof RegimeInputsClient enumeration. Each branch
  // reads the fields it expects and falls back to JSON-ish summary.
  switch (label) {
    case "Wire angle":
      return `${v.angleDeg !== undefined ? (v.angleDeg as number).toFixed(1) + "°" : "—"} · ${v.bracket ?? "—"}`;
    case "Dwell / lock":
      return `${v.locked ? "locked" : "pending"} ${v.candidateBracket ?? "—"} (${v.observedBars}/${v.requiredBars})`;
    case "Boundary distance":
      return `${(v.degreesToNearest as number).toFixed(1)}° · centerness ${(v.centerness as number).toFixed(2)}`;
    case "HTF agreement":
      return `${v.matchingDirectionCount}/${v.totalAnalysed} · ${v.htfConfirms}`;
    case "Arm pull":
      return `up ${formatPull(v.upperPull as number | null)} · dn ${formatPull(v.lowerPull as number | null)} · ${v.dominantSide}`;
    case "Pool strength":
      return `${v.activeNearbyCount} nearby${v.hasStrongNearby ? " · strong" : ""}`;
    case "Touch quality":
      return `${(v.averageTouchCount as number).toFixed(1)} avg · ${v.strongPoolCount} strong`;
    case "Recency":
      return (v.averageRecency as number).toFixed(2);
    case "Polarity flips":
      return String(v.recentFlipCount);
    case "Liq. proximity":
      return v.nearestDistancePct === null
        ? "no clusters"
        : `${(v.nearestDistancePct as number).toFixed(2)}%`;
    case "Feed health":
      return String(v.status);
    default:
      return "—";
  }
}

function formatPull(p: number | null): string {
  if (p === null) return "—";
  return p.toFixed(2);
}
