# phoenix-autoresearch

This is the agent harness for autonomous research on the Phoenix v96 trading
strategy. It is structurally identical to Andrej Karpathy's `autoresearch`
repo (single editable file, single metric, fixed loop, TSV log) — adapted to
TypeScript and the Phoenix backtest engine.

You are an autonomous research agent. Your job is to find a configuration
where the strategy meets the human's stated goal (e.g. "make CRV trade at
least once per day, profitably"). You do this by repeatedly editing
`autoresearch/train.ts`, running it, and keeping the changes that improve
the score.

## Setup

To set up a new experiment, work with the user to:

1. **Agree on a run tag**: propose a tag based on today's date and the
   target pair (e.g. `crv-apr11`). The branch `autoresearch/<tag>` must not
   already exist — this is a fresh run.
2. **Create the branch**: `git checkout -b autoresearch/<tag>` from the
   current main.
3. **Read the in-scope files**: The harness is small. Read these for full
   context:
   - `autoresearch/program.md` — this file.
   - `autoresearch/prepare.ts` — fixed data prep. Do not modify.
   - `autoresearch/train.ts` — **the file you modify.** Params at the top,
     evaluation pipeline below.
   - `server/modules/strategy/levels.ts`, `sweeps.ts`, `entries.ts` —
     read-only context. The strategy primitives the backtest uses. Do
     NOT edit these files; if you want to vary their behaviour, do it via
     the config objects in `train.ts`.
   - `server/modules/backtestEngine.ts` — read-only context. The replay
     engine `train.ts` calls.
4. **Verify data exists**: Check that
   `~/.cache/phoenix-autoresearch/<SYMBOL>_<TIMEFRAME>_<LIMIT>.json` exists
   for the dataset configured in `train.ts`. If not, tell the human to
   run: `npm run autoresearch:prepare -- <SYMBOL> <TIMEFRAME> <LIMIT>`.
   Example: `npm run autoresearch:prepare -- CRVUSDT 1h 1000`
5. **Initialize results.tsv**: Create `autoresearch/results.tsv` with just
   the header row. The baseline will be recorded after the first run.
6. **Confirm and go**: Confirm setup looks good with the human.

Once you get confirmation, kick off the experimentation.

## Experimentation

Each experiment runs locally. The training script is fast (typically 1–3
seconds for 1000 bars) — there is no fixed wall-clock budget like in
Karpathy's version. Just run, read, decide, repeat.

You launch it with: `npm run autoresearch:train > autoresearch/run.log 2>&1`

**What you CAN do:**
- Modify `autoresearch/train.ts` — this is the only file you edit.
  Everything in the PARAMS section is fair game: regime, risk params,
  level config, sweep config, target distance multiplier, dataset
  selection, warmup bars.
- Add new fields to the PARAMS section if you want to expose more
  internal config from the strategy modules. The backtest engine accepts
  `levelConfig`, `sweepConfig`, and `proposalConfig` already.

**What you CANNOT do:**
- Modify `autoresearch/prepare.ts`. Read-only — fixed evaluation data.
- Modify the strategy modules (`server/modules/strategy/*`). They are the
  ground-truth implementation the live bot uses. If a hypothesis requires
  changing strategy code, **do not implement it** — instead, log it as a
  recommendation in the description column of results.tsv with a `defer`
  status. The human will decide whether to harden the change into the
  codebase.
- Modify `runBacktest` in `server/modules/backtestEngine.ts`. Same reason.
- Install new packages or add dependencies. Use what's already in
  `package.json`.

**The goal:** maximize the `score` metric, subject to the human's stated
constraint (e.g. "must open at least 1 trade per day"). Score is computed
in train.ts itself — read it there to understand how it's defined.

**Simplicity criterion**: All else being equal, simpler is better. A small
score improvement that complicates train.ts is not worth it. Removing a
deviation from defaults and getting equal or better results is a great
outcome. Weigh complexity against improvement magnitude.

**The first run**: Your very first run should always be to establish the
baseline — run the script as-is, no edits. Record it in results.tsv as
the baseline.

## Output format

After each run, train.ts prints a summary block. Extract the headline
metric with:

```
grep "^score:" autoresearch/run.log
```

Full output looks like:

```
---
score:            0.842100
trades:           14
wins:             8
losses:           6
win_rate:         0.5714
net_pnl:          312.40
max_drawdown_pct: 4.20
bars_evaluated:   872
entries_taken:    14
total_seconds:    1.8
---
rejection_breakdown:
  no_proposal: 858
  no_sweep: 0
  no_levels: 0
```

The rejection breakdown is gold — read it to understand WHY a config
rejected the bars it rejected, and use that to pick your next hypothesis.

## Logging results

When an experiment is done, log it to `autoresearch/results.tsv` (tab-separated,
NOT comma-separated — commas break in descriptions).

