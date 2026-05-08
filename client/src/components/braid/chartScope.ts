// Chart scope — the architectural model for how the main braid chart
// changes content based on which NOW column is expanded.
//
// MODEL:
//   - main window      = the Braid page
//   - main braid view  = LeftFrameCanvas (the chart)
//   - default scope    = no column expanded → operator's manually-configured view
//   - scoped views     = one column expanded → chart strips down to that column's
//                        relevant signals, hides everything else
//
// Each scoped view answers a single question:
//   REGIME  → "what pattern, with what evidence, over time?"
//             show: candles + price wire + regime strip
//             hide: pools, levels, level tags, multi-TF context
//   LEVELS  → "what structural support/resistance is in play?"
//             show: candles + price wire + levels + tags + light pool context
//             hide: regime strip
//   ORDERS  → "what's currently in the book / planned?"   (not yet implemented)
//             show: candles + price wire + active order lines
//             hide: pools, levels, regime
//   TRADES  → "what trades have been taken on this chart?"   (not yet implemented)
//             show: candles + price wire + trade markers
//             hide: pools, levels, regime
//
// The default scope honours whatever Settings toggles the operator has set.
// Scoped views OVERRIDE those toggles for the duration the column is open.
//
// Single-expansion: only one column is expanded at any time. Opening a
// new column closes any other. Keeps the scope unambiguous.
//
// Pure module — no React, no DOM, no side effects. Just types + a
// resolver. The Braid page derives the scope from `expandedTab` state
// and passes the resolved view to LeftFrameCanvas.

export type ChartScope =
  | "default"
  | "regime"
  | "levels"
  | "orders"
  | "trades";

// The single source of truth for what the chart renders. Every
// subsystem the chart can show appears here as a boolean. The chart
// reads ONLY from this bundle — no other independent toggles.
export interface ChartViewProps {
  // Always-on geometry (kept as fields for symmetry; effectively true
  // unless explicitly turned off by a future scope).
  showCandles: boolean;
  // Per-TF level / pool visibility — manual toggles in the default
  // scope, overridden when a scope is active.
  showCurrentTf: boolean;
  showOtherTfs: boolean;
  showPools: boolean;
  showSweptPools: boolean;
  showDeadPools: boolean;
  // Level lines + tags — when off, no level decoration is drawn.
  showLevels: boolean;
  // Regime overlay — top-edge strip coloured by recommended playbook.
  showRegimeStrip: boolean;
}

// Per-scope override map. Each scope spells out exactly what's shown.
// Adding a new scope = adding one entry here. The chart doesn't need
// to know what scopes exist — it just renders from the resolved bundle.
const SCOPE_PRESETS: Record<Exclude<ChartScope, "default">, ChartViewProps> = {
  // REGIME — chart focused on regime/playbook timeline.
  regime: {
    showCandles: true,
    showCurrentTf: false,
    showOtherTfs: false,
    showPools: false,
    showSweptPools: false,
    showDeadPools: false,
    showLevels: false,
    showRegimeStrip: true,
  },
  // LEVELS — chart focused on structural lines and pool zones.
  levels: {
    showCandles: true,
    showCurrentTf: true,
    showOtherTfs: true,
    showPools: true,
    showSweptPools: false,
    showDeadPools: false,
    showLevels: true,
    showRegimeStrip: false,
  },
  // ORDERS — chart focused on active orders. Order rendering is not
  // yet implemented; the scope hides everything else so when orders
  // land they slot in cleanly.
  orders: {
    showCandles: true,
    showCurrentTf: false,
    showOtherTfs: false,
    showPools: false,
    showSweptPools: false,
    showDeadPools: false,
    showLevels: false,
    showRegimeStrip: false,
  },
  // TRADES — chart focused on completed trade markers. Same caveat as
  // orders — trade-marker rendering is not yet implemented.
  trades: {
    showCandles: true,
    showCurrentTf: false,
    showOtherTfs: false,
    showPools: false,
    showSweptPools: false,
    showDeadPools: false,
    showLevels: false,
    showRegimeStrip: false,
  },
};

// Resolve a (scope, default-view) pair into the final view bundle the
// chart renders from. In the default scope, the operator's manual
// toggles (Settings panel) are honoured as-is. In a scoped view, the
// preset overrides the manual toggles entirely — the chart shows
// only what the scope's question needs.
export function resolveChartView(
  scope: ChartScope,
  defaultView: ChartViewProps,
): ChartViewProps {
  if (scope === "default") return defaultView;
  return SCOPE_PRESETS[scope];
}
