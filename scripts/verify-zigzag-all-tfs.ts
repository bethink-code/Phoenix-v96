// One-shot: run findZigZagLevels against real Binance data for all 6 TFs
// and print the vertices. Lets me sanity-check each TF's threshold before
// the user refreshes. Delete after use.

import { findZigZagLevels } from "../server/modules/zenny/analysis/level/findZigZagLevels";
import type { Candle } from "../shared/zennyTypes";

const TFS: Array<{ tf: string; interval: string; reversalPct: number }> = [
  { tf: "M", interval: "1M", reversalPct: 0.4 },
  { tf: "W", interval: "1w", reversalPct: 0.25 },
  { tf: "D", interval: "1d", reversalPct: 0.12 },
  { tf: "4H", interval: "4h", reversalPct: 0.03 },
  { tf: "1H", interval: "1h", reversalPct: 0.02 },
  { tf: "15m", interval: "15m", reversalPct: 0.01 },
];

async function fetchCandles(interval: string, limit: number): Promise<Candle[]> {
  const res = await fetch(
    `https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=${interval}&limit=${limit}`,
  );
  const raw = (await res.json()) as Array<
    [number, string, string, string, string, string, number, ...unknown[]]
  >;
  return raw.map((k) => ({
    openTime: k[0],
    closeTime: k[6],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

function fmtDate(ms: number, tf: string): string {
  const d = new Date(ms);
  const iso = d.toISOString();
  if (tf === "M" || tf === "W" || tf === "D") return iso.slice(0, 10);
  return iso.slice(0, 16).replace("T", " ");
}

function fmtPrice(n: number): string {
  if (n >= 1000) return "$" + n.toFixed(0).padStart(8, " ");
  return "$" + n.toFixed(2).padStart(8, " ");
}

async function runTf(config: { tf: string; interval: string; reversalPct: number }) {
  const limit = config.tf === "M" ? 80 : 300;
  const candles = await fetchCandles(config.interval, limit);
  const levels = findZigZagLevels({
    candles,
    reversalPct: config.reversalPct,
  });

  const firstDate = fmtDate(candles[0].openTime, config.tf);
  const lastDate = fmtDate(candles[candles.length - 1].openTime, config.tf);
  const lastClose = candles[candles.length - 1].close;

  console.log(
    `\n=== ${config.tf} (${Math.round(config.reversalPct * 100)}% threshold) — ${candles.length} candles, ${firstDate} → ${lastDate}, last $${lastClose.toFixed(2)} ===`,
  );
  console.log(`  ${levels.length} vertices:`);
  for (const l of levels) {
    const date = fmtDate(l.candleOpenTime, config.tf);
    const t = l.type === "swing_high" ? "HIGH" : "LOW ";
    console.log(
      `    #${l.index.toString().padStart(3, " ")} ${date} ${t} ${fmtPrice(l.price)}`,
    );
  }
}

async function main() {
  for (const cfg of TFS) {
    await runTf(cfg);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
