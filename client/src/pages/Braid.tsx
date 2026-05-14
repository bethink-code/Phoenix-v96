// Braid page — PAST | NOW | TRADING layout.
// PAST: LeftFrameCanvas (chart with candles, levels, pools)
// NOW: Four expandable columns (Regime, Levels, Orders, Trades)
// TRADING: future — two branch panels for pre-placed orders

import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { LeftFrameCanvas } from "@/components/braid/LeftFrameCanvas";
import { NowColumn } from "@/components/braid/NowColumn";
import { LevelsColumnCollapsed, LevelsColumnExpanded } from "@/components/braid/LevelsColumn";
import { NowBadgeCollapsed, NowBadgeExpanded } from "@/components/braid/NowBadge";
import { OrderFlowColumn } from "@/components/braid/OrderFlowColumn";
import {
  OrdersStrategyColumnCollapsed,
  OrdersStrategyColumnExpanded,
} from "@/components/braid/OrdersStrategyColumn";
import { RightFrameCanvas } from "@/components/braid/RightFrameCanvas";
import { TradesColumnCollapsed, TradesColumnExpanded } from "@/components/braid/TradesColumn";
import { LiqOverlay } from "@/components/braid/LiqOverlay";
import { TradeOverlay } from "@/components/braid/TradeOverlay";
import { ColumnInnerTabs } from "@/components/braid/ColumnInnerTabs";
import { LevelsSettingsPanel } from "@/components/braid/LevelsSettingsPanel";
import { PassPlayground } from "@/components/braid/PassPlayground";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import type {
  AnalysisStateClient,
  PassConfigClient,
} from "@/components/braid/types";
import {
  getDefaultPassConfigForTimeframeClient,
} from "@/components/braid/types";
import { computePriceRange, CHART_PAD } from "@/components/braid/chartGeometry";
import {
  resolveChartView,
  type ChartScope,
  type ChartViewProps,
} from "@/components/braid/chartScope";
import type { Timeframe } from "@shared/zennyTypes";
import {
  DEFAULT_BRAID_COUNT,
  DEFAULT_BRAID_TIMEFRAME,
  DEFAULT_PASS_CONFIG,
  getDefaultBraidCountForTimeframe,
} from "@shared/zennyBraidDefaults";

const LEGACY_DEFAULT_PASS_CONFIG: PassConfigClient = {
  recency: {
    enabled: true,
    curve: "linear",
    halfLifeCandles: 50,
    threshold: 0.2,
  },
  touchCount: {
    enabled: true,
    lookforwardCandles: 0,
    tolerancePct: 0.002,
  },
  lastLeg: {
    enabled: true,
    reversalPct: 0.015,
    tolerancePct: 0.005,
    lastN: 3,
  },
  polarityFlip: {
    enabled: true,
  },
  aggregate: {
    enabled: true,
    weightRecency: 0.3,
    weightLastLeg: 0.4,
    weightTouchCount: 0.3,
    brokenPenalty: 0.3,
    strengthThreshold: 0,
  },
  wireAngle: {
    enabled: true,
    lookbackCandles: 14,
    dwellBarsRequired: 3,
    volNormalisationK: 1,
  },
};

function usePersistedState<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) return JSON.parse(stored) as T;
    } catch { /* ignore */ }
    return defaultValue;
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  }, [key, value]);
  return [value, setValue] as const;
}

const TIMEFRAMES: Array<{ value: string; label: string }> = [
  { value: "M", label: "Monthly" },
  { value: "W", label: "Weekly" },
  { value: "D", label: "Daily" },
  { value: "4H", label: "4 H" },
  { value: "1H", label: "1 H" },
  { value: "15m", label: "15 m" },
];

const VIEW_LABEL: Record<ChartScope, string> = {
  default: "DEFAULT",
  regime: "REGIME",
  levels: "LEVELS",
  orders: "ORDERS",
  trades: "TRADES",
};

