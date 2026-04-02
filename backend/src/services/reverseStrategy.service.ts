import crypto from "crypto";
import { fapiPublicGet, fapiSignedGet, fapiSignedPost } from "./binance.service";
import { hasActivePlanForSymbol } from "./stepPlan.service";

const toBinanceSymbol = (s: string): string => s.trim().toUpperCase().replace(/[_\-/]/g, "");

const REBOUND_BPS = Number(process.env.REVERSE_STRATEGY_REBOUND_BPS ?? "8") / 10_000;
const DEFAULT_LEVERAGE = 100;
const DEFAULT_START_MARGIN_USDT = 1;

export type ReverseStrategyVariant = "200" | "300";

/** Trigger and floor are expressed as percent of {@link ReverseStrategyRun.refPrice} (short reference at start). */
export type ReverseMilestone = {
  triggerPct: number;
  marginUsdt: number;
  minBoundPct: number;
};

const MILESTONES_200: ReverseMilestone[] = [
  { triggerPct: 101, marginUsdt: 2, minBoundPct: 100 },
  { triggerPct: 102, marginUsdt: 4, minBoundPct: 100.5 },
  { triggerPct: 104, marginUsdt: 8, minBoundPct: 101.5 },
  { triggerPct: 106, marginUsdt: 16, minBoundPct: 103 }
];

/** 300% variant: alternate ladder per spec (different rungs vs 200%). */
const MILESTONES_300: ReverseMilestone[] = [
  { triggerPct: 102, marginUsdt: 2, minBoundPct: 100 },
  { triggerPct: 104, marginUsdt: 6, minBoundPct: 101.5 },
  { triggerPct: 107, marginUsdt: 18, minBoundPct: 103 },
  { triggerPct: 110, marginUsdt: 54, minBoundPct: 105 }
];

export const milestonesForVariant = (v: ReverseStrategyVariant): ReverseMilestone[] =>
  v === "300" ? MILESTONES_300 : MILESTONES_200;

export type ReverseStrategyStatus = "running" | "stopped" | "completed" | "failed";

export interface ReverseStrategyRun {
  id: string;
  symbol: string;
  openType: 1 | 2;
  leverage: number;
  variant: ReverseStrategyVariant;
  /** User-selected starting margin (USDT) used for bootstrap and scaling milestone adds. */
  startMarginUsdt: number;
  /** Fixed reference: % triggers and floors use this, not the exchange average after adds. */
  refPrice: number;
  status: ReverseStrategyStatus;
  /** Indices into {@link milestonesForVariant} that have already received extra short margin. */
  firedMilestoneIndices: Set<number>;
  breachArmed: boolean;
  lowSinceBreach: number | null;
  message?: string;
  createdAt: number;
  updatedAt: number;
}

export type ReverseStrategyRunDto = Omit<ReverseStrategyRun, "firedMilestoneIndices"> & {
  firedMilestoneIndices: number[];
};

/** JSON-safe view for API responses. */
export const toReverseRunDto = (r: ReverseStrategyRun): ReverseStrategyRunDto => ({
  ...r,
  firedMilestoneIndices: Array.from(r.firedMilestoneIndices).sort((a, b) => a - b)
});

const runs = new Map<string, ReverseStrategyRun>();
const tickLocks = new Set<string>();

type SymbolFilters = { stepSize: number; minQty: number; maxQty: number; minNotional: number };
const lotCache = new Map<string, { filter: SymbolFilters; at: number }>();
const LOT_CACHE_MS = 300_000;

const setMarginAndLeverage = async (symbol: string, openType: number, leverage?: number): Promise<void> => {
  const marginType = openType === 1 ? "ISOLATED" : "CROSSED";
  try {
    await fapiSignedPost("/fapi/v1/marginType", { symbol, marginType });
  } catch {
    // -4046 common
  }
  if (leverage !== undefined && leverage >= 1) {
    await fapiSignedPost("/fapi/v1/leverage", { symbol, leverage: Math.floor(leverage) });
  }
};

const fetchMarkPrice = async (symbol: string): Promise<number> => {
  const sym = toBinanceSymbol(symbol);
  const row = await fapiPublicGet<{ markPrice?: string }>("/fapi/v1/premiumIndex", { symbol: sym });
  const m = Number(row.markPrice);
  if (!Number.isFinite(m) || m <= 0) throw new Error("Could not read mark price.");
  return m;
};

