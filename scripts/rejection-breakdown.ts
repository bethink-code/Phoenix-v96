import { db } from "../server/db";
import { autoresearchSessions, autoresearchIterations } from "../shared/schema";
import { desc, eq } from "drizzle-orm";

async function main() {
  const [session] = await db
    .select()
    .from(autoresearchSessions)
    .orderBy(desc(autoresearchSessions.startedAt))
    .limit(1);
  if (!session) {
    console.log("no sessions");
    return;
  }
  console.log(
    "Session:",
    session.id,
    "status:",
    session.status,
    "iterations:",
    session.iterationsRun
  );

  const its = await db
    .select()
    .from(autoresearchIterations)
    .where(eq(autoresearchIterations.sessionId, session.id));
  console.log("Total iterations:", its.length);

  const profitable = its
    .filter((i) => i.trades > 0 && Number(i.netPnl) > 0)
    .sort((a, b) => Number(b.netPnl) - Number(a.netPnl));
  console.log("Profitable iterations:", profitable.length);

  if (profitable.length > 0) {
    const best = profitable[0];
    console.log("\nBEST iteration #" + best.idx + ":");
    console.log("  trades:", best.trades, "netPnl:", best.netPnl, "score:", best.score);
    console.log("  barsEvaluated:", best.barsEvaluated, "entriesTaken:", best.entriesTaken);
    console.log("  rejection top:", JSON.stringify(best.rejectionTop, null, 2));
  }

  // Aggregate rejections across all iterations
  const agg: Record<string, number> = {};
  for (const it of its) {
    if (!it.rejectionTop) continue;
    for (const [k, v] of Object.entries(it.rejectionTop as Record<string, number>)) {
      agg[k] = (agg[k] ?? 0) + v;
    }
  }
  const sorted = Object.entries(agg).sort((a, b) => b[1] - a[1]);
  console.log("\nAGGREGATE rejection reasons across all iterations:");
  let total = 0;
  for (const [, v] of sorted) total += v;
  for (const [k, v] of sorted) {
    const pct = ((v / total) * 100).toFixed(1);
    console.log(`  ${k}: ${v} (${pct}%)`);
  }
  console.log("  TOTAL:", total);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