export default function Braid() {
  const { user } = useAuth();
  const [symbol, setSymbol] = usePersistedState("zenny.braid.symbol", "BTCUSDT");
  const [timeframe, setTimeframe] = usePersistedState<Timeframe>("zenny.braid.timeframe", DEFAULT_BRAID_TIMEFRAME);
  const [count, setCount] = usePersistedState("zenny.braid.count", DEFAULT_BRAID_COUNT);
  const [chartType, setChartType] = usePersistedState<"candles" | "line">("zenny.braid.chartType", "candles");
  const [targetPointsByTf, setTargetPointsByTf] = usePersistedState<Record<string, number>>(
    "zenny.braid.targetPointsByTf",
    { M: 40, W: 25, D: 30, "4H": 25, "1H": 25, "15m": 30 },
  );
  const targetPoints = targetPointsByTf[timeframe] ?? 15;
  const setTargetPoints = (v: number) => setTargetPointsByTf({ ...targetPointsByTf, [timeframe]: v });
  const [showCurrentTf, setShowCurrentTf] = usePersistedState("zenny.braid.showCurrentTf", true);
  const [showOtherTfs, setShowOtherTfs] = usePersistedState("zenny.braid.showOtherTfs", true);
  const [showPools, setShowPools] = usePersistedState("zenny.braid.showPools", true);
  const [showSweptPools, setShowSweptPools] = usePersistedState("zenny.braid.showSweptPools", false);
  const [showDeadPools, setShowDeadPools] = usePersistedState("zenny.braid.showDeadPools", false);
  const [showTradingAreas, setShowTradingAreas] = usePersistedState(
    "zenny.braid.showTradingAreas",
    false,
  );
  const [showSwingMarkers, setShowSwingMarkers] = usePersistedState("zenny.braid.showSwingMarkers", false);
  const [maxLevelsPerSide, setMaxLevelsPerSide] = usePersistedState("zenny.braid.maxLevelsPerSide", 0);
  const [rightFrameCandleCount, setRightFrameCandleCount] = usePersistedState(
    "zenny.braid.rightFrameCandleCount",
    25,
  );
  const [showLiqHeatmap, setShowLiqHeatmap] = usePersistedState("zenny.braid.showLiqHeatmap", true);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [lastTickSummary, setLastTickSummary] = useState<string | null>(null);

  // NOW column expand state — single source of truth. Only ONE column can
  // be expanded at a time; opening another collapses the current one. This
  // keeps the chart's scope unambiguous — the chart mirrors whichever
  // column is open, scoped to that column's purpose.
  const [expandedTab, setExpandedTab] = useState<ChartScope>("default");
  const toggleTab = (tab: Exclude<ChartScope, "default">) => {
    setExpandedTab((prev) => (prev === tab ? "default" : tab));
  };
  const regimeExpanded = expandedTab === "regime";
  const levelsExpanded = expandedTab === "levels";
  const ordersExpanded = expandedTab === "orders";
  const tradesExpanded = expandedTab === "trades";

  // Default chart view — built from the operator's manual Settings toggles.
  // When no column is expanded, this is what the chart renders. When a
  // column expands, its scoped preset overrides this entirely.
  const defaultChartView: ChartViewProps = {
    showCandles: true,
    monochromeCandles: false,
    showCurrentTf,
    showOtherTfs,
    showPools,
    showSweptPools,
    showDeadPools,
    showLevels: true,
    showRegimeStrip: false,
    showOrderPlans: showTradingAreas,
    showPaperTrades: showTradingAreas,
  };
  const chartView = resolveChartView(expandedTab, defaultChartView);

  // Liq overlay (separate from column expand)
  const [liqOverlayOpen, setLiqOverlayOpen] = useState(false);
  const [decayFactor, setDecayFactor] = usePersistedState("zenny.braid.decayFactor", 0.7);

  // Pass playground — multi-pass annotations on each level (recency,
  // touchCount, lastLeg, …). Persisted so a refresh keeps your tuning state.
  // Merge with default so older localStorage values (saved before a new
  // pass was added) get their missing slots filled in rather than crashing
  // the server when a pass tries to read its config.
  const [storedPassConfig, setStoredPassConfig] =
    usePersistedState<PassConfigClient>(
      "zenny.braid.passConfig",
      DEFAULT_PASS_CONFIG,
    );
  const defaultPassConfig = getDefaultPassConfigForTimeframeClient(timeframe);
  const defaultCount = getDefaultBraidCountForTimeframe(timeframe);
  const previousTimeframeRef = useRef<Timeframe>(timeframe);

  useEffect(() => {
    try {
      const storedTimeframe = localStorage.getItem("zenny.braid.timeframe");
      if (storedTimeframe === JSON.stringify("D")) {
        setTimeframe(DEFAULT_BRAID_TIMEFRAME);
      }
      const storedCount = localStorage.getItem("zenny.braid.count");
      if (storedCount === JSON.stringify(200)) {
        setCount(DEFAULT_BRAID_COUNT);
      }
      const storedConfig = localStorage.getItem("zenny.braid.passConfig");
      if (
        storedConfig !== null &&
        configsEqual(JSON.parse(storedConfig), LEGACY_DEFAULT_PASS_CONFIG)
      ) {
        setStoredPassConfig(DEFAULT_PASS_CONFIG);
      }
    } catch {
      // Ignore migration failures; the normal persisted/default state still works.
    }
  }, [setCount, setStoredPassConfig, setTimeframe]);

  useEffect(() => {
    const previousTimeframe = previousTimeframeRef.current;
    if (previousTimeframe === timeframe) return;

    const previousDefaultConfig =
      getDefaultPassConfigForTimeframeClient(previousTimeframe);
    const nextDefaultConfig = getDefaultPassConfigForTimeframeClient(timeframe);
    if (configsEqual(storedPassConfig, previousDefaultConfig)) {
      setStoredPassConfig(nextDefaultConfig);
    }

    const previousDefaultCount =
      getDefaultBraidCountForTimeframe(previousTimeframe);
    const nextDefaultCount = getDefaultBraidCountForTimeframe(timeframe);
    if (count === previousDefaultCount) {
      setCount(nextDefaultCount);
    }

    previousTimeframeRef.current = timeframe;
  }, [count, setCount, setStoredPassConfig, storedPassConfig, timeframe]);

  const passConfig: PassConfigClient = {
    recency: {
      ...defaultPassConfig.recency,
      ...(storedPassConfig.recency ?? {}),
    },
    touchCount: {
      ...defaultPassConfig.touchCount,
      ...(storedPassConfig.touchCount ?? {}),
    },
    lastLeg: {
      ...defaultPassConfig.lastLeg,
      ...(storedPassConfig.lastLeg ?? {}),
    },
    polarityFlip: {
      ...defaultPassConfig.polarityFlip,
      ...(storedPassConfig.polarityFlip ?? {}),
    },
    aggregate: {
      ...defaultPassConfig.aggregate,
      ...(storedPassConfig.aggregate ?? {}),
    },
    wireAngle: {
      ...defaultPassConfig.wireAngle,
      ...(storedPassConfig.wireAngle ?? {}),
    },
  };
  const setPassConfig = setStoredPassConfig;
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Chart height: fill viewport minus header (~52px) and stats bar (~36px)
  const [chartHeight, setChartHeight] = useState(Math.max(400, window.innerHeight - 90));
  useEffect(() => {
    const onResize = () => setChartHeight(Math.max(400, window.innerHeight - 90));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const passConfigParam = encodeURIComponent(JSON.stringify(passConfig));
  const queryKey = `/api/zenny/braid-view-model?symbol=${symbol}&timeframe=${timeframe}&count=${count}&passConfig=${passConfigParam}&refresh=${refreshNonce}`;
  const { data, isLoading, isFetching, error } = useQuery<AnalysisStateClient>({
    queryKey: [queryKey],
  });

  const logout = async () => {
    try {
      await apiRequest("/auth/logout", { method: "POST" });
    } catch {
      /* still force navigation even if the call fails */
    }
    window.location.href = "/";
  };

  const runPaperTick = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("/api/zenny/dev/paper-trade-tick", {
        method: "POST",
      });
      return r.json();
    },
    onSuccess: (payload: any) => {
      const results: any[] = Array.isArray(payload?.results) ? payload.results : [];
      const created = results.filter((r: any) => r?.newPositionId).length;
      const transitions = results.reduce(
        (n: number, r: any) => n + (Array.isArray(r?.transitions) ? r.transitions.length : 0),
        0,
      );
      const blocked = results
        .map((r: any) => r?.noTransitionReason)
        .filter((v: any): v is string => typeof v === "string");
      setLastTickSummary(
        created > 0
          ? `Paper tick: ${created} new ${created === 1 ? "position" : "positions"}`
          : transitions > 0
            ? `Paper tick: ${transitions} state ${transitions === 1 ? "change" : "changes"}`
            : blocked.length > 0
              ? `Paper tick: ${blocked[0]}`
              : "Paper tick complete",
      );
      setRefreshNonce((n) => n + 1);
    },
    onError: (err) => {
      setLastTickSummary(
        err instanceof Error ? `Paper tick failed: ${err.message}` : "Paper tick failed",
      );
    },
  });

  const coin = symbol.replace(/USDT$/i, "").toLowerCase();
  const { data: liqData, isFetching: liqFetching } = useQuery<{ levels: Array<{ barTime: number; side: "long" | "short"; tier: number; price: number }> }>({
    queryKey: [`/api/hyblock/liq-levels?coin=${coin}&startTime=0&endTime=9999999999999`],
    enabled: !!data,
  });

  // Single source of truth: chartGeometry.computePriceRange
  const { priceMin, priceMax, priceRange } = data
    ? computePriceRange(data.candles)
    : { priceMin: 0, priceMax: 0, priceRange: 0 };

  // Mark price Y — last candle close, same toY as chart
  const lastClose = data?.candles.length ? data.candles[data.candles.length - 1].close : 0;
  const plotH = chartHeight - CHART_PAD.t - CHART_PAD.b;
  const markPriceY = priceRange > 0
    ? CHART_PAD.t + plotH * (1 - (lastClose - priceMin) / priceRange)
    : undefined;
  const showOrdersLiqOverlay =
    ordersExpanded && showLiqHeatmap && liqOverlayOpen;
  const tradingViewFlag =
    chartView.showOrderPlans && chartView.showPaperTrades
      ? "Trading"
      : chartView.showOrderPlans
        ? "Orders"
        : chartView.showPaperTrades
          ? "Trades"
          : null;
  const activeViewFlags = [
    chartView.showCurrentTf ? "TF" : null,
    chartView.showOtherTfs ? "Higher" : null,
    chartView.showPools ? "Pools" : null,
    chartView.showPools && chartView.showSweptPools ? "Swept" : null,
    chartView.showPools && chartView.showDeadPools ? "Dead" : null,
    chartView.showRegimeStrip ? "Regime" : null,
    tradingViewFlag,
    showOrdersLiqOverlay ? "Liq" : null,
  ].filter(Boolean);
  const activeViewLabel = VIEW_LABEL[expandedTab];
  const settingsButtonLabel =
    expandedTab === "default" ? "Settings" : "Default view";
  const settingsButtonTitle =
    expandedTab === "default"
      ? "Open default chart settings"
      : "Open settings for the default home view";
  const primaryPlans =
    data?.tradePlanResult?.plansPerTimeframe?.[data.primaryTimeframe] ?? [];
  const paperPositions = data?.paperPositions ?? [];
  const paperOpenPositions = data?.paperOpenPositions ?? [];
  const paperRestingOrders = paperOpenPositions.filter(
    (pos) => pos.fillPrice == null && pos.filledAtBarTs == null,
  );
  const paperFilledPositions = paperPositions.filter(
    (pos) => pos.fillPrice != null || pos.filledAtBarTs != null,
  );
  const paperOpenTrades = paperOpenPositions.filter(
    (pos) => pos.fillPrice != null || pos.filledAtBarTs != null,
  );

  const viewSettings = (
    <div className="space-y-3 border-b border-black/5 pb-3">
      <SettingsGroup title="Market">
        <label className="grid grid-cols-[88px_1fr] items-center gap-2 text-xs">
          <span className="text-[#888780]">Candles</span>
          <input
            type="number"
            value={count}
            onChange={(e) =>
              setCount(parseInt(e.target.value, 10) || defaultCount)
            }
            min={50}
            max={1500}
            step={50}
            className="border border-black/15 rounded px-2 py-1 bg-white text-sm"
          />
        </label>
      </SettingsGroup>

      <SettingsGroup title="Chart">
        <label className="grid grid-cols-[88px_1fr] items-center gap-2 text-xs">
          <span className="text-[#888780]">Style</span>
          <select
            value={chartType}
            onChange={(e) =>
              setChartType(e.target.value as "candles" | "line")
            }
            className="border border-black/15 rounded px-2 py-1 bg-white text-sm"
          >
            <option value="candles">Candles</option>
            <option value="line">Line</option>
          </select>
        </label>
        {chartType === "line" && (
          <label className="grid grid-cols-[88px_1fr] items-center gap-2 text-xs">
            <span className="text-[#888780]">Line points</span>
            <input
              type="number"
              min={4}
              max={50}
              step={1}
              value={targetPoints}
              onChange={(e) =>
                setTargetPoints(parseInt(e.target.value, 10) || 15)
              }
              className="border border-black/15 rounded px-2 py-1 bg-white text-sm tabular-nums"
            />
          </label>
        )}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <ToggleSetting
            label="Current TF"
            checked={showCurrentTf}
            onChange={setShowCurrentTf}
          />
          <ToggleSetting
            label="Higher TFs"
            checked={showOtherTfs}
            onChange={setShowOtherTfs}
          />
          <ToggleSetting
            label="Pools"
            checked={showPools}
            onChange={setShowPools}
          />
          <ToggleSetting
            label="Swept"
            checked={showSweptPools}
            onChange={setShowSweptPools}
            disabled={!showPools}
          />
          <ToggleSetting
            label="Dead"
            checked={showDeadPools}
            onChange={setShowDeadPools}
            disabled={!showPools}
          />
          <ToggleSetting
            label="Trading areas"
            checked={showTradingAreas}
            onChange={setShowTradingAreas}
          />
          <ToggleSetting
            label="Liq levels"
            checked={showLiqHeatmap}
            onChange={setShowLiqHeatmap}
          />
          <ToggleSetting
            label="Pivot marks"
            checked={showSwingMarkers}
            onChange={setShowSwingMarkers}
          />
        </div>
        <label className="grid grid-cols-[88px_1fr] items-center gap-2 text-xs">
          <span className="text-[#888780]">Max levels</span>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={20}
              step={1}
              value={maxLevelsPerSide}
              onChange={(e) =>
                setMaxLevelsPerSide(parseInt(e.target.value, 10) || 0)
              }
              className="flex-1"
            />
            <span className="w-12 tabular-nums text-[#888780]">
              {maxLevelsPerSide === 0 ? "all" : `${maxLevelsPerSide}/side`}
            </span>
          </div>
        </label>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div />
        </div>
        {showLiqHeatmap && (
          <label className="grid grid-cols-[88px_1fr] items-center gap-2 text-xs">
            <span className="text-[#888780]">Liq decay</span>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={decayFactor}
                onChange={(e) => setDecayFactor(parseFloat(e.target.value))}
                className="flex-1"
              />
              <span className="w-8 tabular-nums text-[#888780]">
                {decayFactor.toFixed(2)}
              </span>
            </div>
          </label>
        )}
      </SettingsGroup>
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-[#f8f7f4] text-[#3d3d3a] overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-black/10 px-4 py-2 flex items-center justify-between bg-white">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-medium">Zenny Braid</h1>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            className="border border-black/15 rounded px-2 py-0.5 w-24 bg-white text-sm"
            aria-label="Trading pair"
          />
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as Timeframe)}
            className="border border-black/15 rounded px-2 py-0.5 bg-white text-sm"
            aria-label="Timeframe"
          >
            {TIMEFRAMES.map((tf) => (
              <option key={tf.value} value={tf.value}>
                {tf.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <div className="hidden md:flex items-center gap-2 text-xs text-[#888780]">
            <span>{count} candles</span>
            <span>{chartType}</span>
            <span>{activeViewLabel}</span>
            {activeViewFlags.length > 0 && (
              <span>{activeViewFlags.join(" / ")}</span>
            )}
            {liqFetching && <span title="Loading Hyblock liq levels">Liq ...</span>}
            {!liqFetching && liqData?.levels && liqData.levels.length > 0 && (() => {
              const latestMs = liqData.levels.reduce((m, l) => Math.max(m, l.barTime), 0);
              const ageDays = Math.floor((Date.now() - latestMs) / 86400000);
              return (
                <span
                  style={{ color: ageDays >= 1 ? "#c97a2c" : "#888780" }}
                  title={`Hyblock liq cutoff: ${new Date(latestMs).toISOString().slice(0, 10)}`}
                >
                  Liq {ageDays}d
                </span>
              );
            })()}
            {lastTickSummary && (
              <span className="max-w-[260px] truncate" title={lastTickSummary}>
                {lastTickSummary}
              </span>
            )}
          </div>
          {data && (
            <StaleBadge
              computedAtMs={data.computedAtMs}
              hasDepth={!!data.depth}
              hasCandles={data.candles.length > 0}
            />
          )}
          <button
            onClick={() => setSettingsOpen(!settingsOpen)}
            className={`border rounded px-2 py-0.5 text-sm transition-colors ${settingsOpen ? "border-[#3d3d3a] bg-[#3d3d3a] text-white" : "border-black/15 hover:bg-[#f1efe8]"}`}
            title={settingsButtonTitle}
          >
            {settingsButtonLabel}
          </button>
          {import.meta.env.DEV && (
            <button
              onClick={() => runPaperTick.mutate()}
              disabled={runPaperTick.isPending}
              className={`border rounded px-2 py-0.5 text-sm transition-colors ${runPaperTick.isPending ? "border-black/10 bg-[#f1efe8] text-[#888780] cursor-wait" : "border-black/15 hover:bg-[#f1efe8]"}`}
              title="Advance the local paper-trading runner and refresh this chart"
            >
              {runPaperTick.isPending ? "Ticking..." : "Paper tick"}
            </button>
          )}
          <button
            onClick={() => setRefreshNonce((n) => n + 1)}
            disabled={isFetching}
            className={`border rounded px-2 py-0.5 text-sm transition-colors ${isFetching ? "border-black/10 bg-[#f1efe8] text-[#888780] cursor-wait" : "border-black/15 hover:bg-[#f1efe8]"}`}
          >
            {isFetching ? "..." : "Refresh"}
          </button>
          {user?.isAdmin && (
            <Link href="/admin">
              <button
                className="border rounded px-2 py-0.5 text-sm transition-colors border-black/15 hover:bg-[#f1efe8]"
                title="Open admin console"
              >
                Admin
              </button>
            </Link>
          )}
          <button
            onClick={logout}
            className="border rounded px-2 py-0.5 text-sm transition-colors border-black/15 hover:bg-[#f1efe8]"
            title="Sign out"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main chart area — fills remaining height */}
      <div className="flex-1 flex overflow-hidden">
        {isLoading && (
          <div className="flex-1 flex items-center justify-center text-[#888780]">
            Fetching {symbol} {timeframe} x {count}...
          </div>
        )}
        {error && (
          <div className="flex-1 flex items-center justify-center text-red-600">
            {(error as Error).message}
          </div>
        )}
        {data && data.candles.length > 0 && (
          <>
            {/* PAST — chart */}
            <div className="flex-1 min-w-0 relative">
              <LeftFrameCanvas
                state={data}
                chartType={chartType}
                monochromeCandles={chartView.monochromeCandles}
                targetPoints={targetPoints}
                showCurrentTf={chartView.showCurrentTf}
                showOtherTfs={chartView.showOtherTfs}
                showPools={chartView.showPools}
                showSweptPools={chartView.showSweptPools}
                showDeadPools={chartView.showDeadPools}
                showLevels={chartView.showLevels}
                showSwingMarkers={showSwingMarkers}
                maxLevelsPerSide={maxLevelsPerSide}
                showRegimeStrip={chartView.showRegimeStrip}
                height={chartHeight}
                strengthThreshold={
                  passConfig.aggregate.enabled
                    ? passConfig.aggregate.strengthThreshold
                    : 0
                }
              />
              {showOrdersLiqOverlay && (
                <LiqOverlay
                  symbol={symbol}
                  candles={data.candles}
                  chartWidth={800}
                  chartHeight={chartHeight}
                  priceMin={priceMin}
                  priceMax={priceMax}
                  padLeft={CHART_PAD.l}
                  padRight={CHART_PAD.r}
                  padTop={CHART_PAD.t}
                  padBottom={CHART_PAD.b}
                  decayFactor={decayFactor}
                  onClose={() => setLiqOverlayOpen(false)}
                />
              )}
              {/* Trade overlay — probable TradePlans + actual paper positions.
                  Always on (trades are the point of the system). */}
              <TradeOverlay
                candles={data.candles}
                plans={chartView.showOrderPlans ? primaryPlans : []}
                positions={chartView.showPaperTrades ? paperFilledPositions : []}
                priceMin={priceMin}
                priceMax={priceMax}
                padLeft={CHART_PAD.l}
                padRight={CHART_PAD.r}
                padTop={CHART_PAD.t}
                padBottom={CHART_PAD.b}
              />
              {/* Decay slider — pinned bottom-left when overlay is open */}
              {showOrdersLiqOverlay && (
                <div className="absolute bottom-2 left-16 flex items-center gap-2 bg-white/90 rounded px-3 py-1 border border-black/10 z-20">
                  <span className="text-[#888780] text-xs">Decay</span>
                  <input type="range" min={0} max={1} step={0.05} value={decayFactor}
                    onChange={(e) => setDecayFactor(parseFloat(e.target.value))} className="w-32" />
                  <span className="text-xs text-[#888780] w-8 tabular-nums">{decayFactor.toFixed(2)}</span>
                </div>
              )}
            </div>

            {/* NOW — four expandable columns */}
            <NowColumn
              label="REGIME"
              expanded={regimeExpanded}
              onToggle={() => toggleTab("regime")}
              chartHeight={chartHeight}
              markPriceY={markPriceY}
              collapsedContent={
                <NowBadgeCollapsed
                  result={data.passInfo?.wireAngle ?? null}
                  assessment={data.regimeAssessment ?? null}
                  primaryTf={data.primaryTimeframe}
                  chartHeight={chartHeight}
                />
              }
              expandedContent={
                <ColumnInnerTabs
                  info={
                    <NowBadgeExpanded
                      result={data.passInfo?.wireAngle ?? null}
                      assessment={data.regimeAssessment ?? null}
                      primaryTf={data.primaryTimeframe}
                      chartHeight={chartHeight}
                    />
                  }
                  settings={
                    <div className="text-xs text-[#888780] p-2">
                      Regime tunables (wire-angle thresholds, per-playbook
                      composite weights) — coming soon.
                    </div>
                  }
                />
              }
            />
            <NowColumn
              label="LEVELS"
              expanded={levelsExpanded}
              onToggle={() => toggleTab("levels")}
              chartHeight={chartHeight}
              markPriceY={markPriceY}
              collapsedContent={
                <LevelsColumnCollapsed
                  levels={data.levels}
                  primaryTimeframe={timeframe}
                  chartHeight={chartHeight}
                  priceMin={priceMin}
                  priceMax={priceMax}
                  padTop={CHART_PAD.t}
                  padBottom={CHART_PAD.b}
                />
              }
              expandedContent={
                <ColumnInnerTabs
                  info={
                    <LevelsColumnExpanded
                      levels={data.levels}
                      primaryTimeframe={timeframe}
                    />
                  }
                  settings={
                    <LevelsSettingsPanel
                      showPools={showPools}
                      setShowPools={setShowPools}
                      showSweptPools={showSweptPools}
                      setShowSweptPools={setShowSweptPools}
                      showDeadPools={showDeadPools}
                      setShowDeadPools={setShowDeadPools}
                      showCurrentTf={showCurrentTf}
                      setShowCurrentTf={setShowCurrentTf}
                      showOtherTfs={showOtherTfs}
                      setShowOtherTfs={setShowOtherTfs}
                      showSwingMarkers={showSwingMarkers}
                      setShowSwingMarkers={setShowSwingMarkers}
                      maxLevelsPerSide={maxLevelsPerSide}
                      setMaxLevelsPerSide={setMaxLevelsPerSide}
                    />
                  }
                />
              }
            />
            <NowColumn
              label="ORDERS"
              expanded={ordersExpanded}
              markPriceY={markPriceY}
              onToggle={() => toggleTab("orders")}
              chartHeight={chartHeight}
              collapsedContent={
                <OrdersStrategyColumnCollapsed
                  tradePlan={data.tradePlan}
                  tradePlans={primaryPlans}
                  restingOrders={paperRestingOrders}
                  assessment={data.regimeAssessment}
                  chartHeight={chartHeight}
                />
              }
              expandedContent={
                <ColumnInnerTabs
                  info={
                    <OrdersStrategyColumnExpanded
                      tradePlan={data.tradePlan}
                      tradePlans={primaryPlans}
                      restingOrders={paperRestingOrders}
                      assessment={data.regimeAssessment}
                      chartHeight={chartHeight}
                    />
                  }
                  settings={
                    <div className="text-xs text-[#888780] p-2 space-y-3">
                      <div className="space-y-2">
                        <div className="text-[11px] font-medium uppercase tracking-wide text-[#888780]">
                          Chart context
                        </div>
                        <ToggleSetting
                          label="Liq context"
                          checked={liqOverlayOpen}
                          onChange={setLiqOverlayOpen}
                          disabled={!showLiqHeatmap}
                        />
                        {!showLiqHeatmap && (
                          <div>
                            Turn on Liq levels in the default-view settings to
                            make this available.
                          </div>
                        )}
                      </div>
                      <div>
                        Decision-module tunables (entry-style matrix, REACH
                        asymmetry, slippage, kill-switch thresholds) — coming
                        soon.
                      </div>
                      <div>
                        Defaults are research-backed in code; see
                        memory/zenny_paper_testing_schedule.md for the W1-W6,
                        E1-E10, R1-R7 alternatives.
                      </div>
                    </div>
                  }
                />
              }
            />
            <NowColumn
              label="TRADES"
              expanded={tradesExpanded}
              onToggle={() => toggleTab("trades")}
              chartHeight={chartHeight}
              markPriceY={markPriceY}
              collapsedContent={
                <TradesColumnCollapsed
                  chartHeight={chartHeight}
                  openPositions={paperOpenTrades}
                />
              }
              expandedContent={
                <ColumnInnerTabs
                  info={
                    <TradesColumnExpanded
                      positions={paperFilledPositions}
                      openPositions={paperOpenTrades}
                    />
                  }
                  settings={
                    <div className="text-xs text-[#888780] p-2">
                      Paper-account settings (starting equity, kill-switch
                      thresholds, max-bars-in-trade) — coming soon.
                    </div>
                  }
                />
              }
            />
            {/* TRADING — right-frame canvas with the two-wire braid.
                Each panel has its own focused Y scale (NOT the left frame's
                full price range) so the arms breathe even when both are
                close to current price. */}
            <RightFrameCanvas
              arms={data.arms}
              candles={data.candles}
              chartHeight={chartHeight}
              width={280}
              contextCandleCount={rightFrameCandleCount}
              onChangeContextCandleCount={setRightFrameCandleCount}
            />
            {settingsOpen && (
              <PassPlayground
                config={passConfig}
                defaultConfig={defaultPassConfig}
                viewSettings={viewSettings}
                onChange={setPassConfig}
                onClose={() => setSettingsOpen(false)}
              />
            )}
          </>
        )}
      </div>

      {/* Stats bar — compact strip at the bottom */}
      {data && (
        <div className="flex-shrink-0 border-t border-black/10 bg-white px-4 py-1 flex items-center gap-6 text-xs text-[#888780]">
          <span>{data.candles.length} candles</span>
          <span>{data.levels.filter((l) => !l.broken).length} levels</span>
          <span>
            {data.pools.filter((p) => p.status === "active").length} live pools
          </span>
          <span>
            {data.pools.filter((p) => p.status === "swept").length} swept
          </span>
          <span>TFs: {data.analysedTimeframes.join("/")}</span>
          <span className="ml-auto text-[#3d3d3a] font-medium">
            {data.candles.length > 0 && `$${data.candles[data.candles.length - 1].close.toLocaleString()}`}
          </span>
        </div>
      )}
    </div>
  );
}

function configsEqual(a: unknown, b: PassConfigClient): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function SettingsGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-black/10 rounded p-2 bg-[#fbfaf6] space-y-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-[#888780]">
        {title}
      </div>
      {children}
    </section>
  );
}

