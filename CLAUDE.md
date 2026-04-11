# Phoenix v96 — Claude project guide

Multi-tenant crypto liquidity-sweep trading bot. Built per `Scratch/crypto_trading_bot_PRD.pdf`.

## Stack
- React 18 + Vite + Tailwind + shadcn-style UI (hand-rolled, no CLI)
- Express + TypeScript (tsx dev, esbuild prod bundle to `api/index.mjs`)
- Drizzle ORM + Neon PostgreSQL
- Google OAuth (invite-only) + connect-pg-simple sessions
- Vercel (static frontend + serverless API)
- Doppler for secrets — **no .env file anywhere**

## Commands
```bash
npm run dev         # doppler-wrapped; server on 5000, client on 5173
npm run db:push     # apply schema to the linked Neon branch
npm run build       # vite build
npm run build:api   # esbuild bundle to api/index.mjs
```
After any server-side change: `npm run build:api` and commit `api/index.mjs`.

## Secrets
Managed by Doppler. `npm run dev` auto-injects via `doppler run`.
Prod temporary access: `doppler run --config prd -- <command>`.
Never create a `.env` file in this project.

## Import conventions
- **Server** files import with relative paths (`../shared/schema`), NOT `@shared` aliases.
- **Client** files can use `@/` and `@shared/` aliases.

## Architecture — PRD mapping
PRD §4 defines five layers. Implementation status:

| Layer | File | Status |
|---|---|---|
| L0 Regime Engine | `server/modules/regimeEngine.ts` | ✅ all 7 profiles, pure fns |
| L1 Risk Manager | `server/modules/riskManager.ts` | ✅ `assessTrade()` pure fn, no DB |
| L2 Temporal Filter | `server/modules/temporalFilter.ts` | ✅ session/day gating |
| L3 Strategy Engine | — | ⬜ Phase 1 (level ID, sweep detection) |
| L4 Visual Interface | `client/src/pages/Dashboard.tsx` | ◐ skeleton — regime selector, risk panel, emergency exit |

Other PRD modules:
- `server/modules/emergencyExit.ts` — PRD §7.2 fire extinguisher. Phase 0 stub — no real exchange calls yet.
- `server/modules/paperTrading.ts` — PRD Rule 4 hard gate. Global via env + per-tenant flag.
- `server/modules/whatsapp.ts` — PRD §3.5 tiered alerts. Twilio stub.
- `server/modules/backtestEngine.ts` — PRD §11.4 scriptable, isolated. Real bar-by-bar replay that reuses live strategy + risk functions; emits rejection diagnostics. Used by Dashboard Diagnostic tab and (Phase 3) the Sunday agent loop.
- `server/cryptoUtil.ts` — AES-256-GCM for tenant exchange keys (PRD §12.3).

## Database
Schema lives in `shared/schema.ts`. Key tables:
- `users`, `sessions`, `invited_users`, `access_requests`, `audit_logs` — baseline auth + admin.
- `tenants`, `tenant_configs` — one per user; regime + risk config (PRD §12.1).
- `exchange_keys` — encrypted at rest.
- `market_pairs` — admin-curated registry (PRD §13).
- `trades`, `bot_decisions`, `risk_events`, `regime_changes` — full audit trail for PRD §7.4 MUSTs.
- `experiment_runs`, `llm_usage` — Backtest Sundays + usage metering (PRD §11, §12.6).

## Guiding principles (from PRD §2 — non-negotiable)
1. **Risk management is immutable.** Never override `riskManager.assessTrade()` at runtime.
2. **Start small.** Design for a small initial allocation.
3. **Trading capital separate from holdings.** Dedicated sub-account.
4. **Testnet first.** `PAPER_TRADING_MODE` must remain `true` until the decision log is reviewed.
5. **No gambling.** Every position has entry + stop + target before the order is placed.
6. **Weekly engagement rhythm.** Any UI that encourages intraday checking has failed.
7. **Tenant isolation is absolute.** Every query filters by `tenantId`.

## Engagement rules (PRD §3) — UI constraints
- Default view is the **weekly summary**, not a live blotter.
- No auto-refreshing ticker on the home screen.
- "Bot operating normally. Next review: Sunday." is a successful interface state.
- Regime change requires confirmation with plain-language consequences.
- Emergency market exit: two taps max from any screen.

## Autoresearch harness (`autoresearch/`)

Karpathy-style autonomous research loop. Single editable file the agent
edits + a fixed prepare step + a markdown skill. Local-only — does NOT
run in production. The "agent" is whatever coding agent you point at the
project (Claude Code, Codex CLI, etc.).

- `autoresearch/program.md` — instructions the agent reads. Verbatim
  Karpathy structure, adapted to Phoenix domain.
- `autoresearch/prepare.ts` — one-time candle fetch + disk cache to
  `~/.cache/phoenix-autoresearch/`. Read-only, agent never edits.
- `autoresearch/train.ts` — **the single editable file.** PARAMS section
  at top, evaluation pipeline below, score output at bottom in the exact
  grep-friendly format program.md specifies.
- `autoresearch/results.tsv` — agent-written experiment log. Gitignored.
- `autoresearch/run.log` — captured stdout from each train run. Gitignored.

Workflow: `npm run autoresearch:prepare -- CRVUSDT 1h 1000` once, then
open the agent in this directory and prompt it to read program.md.
Each iteration is a git commit on a branch like `autoresearch/<tag>`.

The harness reuses the same `runBacktest` engine the deployed Experiments
UI uses, so the score is consistent across both surfaces.

## Not yet built (Phase 1+)
- Strategy engine (level identification, sweep detection, entry/exit logic)
- Real exchange adapters (Binance / Bybit) — currently stubbed
- Bot runner process (process-per-tenant isolation per PRD §12.4)
- Coinglass liquidation heatmap integration
- WhatsApp Business API Twilio wiring (templates pre-approved)
- Backtest Sundays agent loop (engine exists; the autonomous experiment loop + Sunday review UI are Phase 3)
- Stripe billing (Phase 2)
- Mobile / copy trading (never — Phase 1 out of scope)

## Windows quirks
- `npx tsx server/index.ts` — single run, NOT `tsx watch` (Windows infinite-restart bug).
- `wait-on tcp:5000` gates Vite until Express is ready.
- `DATABASE_URL` must have `&channel_binding=require` stripped (`pg` driver hangs otherwise). `server/db.ts` strips it defensively.
