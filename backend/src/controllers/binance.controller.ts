import { Request, Response } from "express";
import {
  fapiCancelFuturesOrderOrAlgo,
  fapiPlaceConditionalAlgoOrder,
  fapiPublicGet,
  fapiSignedGet,
  fapiSignedPost,
  sapiSignedPost
} from "../services/binance.service";

const wrap = <T>(data: T): { success: true; code: number; data: T } => ({
  success: true,
  code: 0,
  data
});

const toBinanceSymbol = (s: string): string => s.trim().toUpperCase().replace(/[_\-/]/g, "");

const INTERVAL_MAP: Record<string, string> = {
  Min1: "1m",
  Min5: "5m",
  Min15: "15m",
  Min30: "30m",
  Min60: "1h",
  Hour4: "4h",
  Hour8: "8h",
  Day1: "1d"
};

const mapMexcSideToBinance = (side: number): { binanceSide: "BUY" | "SELL"; reduceOnly: boolean } => {
  if (side === 1) return { binanceSide: "BUY", reduceOnly: false };
  if (side === 3) return { binanceSide: "SELL", reduceOnly: false };
  if (side === 4) return { binanceSide: "SELL", reduceOnly: true };
  if (side === 2) return { binanceSide: "BUY", reduceOnly: true };
  return { binanceSide: "BUY", reduceOnly: false };
};

const setMarginAndLeverage = async (symbol: string, openType: number, leverage?: number): Promise<void> => {
  const marginType = openType === 1 ? "ISOLATED" : "CROSSED";
  try {
    await fapiSignedPost("/fapi/v1/marginType", { symbol, marginType });
  } catch {
    // Often -4046 "No need to change margin type"
  }
  if (leverage !== undefined && leverage >= 1) {
    await fapiSignedPost("/fapi/v1/leverage", { symbol, leverage: Math.floor(leverage) });
  }
};

export const getMarkPriceCandles = async (req: Request, res: Response): Promise<void> => {
  const { symbol, interval, start, end } = req.query as {
    symbol?: string;
    interval?: string;
    start?: string;
    end?: string;
  };

  if (!symbol) {
    res.status(400).json({ message: "symbol is required." });
    return;
  }

  const sym = toBinanceSymbol(symbol);
  const binanceInterval = INTERVAL_MAP[interval ?? ""] ?? interval ?? "15m";
  const raw = await fapiPublicGet<number[][]>(
    "/fapi/v1/markPriceKlines",
    {
      symbol: sym,
      interval: binanceInterval,
      startTime: start,
      endTime: end,
      limit: 500
    }
  );

  const time: number[] = [];
  const open: number[] = [];
  const high: number[] = [];
  const low: number[] = [];
  const close: number[] = [];
  for (const row of raw) {
    if (!row?.length) continue;
    time.push(Math.floor(Number(row[0]) / 1000));
    open.push(Number(row[1]));
    high.push(Number(row[2]));
    low.push(Number(row[3]));
    close.push(Number(row[4]));
  }

  res.status(200).json({ data: wrap({ time, open, high, low, close }) });
};

export const getBookTicker = async (req: Request, res: Response): Promise<void> => {
  const { symbol } = req.query as { symbol?: string };

  try {
    if (symbol) {
      const sym = toBinanceSymbol(symbol);
      const row = await fapiPublicGet<{ symbol: string; bidPrice: string; askPrice: string }>("/fapi/v1/ticker/bookTicker", { symbol: sym });
      res.status(200).json({
        data: wrap([
          {
            symbol: row.symbol,
            bid1: Number(row.bidPrice),
            ask1: Number(row.askPrice)
          }
        ])
      });
      return;
    }

    const rows = await fapiPublicGet<Array<{ symbol: string; bidPrice: string; askPrice: string }>>("/fapi/v1/ticker/bookTicker");
    const data = rows.map((r) => ({
      symbol: r.symbol,
      bid1: Number(r.bidPrice),
      ask1: Number(r.askPrice)
    }));
    res.status(200).json({ data: wrap(data) });
  } catch (err) {
    res.status(400).json({ message: err instanceof Error ? err.message : "Failed to load book ticker." });
  }
};

export const getAccountAssets = async (_req: Request, res: Response): Promise<void> => {
  try {
    const balances = await fapiSignedGet<
      Array<{
        asset: string;
        balance: string;
        availableBalance: string;
        crossWalletBalance?: string;
        crossUnPnl?: string;
      }>
    >("/fapi/v2/balance");

    const data = balances.map((b) => {
      const avail = Number(b.availableBalance);
      const bal = Number(b.balance);
      const crossPnl = Number(b.crossUnPnl ?? 0);
      return {
        currency: b.asset,
        availableBalance: avail,
        frozenBalance: Math.max(0, bal - avail),
        equity: Number(b.crossWalletBalance ?? b.balance),
        unrealized: crossPnl,
        availableCash: avail
      };
    });

    res.status(200).json({ data: wrap(data) });
  } catch (err) {
    res.status(400).json({ message: err instanceof Error ? err.message : "Failed to load balances." });
  }
};