const getLotFilter = async (symbol: string): Promise<SymbolFilters> => {
  const sym = toBinanceSymbol(symbol);
  const now = Date.now();
  const hit = lotCache.get(sym);
  if (hit && now - hit.at < LOT_CACHE_MS) return hit.filter;

  const info = await fapiPublicGet<{
    symbols: Array<{
      symbol: string;
      filters: Array<Record<string, unknown>>;
    }>;
  }>("/fapi/v1/exchangeInfo", { symbol: sym });

  const s = info.symbols?.[0];
  const lot = s?.filters?.find((f) => String(f.filterType).toUpperCase() === "LOT_SIZE") as
    | { stepSize?: string; minQty?: string; maxQty?: string }
    | undefined;
  if (!lot?.stepSize || !lot.minQty) throw new Error(`LOT_SIZE filter missing for ${sym}.`);

  const minNotionalFilter = s?.filters?.find((f) => String(f.filterType).toUpperCase() === "MIN_NOTIONAL") as
    | { notional?: string; minNotional?: string }
    | undefined;
  const minNotionalRaw = minNotionalFilter?.notional ?? minNotionalFilter?.minNotional ?? "0";

  const filter: SymbolFilters = {
    stepSize: Number(lot.stepSize),
    minQty: Number(lot.minQty),
    maxQty: lot.maxQty ? Number(lot.maxQty) : Number.POSITIVE_INFINITY,
    minNotional: Math.max(0, Number(minNotionalRaw) || 0)
  };
  lotCache.set(sym, { filter, at: now });
  return filter;
};

const floorQtyToLot = (rawQty: number, lot: SymbolFilters): number => {
  if (!Number.isFinite(rawQty) || rawQty <= 0) return 0;
  const steps = Math.floor(rawQty / lot.stepSize + 1e-12);
  return steps * lot.stepSize;
};

const ceilQtyToLot = (rawQty: number, lot: SymbolFilters): number => {
  if (!Number.isFinite(rawQty) || rawQty <= 0) return 0;
  const steps = Math.ceil(rawQty / lot.stepSize - 1e-12);
  return steps * lot.stepSize;
};

const qtyFromMarginUsdt = async (symbol: string, markPrice: number, marginUsdt: number, leverage: number): Promise<string> => {
  const notional = marginUsdt * leverage;
  const raw = notional / markPrice;
  const lot = await getLotFilter(symbol);
  if (!Number.isFinite(raw) || raw <= 0) {
    throw new Error(`Computed quantity is invalid for ${symbol}. Check leverage and starting margin.`);
  }

  // Binance can enforce BOTH minQty and minNotional; rounding down can drop notional below the threshold.
  const minQtyByNotional = lot.minNotional > 0 ? lot.minNotional / markPrice : 0;
  const requiredQty = Math.max(raw, lot.minQty, minQtyByNotional);
  let q = ceilQtyToLot(requiredQty, lot);

  if (q > lot.maxQty) throw new Error(`Quantity ${q} exceeds maxQty for ${symbol}.`);
  const decimals = (lot.stepSize.toString().split(".")[1] || "").length;
  return q.toFixed(decimals);
};

type PositionRow = {
  symbol: string;
  positionAmt: string;
  entryPrice: string;
  leverage: string;
  positionSide?: string;
};

const fetchPositions = async (symbol: string): Promise<PositionRow[]> => {
  const sym = toBinanceSymbol(symbol);
  return fapiSignedGet<PositionRow[]>("/fapi/v2/positionRisk", { symbol: sym });
};

const aggregatePositions = (
  rows: PositionRow[]
): { longVol: number; shortVol: number; shortEntry: number | null } => {
  let longVol = 0;
  let shortVol = 0;
  let shortEntry: number | null = null;
  for (const p of rows) {
    const amt = Number(p.positionAmt);
    if (amt === 0) continue;
    const ps = (p.positionSide ?? "BOTH").toUpperCase();
    if (ps === "LONG" || (ps === "BOTH" && amt > 0)) {
      if (amt > 0) longVol += amt;
    }
    if (ps === "SHORT" || (ps === "BOTH" && amt < 0)) {
      if (amt < 0) {
        shortVol += Math.abs(amt);
        shortEntry = Number(p.entryPrice);
      }
    }
  }
  return { longVol, shortVol, shortEntry };
};

