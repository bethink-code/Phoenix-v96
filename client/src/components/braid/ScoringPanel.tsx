// Admin Panel 3 — Pool Scoring.
// Shows every validated pool with its 7-component score breakdown and total.

import type { AnalysisStateClient } from "./types";

interface Props {
  state: AnalysisStateClient;
}

export function ScoringPanel({ state }: Props) {
  const sorted = [...state.pools].sort(
    (a, b) => b.scoreBreakdown.total - a.scoreBreakdown.total,
  );

  return (
    <div className="bg-white border border-black/10 rounded-lg overflow-hidden">
      <header className="px-4 py-2 border-b border-black/10 flex items-center justify-between">
        <h3 className="text-sm font-medium">Panel 3 · Scoring</h3>
        <span className="text-xs text-[#888780]">
          {sorted.length} valid · threshold ≥ 60
        </span>
      </header>
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-xs">
          <thead className="text-[#888780] sticky top-0 bg-white">
            <tr>
              <th className="text-left px-3 py-2">Price</th>
              <th className="text-right px-2 py-2" title="Freshness /25">F</th>
              <th className="text-right px-2 py-2" title="Departure /20">D</th>
              <th className="text-right px-2 py-2" title="Volume /15">V</th>
              <th className="text-right px-2 py-2" title="Touch quality ±5">T</th>
              <th className="text-right px-3 py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const tier = p.scoreBreakdown.total >= 75 ? "rich" : "valid";
              return (
                <tr key={p.id} className="border-t border-black/5">
                  <td className="px-3 py-1.5 font-mono">
                    <span className={p.type === "RESISTANCE" ? "text-[#A32D2D]" : "text-[#0F6E56]"}>
                      {formatPrice(p.centreLine)}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right">{p.scoreBreakdown.freshness}</td>
                  <td className="px-2 py-1.5 text-right">{p.scoreBreakdown.departure}</td>
                  <td className="px-2 py-1.5 text-right">{p.scoreBreakdown.volume}</td>
                  <td className="px-2 py-1.5 text-right">{p.scoreBreakdown.touchQuality}</td>
                  <td className="px-3 py-1.5 text-right font-medium">
                    <span className={tier === "rich" ? "text-[#0F6E56]" : "text-[#3d3d3a]"}>
                      {p.scoreBreakdown.total}
                    </span>
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-[#888780]">
                  no valid pools
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <footer className="px-3 py-2 border-t border-black/10 text-[10px] text-[#888780]">
        F = freshness · D = departure · V = volume · T = touch quality.
        Depth, liquidation, and TF confluence are stubbed in Phase 1.
      </footer>
    </div>
  );
}

function formatPrice(p: number): string {
  return "$" + p.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
