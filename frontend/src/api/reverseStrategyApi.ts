const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api";

export type ReverseStrategyVariant = "200" | "300";

export interface ReverseMilestone {
  triggerPct: number;
  marginUsdt: number;
  minBoundPct: number;
}

export interface ReverseStrategyRun {
  id: string;
  symbol: string;
  openType: 1 | 2;
  leverage: number;
  variant: ReverseStrategyVariant;
  refPrice: number;
  status: "running" | "stopped" | "completed" | "failed";
  firedMilestoneIndices: number[];
  breachArmed: boolean;
  lowSinceBreach: number | null;
  message?: string;
  createdAt: number;
  updatedAt: number;
}

type BinanceWrap<T> = { success: boolean; code: number; data: T };

const readError = async (res: Response, fallback: string): Promise<string> => {
  try {
    const raw = await res.text();
    if (raw) {
      const j = JSON.parse(raw) as { message?: string };
      if (j.message) return j.message;
    }
  } catch {
    // ignore
  }
  return fallback;
};

export const fetchReverseMilestones = async (variant: ReverseStrategyVariant): Promise<ReverseMilestone[]> => {
  const res = await fetch(`${API_URL}/binance/reverse-strategy/milestones?variant=${encodeURIComponent(variant)}`);
  const raw = (await res.json()) as { message?: string; data?: BinanceWrap<ReverseMilestone[]> };
  if (!res.ok) throw new Error(raw.message ?? (await readError(res, "Failed to load milestones.")));
  const inner = raw.data?.data;
  if (!Array.isArray(inner)) throw new Error("Unexpected milestones response.");
  return inner;
};

export const fetchReverseRuns = async (): Promise<ReverseStrategyRun[]> => {
  const res = await fetch(`${API_URL}/binance/reverse-strategy/runs`);
  const raw = (await res.json()) as { message?: string; data?: BinanceWrap<ReverseStrategyRun[]> };
  if (!res.ok) throw new Error(raw.message ?? (await readError(res, "Failed to load reverse runs.")));
  const inner = raw.data?.data;
  if (!Array.isArray(inner)) throw new Error("Unexpected runs response.");
  return inner;
};

export const startReverseStrategy = async (payload: {
  symbol: string;
  openType: 1 | 2;
  variant: ReverseStrategyVariant;
  bootstrap?: boolean;
  leverage?: number;
}): Promise<ReverseStrategyRun> => {
  const res = await fetch(`${API_URL}/binance/reverse-strategy/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const raw = (await res.json()) as { message?: string; data?: BinanceWrap<ReverseStrategyRun> };
  if (!res.ok) throw new Error(raw.message ?? (await readError(res, "Failed to start reverse strategy.")));
  const inner = raw.data?.data;
  if (!inner?.id) throw new Error("Unexpected start response.");
  return inner;
};

export const stopReverseStrategy = async (id: string): Promise<ReverseStrategyRun> => {
  const res = await fetch(`${API_URL}/binance/reverse-strategy/runs/${encodeURIComponent(id)}/stop`, {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });
  const raw = (await res.json()) as { message?: string; data?: BinanceWrap<ReverseStrategyRun> };
  if (!res.ok) throw new Error(raw.message ?? (await readError(res, "Failed to stop reverse strategy.")));
  const inner = raw.data?.data;
  if (!inner?.id) throw new Error("Unexpected stop response.");
  return inner;
};