export const getOpenPositions = async (req: Request, res: Response): Promise<void> => {
  const { symbol } = req.query as { symbol?: string };

  try {
    const rows = await fapiSignedGet<
      Array<{
        symbol: string;
        positionAmt: string;
        entryPrice: string;
        unrealizedProfit: string;
        leverage: string;
        liquidationPrice: string;
        positionSide: string;
      }>
    >("/fapi/v2/positionRisk", symbol ? { symbol: toBinanceSymbol(symbol) } : {});

    const data = rows
      .filter((p) => Number(p.positionAmt) !== 0)
      .map((p, idx) => ({
        positionId: `${p.symbol}-${p.positionSide}-${idx}`,
        symbol: p.symbol,
        positionType: Number(p.positionAmt) > 0 ? 1 : 2,
        holdVol: Math.abs(Number(p.positionAmt)),
        holdAvgPrice: Number(p.entryPrice),
        realised: 0,
        leverage: Number(p.leverage),
        marginRatio: 0,
        liquidatePrice: Number(p.liquidationPrice)
      }));

    res.status(200).json({ data: wrap(data) });
  } catch (err) {
    res.status(400).json({ message: err instanceof Error ? err.message : "Failed to load positions." });
  }
};

export const getOpenOrders = async (req: Request, res: Response): Promise<void> => {
  const { symbol } = req.query as { symbol?: string };

  try {
    const rows = await fapiSignedGet<
      Array<{
        orderId: number;
        symbol: string;
        price: string;
        origQty: string;
        executedQty: string;
        side: string;
        type: string;
        status: string;
        time: number;
      }>
    >("/fapi/v1/openOrders", symbol ? { symbol: toBinanceSymbol(symbol) } : {});

    const data = rows.map((o) => ({
      orderId: o.orderId,
      symbol: o.symbol,
      price: Number(o.price),
      vol: Number(o.origQty),
      dealVol: Number(o.executedQty),
      side: o.side === "BUY" ? 1 : 3,
      orderType: o.type,
      createTime: o.time,
      state: o.status
    }));

    res.status(200).json({ data: wrap(data) });
  } catch (err) {
    res.status(400).json({ message: err instanceof Error ? err.message : "Failed to load open orders." });
  }
};

export const submitOrder = async (req: Request, res: Response): Promise<void> => {
  const { symbol, price, vol, leverage, side, type, openType } = req.body as {
    symbol?: string;
    price?: number | string;
    vol?: number | string;
    leverage?: number;
    side?: number;
    type?: number;
    openType?: number;
  };

  const isOpening = side === 1 || side === 3;
  if (!symbol || vol === undefined || side === undefined || type === undefined || openType === undefined) {
    res.status(400).json({ message: "symbol, vol, side, type, and openType are required." });
    return;
  }

  if (type !== 5 && (price === undefined || price === "")) {
    res.status(400).json({ message: "price is required for non-market orders." });
    return;
  }

  if (isOpening && leverage === undefined) {
    res.status(400).json({ message: "leverage is required when opening a position (side 1 or 3)." });
    return;
  }

  const sym = toBinanceSymbol(symbol);
  const { binanceSide, reduceOnly } = mapMexcSideToBinance(side);
  const qty = String(vol);

  try {
    await setMarginAndLeverage(sym, openType, isOpening ? leverage : leverage ?? undefined);

    const params: Record<string, string | number | boolean | undefined> = {
      symbol: sym,
      side: binanceSide,
      quantity: qty
    };
    if (reduceOnly) params.reduceOnly = true;

    if (type === 5) {
      params.type = "MARKET";
    } else if (type === 6) {
      params.type = "LIMIT";
      params.price = String(price);
      params.timeInForce = "IOC";
    } else {
      params.type = "LIMIT";
      params.price = String(price);
      if (type === 2) params.timeInForce = "GTX";
      else if (type === 3) params.timeInForce = "IOC";
      else if (type === 4) params.timeInForce = "FOK";
      else params.timeInForce = "GTC";
    }

    const order = await fapiSignedPost<{ orderId: number; clientOrderId?: string }>("/fapi/v1/order", params);
    res.status(200).json({ data: wrap(order) });
  } catch (err) {
    res.status(400).json({ message: err instanceof Error ? err.message : "Failed to submit order." });
  }
};

