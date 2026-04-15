// Braid page — Phase 1 visual checkpoint.
// Renders BTCUSDT Daily × 200 candles with detected levels and pools.
// Below the canvas: the three analysis admin panels.
// Per the plan: this is the "first visual proof that pool detection is sensible".

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { LeftFrameCanvas } from "@/components/braid/LeftFrameCanvas";
import { LevelPanel } from "@/components/braid/LevelPanel";
import { ValidationPanel } from "@/components/braid/ValidationPanel";
import { ScoringPanel } from "@/components/braid/ScoringPanel";
import type { AnalysisStateClient } from "@/components/braid/types";

// Tiny localStorage-backed useState. Reads on init, writes on change.
// Silent on quota or parse errors — never blocks the page.
function usePersistedState<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) return JSON.parse(stored) as T;
    } catch {
      // ignore corrupt JSON / disabled storage
    }
    return defaultValue;
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore quota errors
    }
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

export default function Braid() {
  const [symbol, setSymbol] = usePersistedState("zenny.braid.symbol", "BTCUSDT");
  const [timeframe, setTimeframe] = usePersistedState(
    "zenny.braid.timeframe",
    "D",
  );
  const [count, setCount] = usePersistedState("zenny.braid.count", 200);
  const [chartType, setChartType] = usePersistedState<"candles" | "line">(
    "zenny.braid.chartType",
    "candles",
  );
  // Target structural point count for line-chart simplification, stored
  // per-TF so switching timeframes remembers the count you tuned for each.
  // Defaults come from the 2026-04-15 visual-validation pass across 6 TFs.
  const [targetPointsByTf, setTargetPointsByTf] = usePersistedState<
    Record<string, number>
  >("zenny.braid.targetPointsByTf", {
    M: 40,
    W: 25,
    D: 30,
    "4H": 25,
    "1H": 25,
    "15m": 30,
  });
  const targetPoints = targetPointsByTf[timeframe] ?? 15;
  const setTargetPoints = (v: number) =>
    setTargetPointsByTf({ ...targetPointsByTf, [timeframe]: v });
  const [showCurrentTf, setShowCurrentTf] = usePersistedState(
    "zenny.braid.showCurrentTf",
    true,
  );
  const [showOtherTfs, setShowOtherTfs] = usePersistedState(
    "zenny.braid.showOtherTfs",
    true,
  );
  const [showPools, setShowPools] = usePersistedState(
    "zenny.braid.showPools",
    true,
  );

  const queryKey = `/api/zenny/braid-view-model?symbol=${symbol}&timeframe=${timeframe}&count=${count}`;
  const { data, isLoading, isFetching, error, refetch } =
    useQuery<AnalysisStateClient>({
      queryKey: [queryKey],
    });

  return (
    <div className="min-h-screen bg-[#f8f7f4] text-[#3d3d3a]">
      {/* Top bar */}
      <header className="border-b border-black/10 px-6 py-3 flex items-center justify-between bg-white">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-medium">Zenny Braid</h1>
          <span className="text-xs text-[#888780]">Phase 1 visual checkpoint</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-[#888780]">Symbol</span>
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              className="border border-black/15 rounded px-2 py-1 w-24 bg-white"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="text-[#888780]">TF</span>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="border border-black/15 rounded px-2 py-1 bg-white"
            >
              {TIMEFRAMES.map((tf) => (
                <option key={tf.value} value={tf.value}>
                  {tf.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-[#888780]">Count</span>
            <input
              type="number"
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value, 10) || 200)}
              min={50}
              max={1500}
              step={50}
              className="border border-black/15 rounded px-2 py-1 w-20 bg-white"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="text-[#888780]">Chart</span>
            <select
              value={chartType}
              onChange={(e) =>
                setChartType(e.target.value as "candles" | "line")
              }
              className="border border-black/15 rounded px-2 py-1 bg-white"
            >
              <option value="candles">Candles</option>
              <option value="line">Line</option>
            </select>
          </label>
          {chartType === "line" && (
            <label className="flex items-center gap-2">
              <span className="text-[#888780]">Points</span>
              <input
                type="number"
                min={4}
                max={50}
                step={1}
                value={targetPoints}
                onChange={(e) =>
                  setTargetPoints(parseInt(e.target.value, 10) || 15)
                }
                className="border border-black/15 rounded px-2 py-1 w-16 bg-white tabular-nums"
              />
            </label>
          )}
          <label className="flex items-center gap-1.5 text-[#3d3d3a]">
            <input
              type="checkbox"
              checked={showCurrentTf}
              onChange={(e) => setShowCurrentTf(e.target.checked)}
            />
            <span>Current TF</span>
          </label>
          <label className="flex items-center gap-1.5 text-[#3d3d3a]">
            <input
              type="checkbox"
              checked={showOtherTfs}
              onChange={(e) => setShowOtherTfs(e.target.checked)}
            />
            <span>Higher TFs</span>
          </label>
          <label className="flex items-center gap-1.5 text-[#3d3d3a]">
            <input
              type="checkbox"
              checked={showPools}
              onChange={(e) => setShowPools(e.target.checked)}
            />
            <span>Pools</span>
          </label>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className={`border rounded px-3 py-1 transition-colors min-w-[88px] ${
              isFetching
                ? "border-black/10 bg-[#f1efe8] text-[#888780] cursor-wait"
                : "border-black/15 hover:bg-[#f1efe8]"
            }`}
          >
            {isFetching ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      <main className="p-6 space-y-6">
        {/* Canvas */}
        <section className="bg-white border border-black/10 rounded-lg overflow-hidden">
          {isLoading && (
            <div className="p-8 text-center text-[#888780]">Fetching {symbol} {timeframe} × {count} from Binance…</div>
          )}
          {error !== null && error !== undefined && (
            <div className="p-8 text-center text-red-600">
              Failed to load: {(error as Error).message}
            </div>
          )}
          {data && (
            <LeftFrameCanvas
              state={data}
              chartType={chartType}
              targetPoints={targetPoints}
              showCurrentTf={showCurrentTf}
              showOtherTfs={showOtherTfs}
              showPools={showPools}
            />
          )}
        </section>

        {/* Stats summary */}
        {data && (
          <section className="bg-white border border-black/10 rounded-lg p-4">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-sm">
              <Stat label="Candles" value={data.candles.length.toString()} />
              <Stat label="Levels" value={data.levels.length.toString()} />
              <Stat
                label="Pools alive"
                value={data.pools.filter((p) => p.status === "active").length.toString()}
              />
              <Stat
                label="Pools taken"
                value={data.pools.filter((p) => p.status === "dead").length.toString()}
              />
              <Stat
                label="TFs analysed"
                value={data.analysedTimeframes.join("/")}
              />
              <Stat
                label="Latest close"
                value={
                  data.candles.length
                    ? "$" + data.candles[data.candles.length - 1].close.toLocaleString()
                    : "—"
                }
              />
            </div>
          </section>
        )}

        {/* Three admin panels */}
        {data && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <LevelPanel state={data} />
            <ValidationPanel state={data} />
            <ScoringPanel state={data} />
          </div>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-[#888780] uppercase tracking-wide">{label}</div>
      <div className="text-lg font-medium">{value}</div>
    </div>
  );
}
