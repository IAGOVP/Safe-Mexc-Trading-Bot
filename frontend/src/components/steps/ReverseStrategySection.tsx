import { useCallback, useEffect, useState } from "react";
import {
  fetchReverseMilestones,
  fetchReverseRuns,
  startReverseStrategy,
  stopReverseStrategy,
  type ReverseMilestone,
  type ReverseStrategyRun,
  type ReverseStrategyVariant
} from "../../api/reverseStrategyApi";

type Props = {
  symbol: string;
};

export const ReverseStrategySection = ({ symbol }: Props) => {
  const [openType, setOpenType] = useState<1 | 2>(1);
  const [variant, setVariant] = useState<ReverseStrategyVariant>("200");
  const [bootstrap, setBootstrap] = useState(false);
  const [leverage, setLeverage] = useState(100);
  const [startMarginUsdt, setStartMarginUsdt] = useState(1);
  const [milestones, setMilestones] = useState<ReverseMilestone[]>([]);
  const [runs, setRuns] = useState<ReverseStrategyRun[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadMilestones = useCallback(async () => {
    try {
      const m = await fetchReverseMilestones(variant);
      setMilestones(m);
    } catch (e) {
      setMilestones([]);
      setError(e instanceof Error ? e.message : "Failed to load ladder.");
    }
  }, [variant]);

  const loadRuns = useCallback(async () => {
    setRefreshing(true);
    try {
      const list = await fetchReverseRuns();
      setRuns(list.filter((r) => r.symbol.replace(/[_\-/]/g, "") === symbol.replace(/[_\-/]/g, "")));
    } catch {
      setRuns([]);
    } finally {
      setRefreshing(false);
    }
  }, [symbol]);

  useEffect(() => {
    void loadMilestones();
  }, [loadMilestones]);

  useEffect(() => {
    void loadRuns();
    const t = setInterval(() => void loadRuns(), 6000);
    return () => clearInterval(t);
  }, [loadRuns]);

  const activeRun = runs.find((r) => r.status === "running");

  return (
    <section className="mt-8 glass-card rounded-2xl p-6">
      <div className="flex flex-col gap-2 border-b border-violet-500/15 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300/90">Reverse strategy</p>
          <h3 className="mt-1 text-lg font-semibold">Hedged long/short ladder (short adds + floor)</h3>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
            Reference price is fixed at start (short entry, or mark after bootstrap). When mark rises past each trigger % of
            that reference, the bot adds the listed USDT margin to the short at your leverage. After at least one add, if
            mark falls below the <span className="text-slate-200">active min bound</span> (highest tier reached), it waits for a
            small rebound from the post-breach low, then closes the short with a market reduce-only buy. Long is left open.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Variant</label>
          <select
            className="input-theme mt-1 w-full rounded-lg px-3 py-2 text-sm"
            value={variant}
            onChange={(e) => setVariant(e.target.value as ReverseStrategyVariant)}
            disabled={!!activeRun}
          >
            <option value="200">200% ladder (101%–106%)</option>
            <option value="300">300% ladder (102% / 104% / 107% / 110%)</option>
          </select>
        </div>
        <div>
          <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Margin mode</label>
          <select
            className="input-theme mt-1 w-full rounded-lg px-3 py-2 text-sm"
            value={openType}
            onChange={(e) => setOpenType(Number(e.target.value) as 1 | 2)}
            disabled={!!activeRun}
          >
            <option value={1}>Isolated</option>
            <option value={2}>Cross</option>
          </select>
        </div>
        <div>
          <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Leverage</label>
          <input
            className="input-theme mt-1 w-full rounded-lg px-3 py-2 text-sm tabular-nums"
            type="number"
            min={1}
            value={leverage}
            onChange={(e) => setLeverage(Math.max(1, Number(e.target.value) || 1))}
            disabled={!!activeRun}
          />
        </div>
        <div className="flex flex-col justify-end gap-2">
          <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Starting margin (USDT)</label>
          <input
            className="input-theme mt-1 w-full rounded-lg px-3 py-2 text-sm tabular-nums"
            type="number"
            min={0.01}
            step="0.01"
            value={startMarginUsdt}
            onChange={(e) => setStartMarginUsdt(Math.max(0.01, Number(e.target.value) || 1))}
            disabled={!!activeRun}
          />
          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              className="rounded border-slate-600"
              checked={bootstrap}
              onChange={(e) => setBootstrap(e.target.checked)}
              disabled={!!activeRun}
            />
            Bootstrap using starting margin on both sides
          </label>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-violet-500/15 bg-slate-950/40">
        <table className="w-full min-w-[480px] text-left text-xs text-slate-300">
          <thead className="border-b border-slate-700/80 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Trigger (% of ref)</th>
              <th className="px-3 py-2">Add margin (USDT)</th>
              <th className="px-3 py-2">Min bound (% of ref)</th>
            </tr>
          </thead>
          <tbody>
            {milestones.map((m, i) => (
              <tr key={i} className="border-b border-slate-800/80 last:border-0">
                <td className="px-3 py-2 font-mono text-slate-100">{m.triggerPct}%</td>
                <td className="px-3 py-2 font-mono">${(m.marginUsdt * startMarginUsdt).toFixed(2)}</td>
                <td className="px-3 py-2 font-mono">{m.minBoundPct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="neon-btn rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
          disabled={loading || !!activeRun}
          onClick={async () => {
            setError("");
            setLoading(true);
            try {
              await startReverseStrategy({
                symbol,
                openType,
                variant,
                bootstrap,
                leverage,
                startMarginUsdt
              });
              await loadRuns();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Start failed.");
            } finally {
              setLoading(false);
            }
          }}
        >
          {loading ? "Starting…" : "Start on symbol"}
        </button>
        <button
          type="button"
          className="ghost-btn rounded-lg px-4 py-2 text-xs text-slate-100 disabled:opacity-50"
          disabled={refreshing}
          onClick={() => void loadRuns()}
        >
          Refresh status
        </button>
        {activeRun ? (
          <button
            type="button"
            className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-500/20"
            onClick={async () => {
              setError("");
              try {
                await stopReverseStrategy(activeRun.id);
                await loadRuns();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Stop failed.");
              }
            }}
          >
            Stop run
          </button>
        ) : null}
        <span className="text-[11px] text-slate-500">
          Server tick ~4s. Rebound sensitivity: set <code className="text-slate-400">REVERSE_STRATEGY_REBOUND_BPS</code> on
          backend (basis points from post-breach low).
        </span>
      </div>

      {error ? <p className="mt-2 text-sm text-rose-400">{error}</p> : null}

      {runs.length > 0 ? (
        <div className="mt-5 space-y-2 rounded-xl border border-slate-700/50 bg-slate-950/50 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Runs ({symbol})</p>
          {runs.map((r) => (
            <div key={r.id} className="rounded-lg border border-slate-700/40 px-3 py-2 text-xs text-slate-300">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-mono text-[11px] text-slate-400">{r.id.slice(0, 8)}…</span>
                <span
                  className={
                    r.status === "running"
                      ? "text-emerald-300"
                      : r.status === "failed"
                        ? "text-rose-400"
                        : "text-slate-400"
                  }
                >
                  {r.status}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                ref {r.refPrice.toFixed(4)} · {r.variant}% · lev {r.leverage}x · fired indices [{r.firedMilestoneIndices.join(", ")}
                ]{r.breachArmed ? " · breach watch" : ""}
              </p>
              {r.message ? <p className="mt-1 text-[11px] text-slate-200">{r.message}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
};
