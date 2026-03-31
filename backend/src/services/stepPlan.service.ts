import crypto from "crypto";
import {
  fapiCancelConditionalAlgoOrder,
  fapiPlaceConditionalAlgoOrder,
  fapiQueryConditionalAlgoStatusNormalized,
  fapiSignedPost
} from "./binance.service";

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

export type StepPlanStatus = "draft" | "running" | "awaiting_confirm" | "completed" | "stopped" | "failed";

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
  let limitPrice: string | undefined;
  if (!execMarket) {
    if (opts.limitPrice === undefined || opts.limitPrice === null || !Number.isFinite(Number(opts.limitPrice))) {
      throw new Error("limitPrice is required for limit stop (whenTriggeredType 1).");
    }
    limitPrice = String(opts.limitPrice);
  }

  const { algoId } = await fapiPlaceConditionalAlgoOrder({
    symbol: sym,
    side: binanceSide,
    orderType: execMarket ? "STOP_MARKET" : "STOP",
    triggerPrice: String(opts.triggerPrice),
    quantity: String(opts.vol),
    limitPrice,
    workingType: "CONTRACT_PRICE",
    reduceOnly
  });
  return algoId;
};

const fetchAlgoOrderStatus = async (_symbol: string, algoId: number): Promise<string | null> => {
  return fapiQueryConditionalAlgoStatusNormalized(algoId);
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

const PLAN_ACTIVE_STATUSES: StepPlanStatus[] = ["draft", "awaiting_confirm", "running"];

export const hasActivePlanForSymbol = (symbol: string): boolean => {
  const sym = toBinanceSymbol(symbol);
  for (const p of plans.values()) {
    if (PLAN_ACTIVE_STATUSES.includes(p.status) && toBinanceSymbol(p.symbol) === sym) return true;
  }
  return false;
};

/** Create a plan in draft — no Binance order until you confirm step 1. */
export const createStepPlan = (body: {
  symbol: string;
  openType: 1 | 2;
  leverage: number;
  steps: StepDefinition[];
}): StepPlan => {
  if (hasActivePlanForSymbol(body.symbol)) {
    throw new Error("Another active step plan exists for this symbol. Stop or complete it before creating a new one.");
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  const plan: StepPlan = {
    id,
    symbol: body.symbol,
    openType: body.openType,
    leverage: body.leverage,
    steps: body.steps,
    status: "draft",
    currentStepIndex: 0,
    activeOrderId: null,
    createdAt: now,
    updatedAt: now,
    message: `Draft: confirm step 1 of ${body.steps.length} to place the first stop order on Binance.`
  };
  plans.set(id, plan);
  return plan;
};

/** Place the current step’s stop order (must be draft or awaiting_confirm). */
export const confirmCurrentStep = async (planId: string, stepIndex?: number): Promise<StepPlan> => {
  const plan = plans.get(planId);
  if (!plan) {
    throw new Error("Plan not found.");
  }
  if (plan.status !== "draft" && plan.status !== "awaiting_confirm") {
    throw new Error("Plan is not waiting for step confirmation (use this when status is draft or awaiting_confirm).");
  }
  if (plan.activeOrderId !== null) {
    throw new Error("An order is already live for this plan; wait for a fill or stop the plan.");
  }
  if (plan.currentStepIndex >= plan.steps.length) {
    throw new Error("No step left to confirm.");
  }
  if (stepIndex !== undefined && stepIndex !== plan.currentStepIndex) {
    throw new Error(`Confirm step ${plan.currentStepIndex + 1} next (index ${plan.currentStepIndex}).`);
  }

  await placeCurrentStep(plan);
  plan.status = "running";
  plan.updatedAt = Date.now();
  return plan;
};

export const getPlan = (id: string): StepPlan | undefined => plans.get(id);

export const listPlans = (): StepPlan[] => {
  return Array.from(plans.values()).sort((a, b) => b.updatedAt - a.updatedAt);
};

export const stopPlan = async (id: string): Promise<StepPlan | null> => {
  const plan = plans.get(id);
  if (!plan) return null;

  if (plan.status === "completed" || plan.status === "stopped" || plan.status === "failed") {
    plan.updatedAt = Date.now();
    return plan;
  }

  if (plan.status === "running" && plan.activeOrderId !== null) {
    try {
      await fapiCancelConditionalAlgoOrder(plan.activeOrderId);
    } catch (e) {
      plan.message = e instanceof Error ? e.message : "Failed to cancel active conditional order.";
    }
  }

  plan.status = "stopped";
  plan.activeOrderId = null;
  plan.updatedAt = Date.now();
  if (!plan.message?.includes("Failed to cancel")) plan.message = "Stopped by user.";
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
  plan.message = `Step ${plan.currentStepIndex + 1}/${plan.steps.length}: conditional stop algoId=${orderId} placed (only this step is on the book).`;
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
        continue;
      }

      let st: string | null;
      try {
        st = await fetchAlgoOrderStatus(plan.symbol, plan.activeOrderId);
      } catch {
        continue;
      }

      if (!st) continue;

      if (st === "FILLED") {
        plan.activeOrderId = null;
        const finishedStepOneBased = plan.currentStepIndex + 1;
        plan.currentStepIndex += 1;
        plan.updatedAt = Date.now();

        if (plan.currentStepIndex >= plan.steps.length) {
          plan.status = "completed";
          plan.message = `Step ${finishedStepOneBased} filled. Plan complete.`;
        } else {
          plan.status = "awaiting_confirm";
          plan.message = `Step ${finishedStepOneBased} filled. Confirm step ${plan.currentStepIndex + 1} to place the next order.`;
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
