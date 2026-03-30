const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api";

const readApiErrorMessage = async (response: Response, fallback: string): Promise<string> => {
  let parsedMessage = "";
  try {
    const raw = await response.text();
    if (raw) {
      const parsed = JSON.parse(raw) as { message?: string; error?: string; details?: string };
      parsedMessage = parsed.message ?? parsed.error ?? parsed.details ?? "";
    }
  } catch {
    // non-JSON
  }

  const base = parsedMessage || fallback;
  if (response.status === 400) {
    return `Bad request: ${base}`;
  }

  if (response.status === 401 || response.status === 403) {
    return "Authentication/permission error. Check BINANCE_API_KEY (futures trading enabled) on the server.";
  }

  return base;
};

export interface CandleMarkPriceResponse {
  success: boolean;
  code: number;
  data: {
    time: number[];
    open: number[];
    close: number[];
    high: number[];
    low: number[];
  };
}

export interface OpenPositionsResponse {
  success: boolean;
  code: number;
  data: Array<{
    positionId: number | string;
    symbol: string;
    positionType: number;
    holdVol: number;
    holdAvgPrice: number;
    realised: number;
    leverage: number;
    marginRatio: number;
    liquidatePrice?: number;
  }>;
}

export interface AccountAssetsResponse {
  success: boolean;
  code: number;
  data: Array<{
    currency: string;
    availableBalance: number;
    frozenBalance: number;
    equity: number;
    unrealized: number;
    availableCash: number;
  }>;
}

export interface OpenOrdersResponse {
  success: boolean;
  code: number;
  data: Array<{
    orderId: number | string;
    symbol: string;
    price: number;
    vol: number;
    dealVol?: number;
    side: number;
    orderType?: string;
    createTime?: number;
    state?: string;
  }>;
}

export interface BookTickerResponse {
  success: boolean;
  code: number;
  data: Array<{
    symbol: string;
    bid1?: number;
    ask1?: number;
  }>;
}

export const fetchMarkPriceCandles = async (payload: {
  symbol: string;
  interval?: string;
}): Promise<CandleMarkPriceResponse> => {
  const params = new URLSearchParams();
  params.set("symbol", payload.symbol);
  if (payload.interval) params.set("interval", payload.interval);

  const response = await fetch(`${API_URL}/binance/mark-price-candles?${params.toString()}`);
  if (!response.ok) {
    const body = (await response.json()) as { message?: string };
    throw new Error(body.message ?? "Failed to fetch mark price candles.");
  }

  const body = (await response.json()) as { data: CandleMarkPriceResponse };
  return body.data;
};

export const fetchAccountAssets = async (): Promise<AccountAssetsResponse> => {
  const response = await fetch(`${API_URL}/binance/account/assets`);
  if (!response.ok) {
    const body = (await response.json()) as { message?: string };
    throw new Error(body.message ?? "Failed to fetch account assets.");
  }
  const body = (await response.json()) as { data: AccountAssetsResponse };
  return body.data;
};

export const fetchOpenPositions = async (payload: { symbol?: string }): Promise<OpenPositionsResponse> => {
  const params = new URLSearchParams();
  if (payload.symbol) params.set("symbol", payload.symbol);

  const response = await fetch(`${API_URL}/binance/position/open?${params.toString()}`);
  if (!response.ok) {
    const body = (await response.json()) as { message?: string };
    throw new Error(body.message ?? "Failed to fetch open positions.");
  }
  const body = (await response.json()) as { data: OpenPositionsResponse };
  return body.data;
};

export const fetchOpenOrders = async (payload: { symbol?: string }): Promise<OpenOrdersResponse> => {
  const params = new URLSearchParams();
  if (payload.symbol) params.set("symbol", payload.symbol);

  const response = await fetch(`${API_URL}/binance/order/open?${params.toString()}`);
  if (!response.ok) {
    const body = (await response.json()) as { message?: string };
    throw new Error(body.message ?? "Failed to fetch open orders.");
  }
  const body = (await response.json()) as { data: OpenOrdersResponse };
  return body.data;
};

export const fetchBookTicker = async (symbol?: string): Promise<BookTickerResponse> => {
  const params = new URLSearchParams();
  if (symbol) params.set("symbol", symbol);
  const response = await fetch(`${API_URL}/binance/book-ticker?${params.toString()}`);
  if (!response.ok) {
    const body = (await response.json()) as { message?: string };
    throw new Error(body.message ?? "Failed to fetch book ticker.");
  }
  const body = (await response.json()) as { data: BookTickerResponse };
  return body.data;
};

export const submitOrder = async (payload: {
  symbol: string;
  price?: number;
  vol: number;
  leverage?: number;
  side: number;
  type: number;
  openType: number;
}): Promise<{ orderId?: string; data?: unknown }> => {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/binance/order/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: payload.symbol,
        price: payload.price,
        vol: payload.vol,
        leverage: payload.leverage,
        side: payload.side,
        type: payload.type,
        openType: payload.openType
      })
    });
  } catch {
    throw new Error("Network error while submitting order. Check backend server/API URL and try again.");
  }

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, "Failed to submit order."));
  }

  const body = (await response.json()) as { data: { data?: { orderId?: number } } };
  const inner = body.data?.data;
  if (inner && typeof inner === "object" && "orderId" in inner && inner.orderId !== undefined) {
    return { orderId: String(inner.orderId) };
  }
  if (inner !== undefined) {
    return { data: inner };
  }
  return { data: body.data };
};

export const submitTriggerOrder = async (payload: {
  symbol: string;
  price?: number;
  vol: number;
  leverage?: number;
  side: number;
  openType: number;
  triggerPrice: number;
  triggerType: number;
  executeCycle: number;
  orderType: number;
  trend: number;
}): Promise<{ orderId?: string; data?: unknown }> => {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/binance/order/submit-trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: payload.symbol,
        price: payload.price,
        vol: payload.vol,
        leverage: payload.leverage,
        side: payload.side,
        openType: payload.openType,
        triggerPrice: payload.triggerPrice,
        orderType: payload.orderType
      })
    });
  } catch {
    throw new Error("Network error while submitting trigger order. Check backend server/API URL and try again.");
  }

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, "Failed to submit trigger order."));
  }

  const body = (await response.json()) as { data: { data?: { orderId?: number } } };
  const inner = body.data?.data;
  if (inner && typeof inner === "object" && "orderId" in inner && inner.orderId !== undefined) {
    return { orderId: String(inner.orderId) };
  }
  if (inner !== undefined) {
    return { data: inner };
  }
  return { data: body.data };
};

export const cancelOrders = async (payload: { symbol: string; orderIds: number[] }): Promise<unknown> => {
  const response = await fetch(`${API_URL}/binance/order/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      symbol: payload.symbol,
      orderIds: payload.orderIds
    })
  });

  if (!response.ok) {
    const body = (await response.json()) as { message?: string };
    throw new Error(body.message ?? "Failed to cancel orders.");
  }

  const body = (await response.json()) as { data: unknown };
  return body.data;
};