The TSV has a header row and 7 columns:

```
commit	score	trades	win_rate	net_pnl	status	description
```

1. git commit hash (short, 7 chars)
2. score (e.g. 0.842100) — use 0.000000 for crashes or zero-trade variants
3. trades count (integer)
4. win rate as decimal (e.g. 0.5714)
5. net pnl (e.g. 312.40)
6. status: `keep`, `discard`, `crash`, or `defer` (defer = "interesting
   but requires strategy code change, escalating to human")
7. short description of what this experiment tried (use spaces, NEVER tabs)

Example:

```
commit	score	trades	win_rate	net_pnl	status	description
a1b2c3d	0.000000	0	0.0000	0.00	keep	baseline
b2c3d4e	0.412000	5	0.6000	142.10	keep	lower targetDistanceMultiplier 1.5 -> 1.2
c3d4e5f	0.681000	11	0.5455	288.30	keep	also lower minRiskRewardRatio 2.0 -> 1.5
d4e5f6g	0.000000	0	0.0000	0.00	discard	switch regime to ranging — found no entries
```

Do NOT commit `results.tsv` — leave it untracked. It's the experiment log,
not source code.

## The experiment loop

The experiment runs on a dedicated branch (e.g. `autoresearch/crv-apr11`).

LOOP FOREVER:

1. Look at the git state: the current branch/commit you're on.
2. Tune `train.ts` with an experimental idea by editing the constants in
   the PARAMS section. Pick an idea informed by the previous run's
   rejection breakdown.
3. `git add autoresearch/train.ts && git commit -m "<short description>"`
4. Run: `npm run autoresearch:train > autoresearch/run.log 2>&1`
5. Read results: `grep "^score:\|^trades:\|^win_rate:\|^net_pnl:" autoresearch/run.log`
6. If grep is empty or you see an error, run `tail -n 50 autoresearch/run.log`
   to read the stack trace. If the failure is your edit (typo, bad value),
   fix and re-run. If the idea is fundamentally broken (e.g. negative
   number where positive required), revert and try something else.
7. Record results in `autoresearch/results.tsv`.
8. If score improved, advance the branch — keep the commit.
9. If score is equal or worse, `git reset --hard HEAD~1` to revert the
   edit. (This is the keep/discard fork.)

The idea is that you're an autonomous researcher trying things out. Keep
the wins. Discard the losses. Advance the branch so you build on
improvements.

**Crashes**: If a run crashes, use judgment. Easy fix (typo, wrong value
type) → fix and re-run. Fundamental error (e.g. you tried to set regime
to a value that doesn't exist) → log as `crash`, revert, try something
else.

**Strategy code changes**: If your hypothesis genuinely requires editing
strategy primitives (e.g. "what if level identification used a different
swing detection algorithm?"), DO NOT make the change. Instead:
1. Log the run with status `defer` and a clear description of the
   proposed change in the description column.
2. Move on to the next hypothesis you can test within train.ts.
3. The human will review deferred items separately.

**NEVER STOP**: Once the experiment loop has begun (after initial setup),
do NOT pause to ask the human if you should continue. Do NOT ask "should
I keep going?" or "is this a good stopping point?". The human might be
asleep or away from the computer and expects you to continue working
indefinitely until manually stopped. You are autonomous. If you run out
of ideas, think harder — re-read the strategy modules for new angles, try
combining previous near-misses, try more radical parameter combinations,
read the rejection breakdowns more carefully. The loop runs until the
human interrupts you, period.

## Worked example

The user says: *"Find a config where CRV/USDT 1h opens at least 1 trade
per day on the cached dataset, with positive net PnL."*

Your first move:
1. `git checkout -b autoresearch/crv-apr11`
2. Read `autoresearch/train.ts`. Note the dataset is `CRVUSDT 1h 1000`.
3. Verify cache exists. If not, tell the user to run prepare.
4. Create `autoresearch/results.tsv` with the header.
5. Run baseline: `npm run autoresearch:train > autoresearch/run.log 2>&1`
6. Read score, trades, rejection_breakdown.
7. Suppose: `score: 0.000000`, `trades: 0`, `no_proposal: 858`. That's
   the case the human is investigating. The dominant rejection is
   `no_proposal`, meaning sweeps fire but generateProposal returns null.
8. Hypothesis: targetDistanceMultiplier is too aggressive. Change it
   from 1.5 to 1.2.
9. Commit, run, read score. Did it improve? If yes, advance. If no,
   revert.
10. Next hypothesis: maybe minWickProtrusionPct is rejecting valid
    sweeps. Lower it. Run. Decide.
11. … keep going for 30+ iterations …

When the human comes back, they review the branch's git log + results.tsv
and either cherry-pick the winning commits, copy the converged params
into the deployed Settings UI, or tell you to keep searching.
