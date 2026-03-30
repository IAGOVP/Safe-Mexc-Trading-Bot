import crypto from "crypto";
import { fapiSignedDelete, fapiSignedGet, fapiSignedPost } from "./binance.service";

const toBinanceSymbol = (s: string): string => s.trim().toUpperCase().replace(/[_\-/]/g, "");

const mapMexcSideToBinance = (side: number): { binanceSide: "BUY" | "SELL"; reduceOnly: boolean } => {
  if (side === 1) return { binanceSide: "BUY", reduceOnly: false };
  if (side === 3) return { binanceSide: "SELL", reduceOnly: false };
  if (side === 4) return { binanceSide: "SELL", reduceOnly: true };
  if (side === 2) return { binanceSide: "BUY", reduceOnly: true };
  return { binanceSide: "BUY", reduceOnly: false };
};

const actionToSide = (action: StepPlanAction): number => {
  switch (action) {
    case "open_long":
      return 1;
    case "open_short":
      return 3;
    case "close_long":
      return 4;
    case "close_short":
      return 2;
    default:
      return 1;
  }
};

const setMarginAndLeverage = async (symbol: string, openType: number, leverage?: number): Promise<void> => {
  const marginType = openType === 1 ? "ISOLATED" : "CROSSED";
  try {
    await fapiSignedPost("/fapi/v1/marginType", { symbol, marginType });
  } catch {
    // Often -4046
  }
  if (leverage !== undefined && leverage >= 1) {
    await fapiSignedPost("/fapi/v1/leverage", { symbol, leverage: Math.floor(leverage) });
  }
};

export type StepPlanAction = "open_long" | "open_short" | "close_long" | "close_short";

export type StepPlanStatus = "created" | "running" | "completed" | "stopped" | "failed";

export interface StepDefinition {
  action: StepPlanAction;
  triggerPrice: number;
  quantity: number;
  /** 5 = STOP_MARKET when triggered; 1 = STOP (limit) when triggered — requires limitPrice */
  whenTriggeredType: 1 | 5;
  limitPrice?: number;
}

export interface StepPlan {
  id: string;
  symbol: string;
  openType: 1 | 2;
  leverage: number;
  steps: StepDefinition[];
  status: StepPlanStatus;
  currentStepIndex: number;
  activeOrderId: number | null;
  message?: string;
  createdAt: number;
  updatedAt: number;
}

const plans = new Map<string, StepPlan>();
const tickLocks = new Set<string>();

const MAX_STEPS = 15;

const placeStopOrder = async (opts: {
  symbol: string;
  side: number;
  vol: number;
  triggerPrice: number;
  orderType: number;
  limitPrice?: number;
  openType: number;
  leverage?: number;
}): Promise<number> => {
  const sym = toBinanceSymbol(opts.symbol);
  const { binanceSide, reduceOnly } = mapMexcSideToBinance(opts.side);
  const isOpening = opts.side === 1 || opts.side === 3;
  await setMarginAndLeverage(sym, opts.openType, isOpening ? opts.leverage : opts.leverage ?? undefined);

  const execMarket = opts.orderType === 5;
  const params: Record<string, string | number | boolean | undefined> = {
    symbol: sym,
    side: binanceSide,
    type: execMarket ? "STOP_MARKET" : "STOP",
    stopPrice: String(opts.triggerPrice),
    quantity: String(opts.vol),
    workingType: "CONTRACT_PRICE"
  };
  if (reduceOnly) params.reduceOnly = true;
  if (!execMarket) {
    if (opts.limitPrice === undefined || opts.limitPrice === null || !Number.isFinite(Number(opts.limitPrice))) {
      throw new Error("limitPrice is required for limit stop (whenTriggeredType 1).");
    }
    params.price = String(opts.limitPrice);
  }

  const order = await fapiSignedPost<{ orderId: number }>("/fapi/v1/order", params);
  return order.orderId;
};

const fetchOrderStatus = async (symbol: string, orderId: number): Promise<string | null> => {
  const sym = toBinanceSymbol(symbol);
  const row = await fapiSignedGet<{ status?: string }>("/fapi/v1/order", { symbol: sym, orderId });
  return row.status ?? null;
};

export const validateStepsPayload = (body: {
  symbol?: string;
  openType?: number;
  leverage?: number;
  steps?: StepDefinition[];
}): { ok: true; symbol: string; openType: 1 | 2; leverage: number; steps: StepDefinition[] } | { ok: false; error: string } => {
  const { symbol, openType, leverage, steps } = body;
  if (!symbol || typeof symbol !== "string") return { ok: false, error: "symbol is required." };
  if (openType !== 1 && openType !== 2) return { ok: false, error: "openType must be 1 (isolated) or 2 (cross)." };
  if (leverage === undefined || !Number.isFinite(Number(leverage)) || Number(leverage) < 1) {
    return { ok: false, error: "leverage must be a number >= 1." };
  }
  if (!Array.isArray(steps) || steps.length === 0) return { ok: false, error: "steps must be a non-empty array." };
  if (steps.length > MAX_STEPS) return { ok: false, error: `At most ${MAX_STEPS} steps allowed.` };

  const normalized: StepDefinition[] = [];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (!s || typeof s !== "object") return { ok: false, error: `Step ${i + 1} is invalid.` };
    const action = s.action;
    if (!["open_long", "open_short", "close_long", "close_short"].includes(action)) {
      return { ok: false, error: `Step ${i + 1}: invalid action.` };
    }
    const tp = Number(s.triggerPrice);
    const qty = Number(s.quantity);
    if (!Number.isFinite(tp) || tp <= 0) return { ok: false, error: `Step ${i + 1}: triggerPrice must be positive.` };
    if (!Number.isFinite(qty) || qty <= 0) return { ok: false, error: `Step ${i + 1}: quantity must be positive.` };
    const wtt = Number(s.whenTriggeredType);
    if (wtt !== 1 && wtt !== 5) return { ok: false, error: `Step ${i + 1}: whenTriggeredType must be 1 (limit stop) or 5 (market stop).` };
    let limitPrice: number | undefined;
    if (wtt === 1) {
      const lp = Number(s.limitPrice);
      if (!Number.isFinite(lp) || lp <= 0) return { ok: false, error: `Step ${i + 1}: limitPrice required for limit stop.` };
      limitPrice = lp;
    }
    normalized.push({
      action: action as StepPlanAction,
      triggerPrice: tp,
      quantity: qty,
      whenTriggeredType: wtt as 1 | 5,
      limitPrice
    });
  }

  return { ok: true, symbol, openType: openType as 1 | 2, leverage: Number(leverage), steps: normalized };
};