/** Maps legacy trigger fields to Binance STOP / STOP_MARKET (USDⓈ-M). */
export const submitTriggerOrder = async (req: Request, res: Response): Promise<void> => {
  const { symbol, price, vol, leverage, side, openType, triggerPrice, orderType } = req.body as {
    symbol?: string;
    price?: number | string;
    vol?: number | string;
    leverage?: number;
    side?: number;
    openType?: number;
    triggerPrice?: number | string;
    orderType?: number;
  };

  const isOpening = side === 1 || side === 3;
  if (!symbol || vol === undefined || side === undefined || openType === undefined || triggerPrice === undefined) {
    res.status(400).json({ message: "symbol, vol, side, openType, and triggerPrice are required." });
    return;
  }

  if (isOpening && leverage === undefined) {
    res.status(400).json({ message: "leverage is required when opening a position (side 1 or 3)." });
    return;
  }

  const sym = toBinanceSymbol(symbol);
  const { binanceSide, reduceOnly } = mapMexcSideToBinance(side);
  const execMarket = orderType === 5;

  try {
    await setMarginAndLeverage(sym, openType, isOpening ? leverage : leverage ?? undefined);

    const limitPrice =
      !execMarket && price !== undefined && price !== "" ? String(price) : undefined;
    if (!execMarket && !limitPrice) {
      res.status(400).json({ message: "price is required for limit stop (STOP) trigger orders." });
      return;
    }

    const { algoId } = await fapiPlaceConditionalAlgoOrder({
      symbol: sym,
      side: binanceSide,
      orderType: execMarket ? "STOP_MARKET" : "STOP",
      triggerPrice: String(triggerPrice),
      quantity: String(vol),
      limitPrice,
      workingType: "CONTRACT_PRICE",
      reduceOnly
    });

    res.status(200).json({ data: wrap({ orderId: algoId, algoId }) });
  } catch (err) {
    res.status(400).json({ message: err instanceof Error ? err.message : "Failed to submit trigger order." });
  }
};

/**
 * Volume Participation (VP) algo order — SAPI.
 * https://developers.binance.com/docs/algo/future-algo
 */
export const submitAlgoVpOrder = async (req: Request, res: Response): Promise<void> => {
  const { symbol, side, quantity, urgency, positionSide, reduceOnly, limitPrice, clientAlgoId } = req.body as {
    symbol?: string;
    side?: "BUY" | "SELL";
    quantity?: number | string;
    urgency?: "LOW" | "MEDIUM" | "HIGH";
    positionSide?: "BOTH" | "LONG" | "SHORT";
    reduceOnly?: boolean;
    limitPrice?: number | string;
    clientAlgoId?: string;
  };

  if (!symbol || !side || quantity === undefined || !urgency) {
    res.status(400).json({ message: "symbol, side, quantity, and urgency are required." });
    return;
  }

  try {
    const params: Record<string, string | number | boolean | undefined> = {
      symbol: toBinanceSymbol(symbol),
      side,
      quantity: String(quantity),
      urgency,
      positionSide: positionSide ?? "BOTH",
      reduceOnly: reduceOnly === true ? true : undefined,
      limitPrice: limitPrice !== undefined && limitPrice !== "" ? String(limitPrice) : undefined,
      clientAlgoId: clientAlgoId?.trim() || undefined
    };

    const out = await sapiSignedPost<Record<string, unknown>>("/sapi/v1/algo/futures/newOrderVp", params);
    res.status(200).json({ data: wrap(out) });
  } catch (err) {
    res.status(400).json({ message: err instanceof Error ? err.message : "Failed to submit VP algo order." });
  }
};

export const cancelOrders = async (req: Request, res: Response): Promise<void> => {
  const { symbol, orderIds } = req.body as { symbol?: string; orderIds?: Array<number | string> };

  if (!symbol || !Array.isArray(orderIds) || orderIds.length === 0) {
    res.status(400).json({ message: "symbol and orderIds are required." });
    return;
  }

  const sym = toBinanceSymbol(symbol);
  const results: unknown[] = [];

  try {
    for (const id of orderIds.slice(0, 20)) {
      const idNum = typeof id === "string" ? Number(id) : id;
      if (!Number.isFinite(idNum)) {
        res.status(400).json({ message: "Each orderId must be a number." });
        return;
      }
      const r = await fapiCancelFuturesOrderOrAlgo(sym, idNum);
      results.push(r);
    }
    res.status(200).json({ data: wrap(results) });
  } catch (err) {
    res.status(400).json({ message: err instanceof Error ? err.message : "Failed to cancel orders." });
  }
};
