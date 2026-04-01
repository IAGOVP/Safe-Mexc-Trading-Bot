import { useState } from "react";
import {
  addStepToPlan,
  createStepPlan,
  fetchStepPlans,
  type StepPlanAction,
} from "../../api/stepPlansApi";

type StepFormRow = {
  action: StepPlanAction;
  quantity: string;
  whenTriggeredType: 1 | 5;
  limitPrice: string;
};

const emptyRow = (): StepFormRow => ({
  action: "open_long",
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
  const [rowError, setRowError] = useState("");
  const [rowLoadingKey, setRowLoadingKey] = useState<string | null>(null);

  const addRow = () => setRows((r) => [...r, emptyRow()]);
  const removeRow = (idx: number) => setRows((r) => (r.length <= 1 ? r : r.filter((_, i) => i !== idx)));
  const patchRow = (idx: number, patch: Partial<StepFormRow>) =>
    setRows((r) => r.map((row, i) => (i === idx ? { ...row, ...patch } : row)));

  const handleConfirmRow = async (row: StepFormRow, rowIndex: number) => {
    setRowError("");
    setRowLoadingKey(`row:${rowIndex}`);
    try {
      const qty = Number(row.quantity.trim());
      if (!Number.isFinite(qty) || qty <= 0) throw new Error(`Step ${rowIndex + 1}: enter a valid quantity (contracts/base).`);
      const wtt = row.whenTriggeredType;
      let limitPrice: number | undefined;
      if (wtt === 1) {
        const lp = Number(row.limitPrice.trim());
        if (!Number.isFinite(lp) || lp <= 0) throw new Error(`Step ${rowIndex + 1}: valid limit price required.`);
        limitPrice = lp;
      }
      const step = { action: row.action, quantity: qty, whenTriggeredType: wtt, limitPrice };

      const list = await fetchStepPlans();
      const activePlan = list.find((p) => p.symbol === symbol && (p.status === "draft" || p.status === "awaiting_confirm"));
      if (!activePlan) {
        await createStepPlan({ symbol, openType, leverage, steps: [step] });
      } else {
        await addStepToPlan(activePlan.id, step);
      }
      setRows((r) => (r.length <= 1 ? [emptyRow()] : r.filter((_, i) => i !== rowIndex)));
    } catch (e) {
      setRowError(e instanceof Error ? e.message : "Step confirmation failed.");
    } finally {
      setRowLoadingKey(null);
    }
  };

  return (
    <section className="mt-4 glass-card rounded-2xl p-6">
      <div className="flex flex-col gap-2 border-b border-sky-500/15 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300/90">Sequential steps</p>
          <h3 className="mt-1 text-lg font-semibold">Step orders</h3>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
            Define your sequence for <span className="text-slate-200">{symbol}</span> and use each row&apos;s{" "}
            <strong className="font-medium text-slate-200">Confirm step</strong> / <strong className="font-medium text-slate-200">Remove</strong> buttons
            separately. Only one live order runs at a time; next step still waits for confirmation after fill.
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
                <label className="text-[11px] text-slate-500">Quantity</label>
                <input
                  className="input-theme w-full rounded-lg px-2 py-2 text-sm tabular-nums"
                  placeholder="Contracts / base"
                  value={row.quantity}
                  onChange={(e) => patchRow(idx, { quantity: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-slate-500">Order type</label>
                <select
                  className="input-theme w-full rounded-lg px-2 py-2 text-sm"
                  value={row.whenTriggeredType}
                  onChange={(e) => patchRow(idx, { whenTriggeredType: Number(e.target.value) as 1 | 5 })}
                >
                  <option value={5}>Market</option>
                  <option value={1}>Limit</option>
                </select>
              </div>
            </div>
            {row.whenTriggeredType === 1 ? (
              <div className="mt-3 max-w-xs space-y-1">
                <label className="text-[11px] text-slate-500">Limit price</label>
                <input
                  className="input-theme w-full rounded-lg px-2 py-2 text-sm tabular-nums"
                  placeholder="Limit"
                  value={row.limitPrice}
                  onChange={(e) => patchRow(idx, { limitPrice: e.target.value })}
                />
              </div>
            ) : null}
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                className="ghost-btn rounded px-3 py-1.5 text-xs text-rose-200 disabled:opacity-70"
                disabled={rows.length <= 1}
                onClick={() => removeRow(idx)}
              >
                Remove
              </button>
              <button
                type="button"
                className="neon-btn rounded px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-70"
                disabled={rowLoadingKey === `row:${idx}`}
                onClick={() => handleConfirmRow(row, idx)}
              >
                {rowLoadingKey === `row:${idx}` ? "Confirming…" : "Confirm step"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {rowError ? <p className="mt-3 text-sm text-rose-400">{rowError}</p> : null}
    </section>
  );
};