export const hasRunningPlanForSymbol = (symbol: string): boolean => {
  const sym = toBinanceSymbol(symbol);
  for (const p of plans.values()) {
    if (p.status === "running" && toBinanceSymbol(p.symbol) === sym) return true;
  }
  return false;
};

export const createAndStartPlan = (body: {
  symbol: string;
  openType: 1 | 2;
  leverage: number;
  steps: StepDefinition[];
}): StepPlan => {
  if (hasRunningPlanForSymbol(body.symbol)) {
    throw new Error("Another step plan is already running for this symbol. Stop it before starting a new one.");
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  const plan: StepPlan = {
    id,
    symbol: body.symbol,
    openType: body.openType,
    leverage: body.leverage,
    steps: body.steps,
    status: "running",
    currentStepIndex: 0,
    activeOrderId: null,
    createdAt: now,
    updatedAt: now
  };
  plans.set(id, plan);
  return plan;
};

export const getPlan = (id: string): StepPlan | undefined => plans.get(id);

export const listPlans = (): StepPlan[] => {
  return Array.from(plans.values()).sort((a, b) => b.updatedAt - a.updatedAt);
};

export const stopPlan = async (id: string): Promise<StepPlan | null> => {
  const plan = plans.get(id);
  if (!plan) return null;
  if (plan.status !== "running") {
    plan.status = "stopped";
    plan.message = "Plan was not running.";
    plan.updatedAt = Date.now();
    return plan;
  }

  if (plan.activeOrderId !== null) {
    try {
      await fapiSignedDelete("/fapi/v1/order", {
        symbol: toBinanceSymbol(plan.symbol),
        orderId: plan.activeOrderId
      });
    } catch (e) {
      plan.message = e instanceof Error ? e.message : "Failed to cancel active order.";
    }
  }

  plan.status = "stopped";
  plan.activeOrderId = null;
  plan.updatedAt = Date.now();
  if (!plan.message) plan.message = "Stopped by user.";
  return plan;
};

async function placeCurrentStep(plan: StepPlan): Promise<void> {
  const step = plan.steps[plan.currentStepIndex];
  if (!step) return;

  const side = actionToSide(step.action);
  const needsLeverage = side === 1 || side === 3;

  const orderId = await placeStopOrder({
    symbol: plan.symbol,
    side,
    vol: step.quantity,
    triggerPrice: step.triggerPrice,
    orderType: step.whenTriggeredType,
    limitPrice: step.limitPrice,
    openType: plan.openType,
    leverage: needsLeverage ? plan.leverage : undefined
  });

  plan.activeOrderId = orderId;
  plan.message = `Step ${plan.currentStepIndex + 1}/${plan.steps.length}: stop order ${orderId} placed (only this step is on the book).`;
  plan.updatedAt = Date.now();
}

export const tickStepPlans = async (): Promise<void> => {
  for (const plan of plans.values()) {
    if (plan.status !== "running") continue;
    if (tickLocks.has(plan.id)) continue;
    tickLocks.add(plan.id);

    try {
      if (plan.currentStepIndex >= plan.steps.length) {
        plan.status = "completed";
        plan.activeOrderId = null;
        plan.message = "All steps completed.";
        plan.updatedAt = Date.now();
        continue;
      }

      if (plan.activeOrderId === null) {
        await placeCurrentStep(plan);
        continue;
      }

      let st: string | null;
      try {
        st = await fetchOrderStatus(plan.symbol, plan.activeOrderId);
      } catch {
        continue;
      }

      if (!st) continue;

      if (st === "FILLED") {
        plan.activeOrderId = null;
        plan.currentStepIndex += 1;
        plan.message =
          plan.currentStepIndex >= plan.steps.length
            ? "Final step filled. Plan complete."
            : `Step ${plan.currentStepIndex} filled. Queuing next step…`;
        plan.updatedAt = Date.now();

        if (plan.currentStepIndex >= plan.steps.length) {
          plan.status = "completed";
        }
        continue;
      }

      if (st === "CANCELED" || st === "EXPIRED" || st === "REJECTED") {
        plan.status = "failed";
        plan.activeOrderId = null;
        plan.message = `Order ended with status ${st}. Plan halted (later steps were never placed).`;
        plan.updatedAt = Date.now();
        continue;
      }

      // NEW, PARTIALLY_FILLED — keep waiting
      plan.updatedAt = Date.now();
    } catch (e) {
      plan.status = "failed";
      plan.activeOrderId = null;
      plan.message = e instanceof Error ? e.message : "Step plan error.";
      plan.updatedAt = Date.now();
    } finally {
      tickLocks.delete(plan.id);
    }
  }
};
