// Debug why the Daily ZigZag at 12% threshold misses the 2025 ATH.
// Prints the raw close series and walks the algorithm manually.
import { findZigZagLevels } from "../server/modules/zenny/analysis/level/findZigZagLevels";
import type { Candle } from "../shared/zennyTypes";

async function main() {
  const res = await fetch(
    "https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1d&limit=300",
  );
  const raw = (await res.json()) as Array<
    [number, string, string, string, string, string, number, ...unknown[]]
  >;
  const candles: Candle[] = raw.map((k) => ({
    openTime: k[0],
    closeTime: k[6],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));

  // Print the first 60 days + key points
  console.log("First 60 Daily closes:");
  for (let i = 0; i < 60; i++) {
    const date = new Date(candles[i].openTime).toISOString().slice(0, 10);
    console.log(`  #${i.toString().padStart(3, " ")} ${date} close $${candles[i].close.toFixed(0).padStart(7, " ")}`);
  }

  // Find the daily ATH close
  let maxIdx = 0;
  let maxClose = candles[0].close;
  for (let i = 0; i < candles.length; i++) {
    if (candles[i].close > maxClose) {
      maxClose = candles[i].close;
      maxIdx = i;
    }
  }
  const maxDate = new Date(candles[maxIdx].openTime).toISOString().slice(0, 10);
  console.log(`\nDaily ATH close: #${maxIdx} ${maxDate} $${maxClose.toFixed(0)}`);

  // Find the daily low close
  let minIdx = 0;
  let minClose = candles[0].close;
  for (let i = 0; i < candles.length; i++) {
    if (candles[i].close < minClose) {
      minClose = candles[i].close;
      minIdx = i;
    }
  }
  const minDate = new Date(candles[minIdx].openTime).toISOString().slice(0, 10);
  console.log(`Daily lowest close: #${minIdx} ${minDate} $${minClose.toFixed(0)}`);

  const levels = findZigZagLevels({ candles, reversalPct: 0.12 });
  console.log(`\n=== 12% threshold: ${levels.length} vertices ===`);
  for (const l of levels) {
    const date = new Date(l.candleOpenTime).toISOString().slice(0, 10);
    const t = l.type === "swing_high" ? "HIGH" : "LOW ";
    console.log(`  #${l.index.toString().padStart(3, " ")} ${date} ${t} $${l.price.toFixed(0).padStart(7, " ")}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
