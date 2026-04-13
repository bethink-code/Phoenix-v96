// Admin Panel 1 — Level Identification.
// Lists every detected level. Some graduate to pools; most don't.

import type { AnalysisStateClient } from "./types";

interface Props {
  state: AnalysisStateClient;
}

export function LevelPanel({ state }: Props) {
  const sorted = [...state.levels].sort((a, b) => b.price - a.price);
  const graduated = state.levels.filter((l) => l.graduatedToPoolId !== null).length;

  return (
    <div className="bg-white border border-black/10 rounded-lg overflow-hidden">
      <header className="px-4 py-2 border-b border-black/10 flex items-center justify-between">
        <h3 className="text-sm font-medium">Panel 1 · Levels</h3>
        <span className="text-xs text-[#888780]">
          {state.levels.length} total · {graduated} → pools
        </span>
      </header>
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-xs">
          <thead className="text-[#888780] sticky top-0 bg-white">
            <tr>
              <th className="text-left px-3 py-2">Price</th>
              <th className="text-left px-3 py-2">Side</th>
              <th className="text-right px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((l) => (
              <tr key={l.id} className="border-t border-black/5">
                <td className="px-3 py-1.5 font-mono">{formatPrice(l.price)}</td>
                <td className="px-3 py-1.5">
                  <span
                    className={
                      l.side === "RESISTANCE"
                        ? "text-[#A32D2D]"
                        : "text-[#0F6E56]"
                    }
                  >
                    {l.side === "RESISTANCE" ? "RES" : "SUP"}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-right">
                  {l.graduatedToPoolId !== null ? (
                    <span className="text-[#0F6E56] font-medium">POOL →</span>
                  ) : (
                    <span className="text-[#888780]">level</span>
                  )}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-center text-[#888780]">
                  no levels detected
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatPrice(p: number): string {
  return "$" + p.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