const placeMarket = async (opts: {
  symbol: string;
  side: "BUY" | "SELL";
  quantity: string;
  reduceOnly?: boolean;
}): Promise<void> => {
  const params: Record<string, string | number | boolean | undefined> = {
    symbol: toBinanceSymbol(opts.symbol),
    side: opts.side,
    type: "MARKET",
    quantity: opts.quantity
  };
  if (opts.reduceOnly) params.reduceOnly = true;
  await fapiSignedPost("/fapi/v1/order", params);
};

export const hasActiveReverseForSymbol = (symbol: string): boolean => {
  const sym = toBinanceSymbol(symbol);
  for (const r of runs.values()) {
    if (r.status === "running" && toBinanceSymbol(r.symbol) === sym) return true;
  }
  return false;
};

export const getReverseRunDtoById = (id: string): ReverseStrategyRunDto | undefined => {
  const r = runs.get(id);
  return r ? toReverseRunDto(r) : undefined;
};

export const listReverseRunsDto = (): ReverseStrategyRunDto[] =>
  Array.from(runs.values())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(toReverseRunDto);

export interface StartReverseStrategyBody {
  symbol: string;
  openType: 1 | 2;
  variant: ReverseStrategyVariant;
  /** When true, place $1@100x long and $1@100x short at current mark, then start monitoring. */
  bootstrap?: boolean;
  leverage?: number;
  /** Starting margin (USDT) per side. Milestone adds are multiplied by this value. Default = 1. */
  startMarginUsdt?: number;
}

