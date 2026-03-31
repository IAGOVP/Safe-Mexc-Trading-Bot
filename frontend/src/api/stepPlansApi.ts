const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api";

export type StepPlanAction = "open_long" | "open_short" | "close_long" | "close_short";

export interface StepPlanStepPayload {
  action: StepPlanAction;
  triggerPrice: number;
  quantity: number;
  whenTriggeredType: 1 | 5;
  limitPrice?: number;
}

export interface StepPlanRecord {
  id: string;
  symbol: string;
  openType: 1 | 2;
  leverage: number;
  steps: StepPlanStepPayload[];
  status: "draft" | "running" | "awaiting_confirm" | "completed" | "stopped" | "failed";
  currentStepIndex: number;
  activeOrderId: number | null;
  message?: string;
  createdAt: number;
  updatedAt: number;
}

type BinanceWrap<T> = { success: boolean; code: number; data: T };

/** Creates a draft plan — confirm each step separately before it is sent to Binance. */
export const createStepPlan = async (payload: {
  symbol: string;
  openType: 1 | 2;
  leverage: number;
  steps: StepPlanStepPayload[];
}): Promise<StepPlanRecord> => {
  const response = await fetch(`${API_URL}/binance/steps/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const raw = (await response.json()) as { message?: string; data?: BinanceWrap<StepPlanRecord> };
  if (!response.ok) {
    throw new Error(raw.message ?? "Failed to create step plan.");
  }
  const inner = raw.data?.data;
  if (!inner) throw new Error("Unexpected step plan response.");
  return inner;
};

export const confirmStepPlan = async (planId: string, stepIndex?: number): Promise<StepPlanRecord> => {
  const response = await fetch(`${API_URL}/binance/steps/plans/${encodeURIComponent(planId)}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(stepIndex !== undefined ? { stepIndex } : {})
  });
  const raw = (await response.json()) as { message?: string; data?: BinanceWrap<StepPlanRecord> };
  if (!response.ok) {
    throw new Error(raw.message ?? "Failed to confirm step.");
  }
  const inner = raw.data?.data;
  if (!inner) throw new Error("Unexpected confirm response.");
  return inner;
};

export const fetchStepPlans = async (): Promise<StepPlanRecord[]> => {
  const response = await fetch(`${API_URL}/binance/steps/plans`);
  const raw = (await response.json()) as { message?: string; data?: BinanceWrap<StepPlanRecord[]> };
  if (!response.ok) {
    throw new Error(raw.message ?? "Failed to load step plans.");
  }
  const inner = raw.data?.data;
  if (!Array.isArray(inner)) throw new Error("Unexpected step plans response.");
  return inner;
};

export const stopStepPlan = async (planId: string): Promise<StepPlanRecord> => {
  const response = await fetch(`${API_URL}/binance/steps/plans/${encodeURIComponent(planId)}/stop`, {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });
  const raw = (await response.json()) as { message?: string; data?: BinanceWrap<StepPlanRecord> };
  if (!response.ok) {
    throw new Error(raw.message ?? "Failed to stop step plan.");
  }
  const inner = raw.data?.data;
  if (!inner) throw new Error("Unexpected stop plan response.");
  return inner;
};
