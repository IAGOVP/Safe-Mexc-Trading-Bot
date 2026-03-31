import { useCallback, useEffect, useState } from "react";
import {
  confirmStepPlan,
  createStepPlan,
  fetchStepPlans,
  type StepPlanAction,
  type StepPlanRecord,
  stopStepPlan
} from "../../api/stepPlansApi";

type StepFormRow = {
  action: StepPlanAction;
  triggerPrice: string;
  quantity: string;
  whenTriggeredType: 1 | 5;
  limitPrice: string;
};

const emptyRow = (): StepFormRow => ({
  action: "open_long",
  triggerPrice: "",
  quantity: "",
  whenTriggeredType: 5,
  limitPrice: ""
});

const ACTION_OPTIONS: { value: StepPlanAction; label: string }[] = [
  { value: "open_long", label: "Open long" },
  { value: "open_short", label: "Open short" },
  { value: "close_long", label: "Close long" },
  { value: "close_short", label: "Close short" }
];

type Props = {
  symbol: string;
};

export const StepOrdersSection = ({ symbol }: Props) => {
  const [openType, setOpenType] = useState<1 | 2>(1);
  const [leverage, setLeverage] = useState(5);
  const [rows, setRows] = useState<StepFormRow[]>([emptyRow(), emptyRow(), emptyRow()]);
  const [plans, setPlans] = useState<StepPlanRecord[]>([]);
  const [plansError, setPlansError] = useState("");
  const [createError, setCreateError] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [confirmLoadingId, setConfirmLoadingId] = useState<string | null>(null);
  const [stopLoadingId, setStopLoadingId] = useState<string | null>(null);

  const loadPlans = useCallback(async () => {
    setPlansError("");
    try {
      const list = await fetchStepPlans();
      setPlans(list);
    } catch (e) {
      setPlansError(e instanceof Error ? e.message : "Failed to load plans.");
    }
  }, []);

  useEffect(() => {
    loadPlans();
    const t = window.setInterval(loadPlans, 5000);
    return () => window.clearInterval(t);
  }, [loadPlans]);

  const addRow = () => setRows((r) => [...r, emptyRow()]);
  const removeRow = (idx: number) => setRows((r) => (r.length <= 1 ? r : r.filter((_, i) => i !== idx)));
  const patchRow = (idx: number, patch: Partial<StepFormRow>) =>
    setRows((r) => r.map((row, i) => (i === idx ? { ...row, ...patch } : row)));

  const handleCreatePlan = async () => {
    setCreateError("");
    setCreateLoading(true);
    try {
      const steps = rows.map((row, i) => {
        const tp = Number(row.triggerPrice.trim());
        const qty = Number(row.quantity.trim());
        if (!Number.isFinite(tp) || tp <= 0) throw new Error(`Step ${i + 1}: enter a valid trigger price.`);
        if (!Number.isFinite(qty) || qty <= 0) throw new Error(`Step ${i + 1}: enter a valid quantity (contracts/base).`);
        const wtt = row.whenTriggeredType;
        let limitPrice: number | undefined;
        if (wtt === 1) {
          const lp = Number(row.limitPrice.trim());
          if (!Number.isFinite(lp) || lp <= 0) throw new Error(`Step ${i + 1}: limit price required for limit stop.`);
          limitPrice = lp;
        }
        return {
          action: row.action,
          triggerPrice: tp,
          quantity: qty,
          whenTriggeredType: wtt,
          limitPrice
        };
      });

      await createStepPlan({
        symbol,
        openType,
        leverage,
        steps
      });
      setRows([emptyRow(), emptyRow(), emptyRow()]);
      await loadPlans();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Create failed.");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleConfirmStep = async (planId: string, stepIndex: number) => {
    setPlansError("");
    setConfirmLoadingId(planId);
    try {
      await confirmStepPlan(planId, stepIndex);
      await loadPlans();
    } catch (e) {
      setPlansError(e instanceof Error ? e.message : "Confirm failed.");
    } finally {
      setConfirmLoadingId(null);
    }
  };

  const handleStop = async (id: string) => {
    setStopLoadingId(id);
    try {
      await stopStepPlan(id);
      await loadPlans();
    } catch (e) {
      setPlansError(e instanceof Error ? e.message : "Stop failed.");
    } finally {
      setStopLoadingId(null);
    }
  };

  const statusClass = (s: StepPlanRecord["status"]) => {
    switch (s) {
      case "running":
        return "text-sky-300";
      case "awaiting_confirm":
        return "text-amber-300";
      case "draft":
        return "text-slate-400";
      case "completed":
        return "text-emerald-400";
      case "failed":
        return "text-rose-400";
      default:
        return "text-slate-400";
    }
  };

  const canConfirmStep = (p: StepPlanRecord) =>
    (p.status === "draft" || p.status === "awaiting_confirm") &&
    p.activeOrderId === null &&
    p.currentStepIndex < p.steps.length;

  const canStopPlan = (p: StepPlanRecord) =>
    p.status === "draft" || p.status === "awaiting_confirm" || p.status === "running";

  return (
    <section className="mt-4 glass-card rounded-2xl p-6">
      <div className="flex flex-col gap-2 border-b border-sky-500/15 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300/90">Sequential steps</p>
          <h3 className="mt-1 text-lg font-semibold">Step orders</h3>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
            Define a strict sequence of stop-based actions for <span className="text-slate-200">{symbol}</span>. Creating a plan saves a{" "}
            <strong className="font-medium text-slate-200">draft</strong>; you <strong className="font-medium text-slate-200">confirm each step</strong>{" "}
            before the server sends that stop to Binance. After a step fills, the next step waits for your confirmation again — only one live stop at a
            time, in order.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <div>
          <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Margin mode</label>
          <select
            className="input-theme mt-1 w-full rounded-lg px-3 py-2 text-sm"
            value={openType}
            onChange={(e) => setOpenType(Number(e.target.value) as 1 | 2)}
          >
            <option value={1}>Isolated</option>
            <option value={2}>Cross</option>
          </select>
        </div>
        <div>
          <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Leverage (opens)</label>
          <input
            className="input-theme mt-1 w-full rounded-lg px-3 py-2 text-sm tabular-nums"
            type="number"
            min={1}
            value={leverage}
            onChange={(e) => setLeverage(Math.max(1, Number(e.target.value) || 1))}
          />
        </div>
        <div className="flex items-end">
          <button type="button" className="ghost-btn w-full rounded-lg px-3 py-2 text-sm text-slate-100" onClick={addRow}>
            + Add step
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {rows.map((row, idx) => (
          <div
            key={idx}
            className="rounded-xl border border-sky-500/12 bg-slate-950/35 p-4"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-400">Step {idx + 1}</span>
              <button
                type="button"
                className="text-xs text-rose-400/90 hover:text-rose-300 disabled:opacity-40"
                disabled={rows.length <= 1}
                onClick={() => removeRow(idx)}
              >
                Remove
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <label className="text-[11px] text-slate-500">Action</label>
                <select
                  className="input-theme w-full rounded-lg px-2 py-2 text-sm"
                  value={row.action}
                  onChange={(e) => patchRow(idx, { action: e.target.value as StepPlanAction })}
                >
                  {ACTION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-slate-500">Trigger price</label>
                <input
                  className="input-theme w-full rounded-lg px-2 py-2 text-sm tabular-nums"
                  placeholder="e.g. 1.1"
                  value={row.triggerPrice}
                  onChange={(e) => patchRow(idx, { triggerPrice: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-slate-500">Quantity</label>
                <input
                  className="input-theme w-full rounded-lg px-2 py-2 text-sm tabular-nums"
                  placeholder="Contracts / base"
                  value={row.quantity}
                  onChange={(e) => patchRow(idx, { quantity: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-slate-500">When triggered</label>
                <select
                  className="input-theme w-full rounded-lg px-2 py-2 text-sm"
                  value={row.whenTriggeredType}
                  onChange={(e) => patchRow(idx, { whenTriggeredType: Number(e.target.value) as 1 | 5 })}
                >
                  <option value={5}>Market</option>
                  <option value={1}>Limit (needs limit price)</option>
                </select>
              </div>
            </div>
            {row.whenTriggeredType === 1 ? (
              <div className="mt-3 max-w-xs space-y-1">
                <label className="text-[11px] text-slate-500">Limit price (after stop triggers)</label>
                <input
                  className="input-theme w-full rounded-lg px-2 py-2 text-sm tabular-nums"
                  placeholder="Limit"
                  value={row.limitPrice}
                  onChange={(e) => patchRow(idx, { limitPrice: e.target.value })}
                />
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {createError ? <p className="mt-3 text-sm text-rose-400">{createError}</p> : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="neon-btn rounded-lg px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-70"
          disabled={createLoading}
          onClick={handleCreatePlan}
        >
          {createLoading ? "Creating…" : `Create draft plan on ${symbol}`}
        </button>
        <p className="text-xs text-slate-500">
          One active plan per symbol. Confirm steps from the list below. Binance STOP / STOP_MARKET (contract price).
        </p>
      </div>

      <div className="mt-8 border-t border-sky-500/15 pt-6">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-slate-200">Plans (this server session)</h4>
          <button type="button" className="ghost-btn rounded-lg px-3 py-1.5 text-xs text-slate-100" onClick={loadPlans}>
            Refresh
          </button>
        </div>
        {plansError ? <p className="mt-2 text-sm text-rose-400">{plansError}</p> : null}
        {plans.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No step plans yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {plans.map((p) => (
              <li key={p.id} className="rounded-lg border border-sky-500/10 bg-slate-950/30 px-3 py-3 text-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <span className="font-mono text-xs text-slate-500">{p.id.slice(0, 8)}…</span>
                    <span className="ml-2 text-slate-300">{p.symbol}</span>
                    <span className={`ml-2 text-xs font-semibold uppercase ${statusClass(p.status)}`}>{p.status.replace(/_/g, " ")}</span>
                    <span className="ml-2 text-xs text-slate-500">
                      {p.status === "completed"
                        ? `all ${p.steps.length} steps done`
                        : p.status === "running"
                          ? `live: step ${p.currentStepIndex + 1} of ${p.steps.length}`
                          : p.status === "draft" || p.status === "awaiting_confirm"
                            ? `ready to confirm step ${p.currentStepIndex + 1} of ${p.steps.length}`
                            : `step index ${p.currentStepIndex}`}
                    </span>
                    {p.activeOrderId !== null ? (
                      <span className="ml-2 text-xs text-slate-500">algo #{p.activeOrderId}</span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                    {canConfirmStep(p) ? (
                      <button
                        type="button"
                        className="neon-btn rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-70"
                        disabled={confirmLoadingId === p.id}
                        onClick={() => handleConfirmStep(p.id, p.currentStepIndex)}
                      >
                        {confirmLoadingId === p.id ? "Confirming…" : `Confirm step ${p.currentStepIndex + 1}`}
                      </button>
                    ) : null}
                    {canStopPlan(p) ? (
                      <button
                        type="button"
                        className="ghost-btn rounded-lg px-3 py-1.5 text-xs text-slate-100 disabled:opacity-70"
                        disabled={stopLoadingId === p.id}
                        onClick={() => handleStop(p.id)}
                      >
                        {stopLoadingId === p.id ? "Stopping…" : "Stop plan"}
                      </button>
                    ) : null}
                  </div>
                </div>
                {p.message ? <p className="mt-2 text-xs text-slate-400">{p.message}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};