export const startReverseStrategy = async (body: StartReverseStrategyBody): Promise<ReverseStrategyRunDto> => {
  const symbol = body.symbol?.trim();
  if (!symbol) throw new Error("symbol is required.");
  if (body.openType !== 1 && body.openType !== 2) throw new Error("openType must be 1 (isolated) or 2 (cross).");
  if (body.variant !== "200" && body.variant !== "300") throw new Error('variant must be "200" or "300".');

  if (hasActiveReverseForSymbol(symbol)) {
    throw new Error("A reverse strategy is already running for this symbol.");
  }
  if (hasActivePlanForSymbol(symbol)) {
    throw new Error("An active step plan exists for this symbol. Stop it before starting a reverse strategy.");
  }

  const leverage = Number.isFinite(Number(body.leverage)) && Number(body.leverage) >= 1 ? Number(body.leverage) : DEFAULT_LEVERAGE;
  const startMarginUsdt =
    Number.isFinite(Number(body.startMarginUsdt)) && Number(body.startMarginUsdt) > 0
      ? Number(body.startMarginUsdt)
      : DEFAULT_START_MARGIN_USDT;
  const sym = toBinanceSymbol(symbol);
  await setMarginAndLeverage(sym, body.openType, leverage);

  let refPrice: number;

  if (body.bootstrap === true) {
    const mark = await fetchMarkPrice(sym);
    const qtyStr = await qtyFromMarginUsdt(sym, mark, startMarginUsdt, leverage);
    await placeMarket({ symbol: sym, side: "BUY", quantity: qtyStr });
    await placeMarket({ symbol: sym, side: "SELL", quantity: qtyStr });
    refPrice = await fetchMarkPrice(sym);
  } else {
    const rows = await fetchPositions(sym);
    const { longVol, shortVol, shortEntry } = aggregatePositions(rows);
    if (shortVol <= 0 || !shortEntry || shortEntry <= 0) {
      throw new Error("bootstrap=false requires an open short position. Enable bootstrap or open a short first.");
    }
    if (longVol <= 0) {
      throw new Error("bootstrap=false requires an open long position for the hedged setup.");
    }
    refPrice = shortEntry;
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  const run: ReverseStrategyRun = {
    id,
    symbol: sym,
    openType: body.openType,
    leverage,
    variant: body.variant,
    startMarginUsdt,
    refPrice,
    status: "running",
    firedMilestoneIndices: new Set(),
    breachArmed: false,
    lowSinceBreach: null,
    message: body.bootstrap
      ? `Running (${body.variant}% ladder). Reference ${refPrice.toFixed(6)} from post-bootstrap mark.`
      : `Running (${body.variant}% ladder). Reference ${refPrice.toFixed(6)} from short entry at start.`,
    createdAt: now,
    updatedAt: now
  };
  runs.set(id, run);
  return toReverseRunDto(run);
};

export const stopReverseStrategy = (id: string): ReverseStrategyRunDto | null => {
  const r = runs.get(id);
  if (!r) return null;
  if (r.status === "running") {
    r.status = "stopped";
    r.message = "Stopped by user.";
    r.breachArmed = false;
    r.lowSinceBreach = null;
  }
  r.updatedAt = Date.now();
  return toReverseRunDto(r);
};

/** Active floor = min-bound of the highest trigger tier reached (strictest). */
const currentFloorPct = (run: ReverseStrategyRun, milestones: ReverseMilestone[]): number | null => {
  let maxIdx = -1;
  for (const idx of run.firedMilestoneIndices) maxIdx = Math.max(maxIdx, idx);
  if (maxIdx < 0) return null;
  return milestones[maxIdx]?.minBoundPct ?? null;
};

export const tickReverseStrategies = async (): Promise<void> => {
  for (const run of runs.values()) {
    if (run.status !== "running") continue;
    if (tickLocks.has(run.id)) continue;
    tickLocks.add(run.id);

    try {
      const milestones = milestonesForVariant(run.variant);
      const mark = await fetchMarkPrice(run.symbol);

      if (run.status === "running") {
        for (let i = 0; i < milestones.length; i++) {
          if (run.firedMilestoneIndices.has(i)) continue;
          const m = milestones[i];
          const triggerPx = run.refPrice * (m.triggerPct / 100);
          if (mark >= triggerPx) {
            const startMargin =
              Number.isFinite(Number(run.startMarginUsdt)) && Number(run.startMarginUsdt) > 0
                ? Number(run.startMarginUsdt)
                : DEFAULT_START_MARGIN_USDT;
            const scaledMargin = m.marginUsdt * startMargin;
            const qtyStr = await qtyFromMarginUsdt(run.symbol, mark, scaledMargin, run.leverage);
            await setMarginAndLeverage(run.symbol, run.openType, run.leverage);
            await placeMarket({ symbol: run.symbol, side: "SELL", quantity: qtyStr });
            run.firedMilestoneIndices.add(i);
            run.message = `Milestone ${m.triggerPct}%: added ~$${scaledMargin} margin short (${qtyStr} ${run.symbol}).`;
          }
        }
      }

      const floorPct = currentFloorPct(run, milestones);
      if (run.status === "running" && floorPct !== null) {
        const floorPrice = run.refPrice * (floorPct / 100);
        if (mark >= floorPrice) {
          if (run.breachArmed) {
            run.breachArmed = false;
            run.lowSinceBreach = null;
            run.message = `Price recovered to min bound (${floorPct}% of ref). Breach watch cleared.`;
          }
        } else {
          if (!run.breachArmed) {
            run.breachArmed = true;
            run.lowSinceBreach = mark;
            run.message = `Below min bound (${floorPct}% of ref). Watching for rebound to close short.`;
          } else if (run.lowSinceBreach !== null) {
            run.lowSinceBreach = Math.min(run.lowSinceBreach, mark);
            const reboundLine = run.lowSinceBreach * (1 + REBOUND_BPS);
            if (mark > reboundLine) {
              const rows = await fetchPositions(run.symbol);
              const { shortVol } = aggregatePositions(rows);
              if (shortVol > 0) {
                await setMarginAndLeverage(run.symbol, run.openType, run.leverage);
                const lot = await getLotFilter(run.symbol);
                const q = floorQtyToLot(shortVol, lot);
                if (q >= lot.minQty) {
                  const decimals = (lot.stepSize.toString().split(".")[1] || "").length;
                  const qtyStr = q.toFixed(decimals);
                  await placeMarket({ symbol: run.symbol, side: "BUY", quantity: qtyStr, reduceOnly: true });
                }
              }
              run.status = "completed";
              run.breachArmed = false;
              run.lowSinceBreach = null;
              run.message = "Short closed on rebound after min-bound breach.";
            }
          }
        }
      }

      run.updatedAt = Date.now();
    } catch (e) {
      run.status = "failed";
      run.message = e instanceof Error ? e.message : "Reverse strategy error.";
      run.updatedAt = Date.now();
    } finally {
      tickLocks.delete(run.id);
    }
  }
};