function ToggleSetting({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-center gap-2 rounded border border-black/10 bg-white px-2 py-1 ${
        disabled ? "opacity-45" : ""
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

// Expanded content for the Orders/Order Flow column
function OrderFlowExpandedContent({
  orderFlow,
  liqLevels,
  candles,
  priceMin,
  priceMax,
}: {
  orderFlow: AnalysisStateClient["orderFlow"];
  liqLevels?: Array<{ price: number; side: "long" | "short"; tier: number }>;
  candles: AnalysisStateClient["candles"];
  priceMin: number;
  priceMax: number;
}) {
  const currentPrice = candles.length > 0 ? candles[candles.length - 1].close : 0;

  return (
    <div style={{ fontSize: 11, color: "#3d3d3a" }}>
      {orderFlow?.oi && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Open Interest</div>
          <div>Value: ${(orderFlow.oi.valueUsd / 1e9).toFixed(2)}B</div>
          {orderFlow.oi.change24hPct != null && (
            <div style={{ color: orderFlow.oi.change24hPct >= 0 ? "#1d9e75" : "#e24b4a" }}>
              24h: {orderFlow.oi.change24hPct >= 0 ? "+" : ""}{orderFlow.oi.change24hPct.toFixed(1)}%
            </div>
          )}
        </div>
      )}
      {orderFlow?.funding && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Funding Rate</div>
          <div style={{ color: orderFlow.funding.rate > 0 ? "#1d9e75" : "#e24b4a" }}>
            {(orderFlow.funding.rate * 100).toFixed(4)}% ({orderFlow.funding.annualizedPct.toFixed(1)}% ann.)
          </div>
          <div style={{ color: "#888780" }}>Mark: ${orderFlow.funding.markPrice.toLocaleString()}</div>
        </div>
      )}
      {orderFlow?.longShort && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Long/Short Ratio</div>
          <div>{orderFlow.longShort.ratio.toFixed(2)} ({(orderFlow.longShort.longPct * 100).toFixed(0)}% L / {(orderFlow.longShort.shortPct * 100).toFixed(0)}% S)</div>
          <div className="flex mt-1" style={{ height: 6, borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${orderFlow.longShort.longPct * 100}%`, background: "rgba(29,158,117,0.6)" }} />
            <div style={{ width: `${orderFlow.longShort.shortPct * 100}%`, background: "rgba(226,75,74,0.6)" }} />
          </div>
        </div>
      )}
      {liqLevels && liqLevels.length > 0 && (
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Nearest Liq Levels</div>
          <div style={{ fontSize: 10, color: "#888780", marginBottom: 4 }}>
            Closest unconsumed levels to ${currentPrice.toLocaleString()}
          </div>
          {getNearestLevels(liqLevels, currentPrice, priceMin, priceMax).map((l, i) => (
            <div key={i} className="flex justify-between" style={{ padding: "1px 0", color: l.side === "long" ? "#1d9e75" : "#e24b4a" }}>
              <span>{l.side === "long" ? "Long" : "Short"} T{l.tier}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>${l.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              <span style={{ color: "#888780" }}>{((Math.abs(l.price - currentPrice) / currentPrice) * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function getNearestLevels(
  levels: Array<{ price: number; side: "long" | "short"; tier: number }>,
  currentPrice: number,
  priceMin: number,
  priceMax: number,
) {
  const valid = levels.filter((l) => {
    if (l.price < priceMin || l.price > priceMax) return false;
    if (l.side === "long" && l.price > currentPrice) return false;
    if (l.side === "short" && l.price < currentPrice) return false;
    return true;
  });
  return valid
    .sort((a, b) => Math.abs(a.price - currentPrice) - Math.abs(b.price - currentPrice))
    .slice(0, 10);
}

function StaleBadge({ computedAtMs, hasDepth, hasCandles }: { computedAtMs: number; hasDepth: boolean; hasCandles: boolean }) {
  const ageMs = Date.now() - computedAtMs;
  const ageSec = Math.floor(ageMs / 1000);
  const ageMin = Math.floor(ageSec / 60);

  const isStale = ageSec > 120;
  const isMissing = !hasDepth || !hasCandles;

  if (isMissing) {
    return (
      <span
        className="px-1.5 py-0.5 rounded text-xs font-medium"
        style={{ background: "#e24b4a20", color: "#e24b4a", border: "1px solid #e24b4a40" }}
        title={!hasCandles ? "No candle data — server may need restart" : "Depth data unavailable — server may need restart"}
      >
        {!hasCandles ? "NO DATA" : "NO DEPTH"}
      </span>
    );
  }

  if (isStale) {
    return (
      <span
        className="px-1.5 py-0.5 rounded text-xs"
        style={{ background: "#d4a01720", color: "#d4a017", border: "1px solid #d4a01740" }}
        title={`Data is ${ageMin}m old`}
      >
        {ageMin}m ago
      </span>
    );
  }

  return (
    <span
      className="px-1.5 py-0.5 rounded text-xs"
      style={{ background: "#1d9e7520", color: "#1d9e75", border: "1px solid #1d9e7540" }}
      title="Data is current"
    >
      LIVE
    </span>
  );
}
