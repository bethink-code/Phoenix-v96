// Admin Panel 2 — Pool Validation.
// Shows every level that entered validation, with pass/fail per criterion.

import type { AnalysisStateClient } from "./types";

interface Props {
  state: AnalysisStateClient;
}

export function ValidationPanel({ state }: Props) {
  const validationFailed = state.rejectedCandidates.filter(
    (r) => r.reason === "validation_failed",
  );
  const passedCount = state.pools.length;

  return (
    <div className="bg-white border border-black/10 rounded-lg overflow-hidden">
      <header className="px-4 py-2 border-b border-black/10 flex items-center justify-between">
        <h3 className="text-sm font-medium">Panel 2 · Validation</h3>
        <span className="text-xs text-[#888780]">
          {passedCount} pass · {validationFailed.length} rejected
        </span>
      </header>
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-xs">
          <thead className="text-[#888780] sticky top-0 bg-white">
            <tr>
              <th className="text-left px-3 py-2">Price</th>
              <th className="text-left px-3 py-2">Side</th>
              <th className="text-right px-3 py-2">Result</th>
              <th className="text-right px-3 py-2">Reasons</th>
            </tr>
          </thead>
          <tbody>
            {state.pools.map((p) => (
              <tr key={p.id} className="border-t border-black/5">
                <td className="px-3 py-1.5 font-mono">{formatPrice(p.centreLine)}</td>
                <td className="px-3 py-1.5">
                  <span className={p.type === "RESISTANCE" ? "text-[#A32D2D]" : "text-[#0F6E56]"}>
                    {p.type === "RESISTANCE" ? "RES" : "SUP"}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-right text-[#0F6E56] font-medium">PASS</td>
                <td className="px-3 py-1.5 text-right text-[#888780]">—</td>
              </tr>
            ))}
            {validationFailed.map((r, i) => (
              <tr key={`rej-${i}`} className="border-t border-black/5 bg-red-50/30">
                <td className="px-3 py-1.5 font-mono">{formatPrice(r.candidatePrice)}</td>
                <td className="px-3 py-1.5">
                  <span className={r.side === "RESISTANCE" ? "text-[#A32D2D]" : "text-[#0F6E56]"}>
                    {r.side === "RESISTANCE" ? "RES" : "SUP"}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-right text-[#A32D2D] font-medium">REJECT</td>
                <td className="px-3 py-1.5 text-right text-[#888780] truncate max-w-[140px]" title={r.failureReasons.join(" · ")}>
                  {r.failureReasons[0]}
                </td>
              </tr>
            ))}
            {state.pools.length === 0 && validationFailed.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-[#888780]">
                  no candidates evaluated
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
