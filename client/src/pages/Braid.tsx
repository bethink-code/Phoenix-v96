// Braid page — Phase 1 visual checkpoint.
// Renders BTCUSDT Daily × 200 candles with detected levels and pools.
// Below the canvas: the three analysis admin panels.
// Per the plan: this is the "first visual proof that pool detection is sensible".

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LeftFrameCanvas } from "@/components/braid/LeftFrameCanvas";
import { LevelPanel } from "@/components/braid/LevelPanel";
import { ValidationPanel } from "@/components/braid/ValidationPanel";
import { ScoringPanel } from "@/components/braid/ScoringPanel";
import type { AnalysisStateClient } from "@/components/braid/types";

const TIMEFRAMES: Array<{ value: string; label: string }> = [
  { value: "D", label: "Daily" },
  { value: "12H", label: "12 H" },
  { value: "4H", label: "4 H" },
  { value: "1H", label: "1 H" },
  { value: "15m", label: "15 m" },
];

export default function Braid() {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [timeframe, setTimeframe] = useState("D");
  const [count, setCount] = useState(200);

  const queryKey = `/api/zenny/braid-view-model?symbol=${symbol}&timeframe=${timeframe}&count=${count}`;
  const { data, isLoading, error, refetch } = useQuery<AnalysisStateClient>({
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
          <button
            onClick={() => refetch()}
            className="border border-black/15 rounded px-3 py-1 hover:bg-[#f1efe8] transition-colors"
          >
            Refresh
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
            <LeftFrameCanvas state={data} />
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
              <Stat label="Rejected" value={data.rejectedCandidates.length.toString()} />
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
