import { Request, Response } from "express";
import { Account } from "../models/Account.model";
import { mexcPrivateGet, mexcPrivatePost, mexcPublicGet } from "../services/mexc.service";

const requireAccountKeys = async (email: string): Promise<{ accessKey: string; secretKey: string }> => {
  const account = await Account.findOne({ email: email.toLowerCase() });
  if (!account) {
    throw new Error("Account not found.");
  }

  if (!account.mexcAPIKey || !account.mexcSecretKey) {
    throw new Error("MEXC API keys are not set in your account settings.");
  }

  return { accessKey: account.mexcAPIKey, secretKey: account.mexcSecretKey };
};

export const getIndexPriceCandles = async (req: Request, res: Response): Promise<void> => {
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

  const response = await mexcPublicGet<unknown>(`/api/v1/contract/kline/index_price/${symbol}`, {
    interval,
    start,
    end
  });

  res.status(200).json({ data: response });
};

export const getAccountAssets = async (req: Request, res: Response): Promise<void> => {
  const { email } = req.query as { email?: string };
  if (!email) {
    res.status(400).json({ message: "email is required." });
    return;
  }

  try {
    const { accessKey, secretKey } = await requireAccountKeys(email);
    const response = await mexcPrivateGet<unknown>(accessKey, secretKey, "/api/v1/private/account/assets", {});
    res.status(200).json({ data: response });
  } catch (err) {
    res.status(400).json({ message: err instanceof Error ? err.message : "Failed to load account assets." });
  }
};

export const getOpenPositions = async (req: Request, res: Response): Promise<void> => {
  const { email, symbol, positionId } = req.query as {
    email?: string;
    symbol?: string;
    positionId?: string;
  };

  if (!email) {
    res.status(400).json({ message: "email is required." });
    return;
  }

  try {
    const { accessKey, secretKey } = await requireAccountKeys(email);
    const response = await mexcPrivateGet<unknown>(
      accessKey,
      secretKey,
      "/api/v1/private/position/open_positions",
      {
        symbol,
        positionId
      }
    );
    res.status(200).json({ data: response });
  } catch (err) {
    res.status(400).json({ message: err instanceof Error ? err.message : "Failed to load open positions." });
  }
};

export const submitOrder = async (req: Request, res: Response): Promise<void> => {
  const { email, symbol, price, vol, leverage, side, type, openType, externalOid, positionId } = req.body as {
    email?: string;
    symbol?: string;
    price?: number | string;
    vol?: number | string;
    leverage?: number;
    side?: number;
    type?: number;
    openType?: number;
    externalOid?: string;
    positionId?: number;
  };

  const isOpening = side === 1 || side === 3;
  if (!email || !symbol || price === undefined || vol === undefined || side === undefined || type === undefined || openType === undefined) {
    res.status(400).json({ message: "email, symbol, price, vol, side, type, and openType are required." });
    return;
  }

  if (isOpening && leverage === undefined) {
    res.status(400).json({ message: "leverage is required when opening a position (side 1 or 3)." });
    return;
  }

  try {
    const { accessKey, secretKey } = await requireAccountKeys(email);
    const response = await mexcPrivatePost<unknown>(
      accessKey,
      secretKey,
      "/api/v1/private/order/submit",
      {},
      {
        symbol,
        price,
        vol,
        leverage: leverage ?? undefined,
        side,
        type,
        openType,
        externalOid: externalOid ?? undefined,
        positionId: positionId ?? undefined
      }
    );
    res.status(200).json({ data: response });
  } catch (err) {
    res.status(400).json({ message: err instanceof Error ? err.message : "Failed to submit order." });
  }
};

export const cancelOrders = async (req: Request, res: Response): Promise<void> => {
  const { email, orderIds } = req.body as { email?: string; orderIds?: Array<number | string> };
  if (!email || !Array.isArray(orderIds) || orderIds.length === 0) {
    res.status(400).json({ message: "email and orderIds are required." });
    return;
  }

  const normalized = orderIds.slice(0, 50).map((v) => Number(v));

  try {
    const { accessKey, secretKey } = await requireAccountKeys(email);
    // MEXC docs: cancel expects an order id list.
    const response = await mexcPrivatePost<unknown>(accessKey, secretKey, "/api/v1/private/order/cancel", {}, normalized);
    res.status(200).json({ data: response });
  } catch (err) {
    res.status(400).json({ message: err instanceof Error ? err.message : "Failed to cancel orders." });
  }
};

