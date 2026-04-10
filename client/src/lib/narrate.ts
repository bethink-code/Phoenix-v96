// The bot's voice. First-person. Calibrated. Not crypto-broey.
//
// Every bot decision row from the DB gets turned into a single sentence,
// spoken as if by the operator's alter ego — the part of them that watches
// the market on their behalf during the week. Short. Quiet when nothing's
// happening. Clear when it matters.
//
// Pure function, no I/O, no randomness tied to wall clock. Randomness is
// seeded from the decision id so the same row always renders the same line —
// otherwise the feed would shuffle every re-render and be unreadable.

export type Mood =
  | "idle" // nothing happening, grey
  | "watching" // actively evaluating, slightly warmer grey
  | "interested" // saw something, considered it, passed — amber
  | "entered" // took a position — primary/orange
  | "won" // target hit — green
  | "lost" // stop hit — red
  | "halted" // something went wrong — red
  | "regime"; // operator changed regime — blue

export interface Narration {
  text: string;
  mood: Mood;
  subtext?: string; // optional second line for technical detail
}

interface DecisionRow {
  id: string;
  createdAt: string;
  decisionType: string;
  regime: string;
  reasoning: string | null;
  outputs: Record<string, unknown> | null;
}

export function narrate(row: DecisionRow): Narration {
  const out = (row.outputs ?? {}) as Record<string, unknown>;
  const seed = hashSeed(row.id);

  // Exits ------------------------------------------------------------
  if (row.decisionType === "exit") {
    const reason = String(out.reason ?? "");
    const pnl = Number(out.realisedPnl ?? 0);
    const exitPrice = Number(out.exitPrice ?? 0);
    if (reason === "target") {
      return {
        text: pick(seed, [
          `Target hit. ${money(pnl)} in the pocket.`,
          `Out on target. ${money(pnl)}.`,
          `Clean one. Target reached, +${money(Math.abs(pnl))}.`,
        ]),
        mood: "won",
        subtext: `exited at ${price(exitPrice)}`,
      };
    }
    if (reason === "stop") {
      return {
        text: pick(seed, [
          `Stopped. ${money(pnl)}. On to the next.`,
          `Took the stop. No drama.`,
          `Wrong read. Out at the stop, ${money(pnl)}.`,
        ]),
        mood: "lost",
        subtext: `exited at ${price(exitPrice)}`,
      };
    }
    if (reason === "emergency") {
      return {
        text: `Closed at market. ${money(pnl)}. Bot is flat.`,
        mood: "lost",
        subtext: `emergency exit at ${price(exitPrice)}`,
      };
    }
    return { text: `Closed the trade. ${money(pnl)}.`, mood: "idle" };
  }

  // Entries -----------------------------------------------------------
  if (row.decisionType === "entry") {
    const proposal = out.proposal as
      | { side: "long" | "short"; setupMode: string; entryPrice: number; stopPrice: number; targetPrice: number }
      | undefined;
    const decision = out.decision as { plannedRR?: number; riskAmount?: number } | undefined;
    if (proposal) {
      const rr = decision?.plannedRR ?? 0;
      const risk = decision?.riskAmount ?? 0;
      const modeWord = proposal.setupMode === "mode_b" ? "confirmation" : "survival";
      const direction = proposal.side === "long" ? "long" : "short";
      return {
        text: pick(seed, [
          `Took a ${direction}. ${capitalise(modeWord)} setup — risking ${money(risk)} for about ${rr.toFixed(1)}:1.`,
          `Just entered ${direction} at ${price(proposal.entryPrice)}. Liked this one.`,
          `${capitalise(direction)}. Stop ${price(proposal.stopPrice)}, target ${price(proposal.targetPrice)}.`,
        ]),
        mood: "entered",
        subtext: `${proposal.side} · stop ${price(proposal.stopPrice)} · target ${price(proposal.targetPrice)} · ${rr.toFixed(2)}:1`,
      };
    }
    return { text: "Opened a position.", mood: "entered" };
  }

  // Halted / error ----------------------------------------------------
  if (row.decisionType === "halt") {
    return {
      text: "Halted. Not trading again until you pick a regime.",
      mood: "halted",
    };
  }

  // Skips — the main category. Unwrap the risk manager's reason. ------
  if (row.decisionType === "skip") {
    const topReason = String(out.reason ?? "");
    const innerReason = typeof out.detail === "string" ? out.detail : "";
    const proposal = out.proposal as
      | { entryPrice: number; stopPrice: number; targetPrice: number; side: string }
      | undefined;
    const decision = out.decision as { plannedRR?: number } | undefined;

    if (topReason === "regime_autopilot_change") {
      const to = String(out.toRegime ?? "");
      const from = String(out.fromRegime ?? "");
      const conf = typeof out.confidence === "number" ? out.confidence : 0;
      return {
        text: `Switched regime on my own — ${prettyRegime(from)} → ${prettyRegime(to)}. Confidence ${Math.round(conf * 100)}%.`,
        mood: "regime",
        subtext: Array.isArray(out.rationale) && out.rationale.length > 0
          ? String(out.rationale[0])
          : undefined,
      };
    }

    if (topReason === "no_sweep") {
      return {
        text: pick(seed, [
          "Nothing. Watching.",
          "Quiet.",
          "Still inside the range. Nothing to do.",
          "No sweep. Just watching price breathe.",
          "Waiting for something to poke at a level.",
        ]),
        mood: "idle",
      };
    }

    if (topReason === "no_valid_proposal") {
      return {
        text: pick(seed, [
          "Saw something but it didn't fit the setup. Ignoring.",
          "Sweep happened, no clean reversal signal. Passing.",
        ]),
        mood: "watching",
      };
    }

    if (topReason === "duplicate_level") {
      return {
        text: "Another wick on the same level I'm already in. Not stacking.",
        mood: "watching",
      };
    }

    if (topReason === "no_active_pair") {
      return { text: "No pair selected. Pick one in Settings.", mood: "idle" };
    }
    if (topReason === "exchange_fetch_failed") {
      const err = String(out.error ?? "unknown");
      // Geo-block from Binance is the most likely culprit
      const isGeoBlock = /restricted location|451/i.test(err);
      return {
        text: isGeoBlock
          ? "Exchange is geo-blocking my server. I can't fetch market data from here."
          : `Couldn't reach the exchange. ${err.slice(0, 120)}`,
        mood: "halted",
        subtext: typeof out.consecutiveFailures === "number"
          ? `failure ${out.consecutiveFailures}/3`
          : undefined,
      };
    }
    if (topReason === "temporal_filter_closed") {
      const gate = String((out as { gate?: string }).gate ?? "");
      return {
        text: `Outside my trading hours (${gate || "closed"}). Not looking.`,
        mood: "idle",
      };
    }
    if (topReason === "regime_suppressed") {
      return { text: "Regime says sit. Sitting.", mood: "idle" };
    }
    if (topReason === "insufficient_candles") {
      return { text: "Not enough history yet. Warming up.", mood: "idle" };
    }

    if (topReason === "risk_rejected") {
      const riskDetail = out.riskDetail as { plannedRR?: number; effectiveMinRR?: number } | undefined;
      // Nested reasons from the risk manager
      if (innerReason === "rr_below_minimum") {
        const rr = riskDetail?.plannedRR ?? decision?.plannedRR ?? 0;
        return {
          text: pick(seed, [
            `Saw a setup but the reward's too thin — ${rr.toFixed(1)}:1. Want at least 2:1. Passing.`,
            `Sweep was clean but the target's too close. ${rr.toFixed(1)}:1 isn't worth it.`,
            `Tempting, but the reward side doesn't pay. ${rr.toFixed(1)}:1. No.`,
          ]),
          mood: "interested",
          subtext: proposal ? `${proposal.side} @ ${price(proposal.entryPrice)}` : undefined,
        };
      }
      if (innerReason === "level_rank_below_minimum") {
        return {
          text: "Level wasn't strong enough for me. Ignoring.",
          mood: "interested",
        };
      }
      if (innerReason === "max_concurrent_positions_reached") {
        return { text: "Already full on positions. Not adding more.", mood: "watching" };
      }
      if (innerReason === "below_min_order_size") {
        return {
          text: "Setup looked good but the position is too small for this pair. Your portfolio can't trade this market at this scale.",
          mood: "interested",
          subtext: proposal ? `${proposal.side} @ ${price(proposal.entryPrice)}` : undefined,
        };
      }
      if (innerReason === "position_exceeds_capital") {
        return {
          text: "Stop is too tight — the calculated position is bigger than my whole account. Skipping.",
          mood: "interested",
        };
      }
      if (innerReason === "daily_drawdown_breached") {
        return {
          text: "Down for the day — bot's halting itself. Come back tomorrow.",
          mood: "halted",
        };
      }
      if (innerReason === "weekly_drawdown_breached") {
        return {
          text: "Down for the week. Stopping. Review on Sunday.",
          mood: "halted",
        };
      }
      if (innerReason === "regime_suppresses_entries") {
        return { text: "Regime says no entries. Watching only.", mood: "idle" };
      }
      if (innerReason === "invalid_stop_distance") {
        return { text: "Couldn't size the trade — stop distance was off. Passing.", mood: "watching" };
      }
      if (innerReason === "regime_size_multiplier_zero") {
        return { text: "Regime has me at zero size. Not trading.", mood: "idle" };
      }
      return {
        text: `Risk manager said no (${innerReason || "unknown"}). Passing.`,
        mood: "watching",
      };
    }

    // Unknown skip
    return { text: `Skipped — ${topReason || "no reason given"}.`, mood: "idle" };
  }

  // Unknown type
  return { text: row.reasoning ?? row.decisionType, mood: "idle" };
}

// ---------- formatting helpers ----------

function money(n: number): string {
  const abs = Math.abs(n);
  const formatted = `$${abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return n < 0 ? `-${formatted}` : `+${formatted}`;
}

function price(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Stable pick based on a hash of the row id — same row always renders the
// same sentence, but variants are distributed across rows.
function pick<T>(seed: number, options: T[]): T {
  return options[seed % options.length];
}

function prettyRegime(r: string): string {
  const map: Record<string, string> = {
    no_trade: "NO TRADE",
    ranging: "Ranging",
    trending: "Trending",
    breakout: "Breakout",
    high_volatility: "High Volatility",
    low_liquidity: "Low Liquidity",
    accumulation_distribution: "Accumulation/Distribution",
  };
  return map[r] ?? r;
}

function hashSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}
