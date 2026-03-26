const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api";

export interface CandleIndexPriceResponse {
  success: boolean;
  code: number;
  data: {
    time: number[];
    open: number[];
    close: number[];
    high: number[];
    low: number[];
    vol?: number[];
    amount?: number[];
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
    state?: number;
    updateTime?: number;
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
  data:
    | Array<{
        orderId: number | string;
        symbol: string;
        price: number;
        vol: number;
        dealVol?: number;
        side: number;
        category?: number;
        orderType?: number;
        createTime?: number;
        state?: number;
      }>
    | {
        pageSize: number;
        totalCount: number;
        totalPage: number;
        currentPage: number;
        resultList: Array<{
          orderId: number | string;
          symbol: string;
          price: number;
          vol: number;
          dealVol?: number;
          side: number;
          category?: number;
          orderType?: number;
          createTime?: number;
          state?: number;
        }>;
      };
}

export const fetchIndexPriceCandles = async (payload: {
  symbol: string;
  interval?: string;
}): Promise<CandleIndexPriceResponse> => {
  const params = new URLSearchParams();
  params.set("symbol", payload.symbol);
  if (payload.interval) params.set("interval", payload.interval);

  const response = await fetch(`${API_URL}/mexc/index-price-candles?${params.toString()}`);
  if (!response.ok) {
    const body = (await response.json()) as { message?: string };
    throw new Error(body.message ?? "Failed to fetch index price candles.");
  }

  const body = (await response.json()) as { data: CandleIndexPriceResponse };
  return body.data;
};

export const fetchAccountAssets = async (email: string): Promise<AccountAssetsResponse> => {
  const response = await fetch(`${API_URL}/mexc/account/assets?email=${encodeURIComponent(email)}`);
  if (!response.ok) {
    const body = (await response.json()) as { message?: string };
    throw new Error(body.message ?? "Failed to fetch account assets.");
  }
  const body = (await response.json()) as { data: AccountAssetsResponse };
  return body.data;
};

export const fetchOpenPositions = async (payload: {
  email: string;
  symbol?: string;
}): Promise<OpenPositionsResponse> => {
  const params = new URLSearchParams();
  params.set("email", payload.email);
  if (payload.symbol) params.set("symbol", payload.symbol);

  const response = await fetch(`${API_URL}/mexc/position/open?${params.toString()}`);
  if (!response.ok) {
    const body = (await response.json()) as { message?: string };
    throw new Error(body.message ?? "Failed to fetch open positions.");
  }
  const body = (await response.json()) as { data: OpenPositionsResponse };
  return body.data;
};

export const fetchOpenOrders = async (payload: {
  email: string;
  symbol?: string;
  pageNum?: number;
  pageSize?: number;
}): Promise<OpenOrdersResponse> => {
  const params = new URLSearchParams();
  params.set("email", payload.email);
  if (payload.symbol) params.set("symbol", payload.symbol);
  if (payload.pageNum) params.set("page_num", String(payload.pageNum));
  if (payload.pageSize) params.set("page_size", String(payload.pageSize));

  const response = await fetch(`${API_URL}/mexc/order/open?${params.toString()}`);
  if (!response.ok) {
    const body = (await response.json()) as { message?: string };
    throw new Error(body.message ?? "Failed to fetch open orders.");
  }
  const body = (await response.json()) as { data: OpenOrdersResponse };
  return body.data;
};

export const submitMarketOrder = async (payload: {
  email: string;
  symbol: string;
  price: number;
  vol: number;
  leverage?: number;
  side: number;
  openType: number;
}): Promise<{ orderId?: string; data?: unknown }> => {
  // MEXC docs: type=5 is market
  const response = await fetch(`${API_URL}/mexc/order/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: payload.email,
      symbol: payload.symbol,
      price: payload.price,
      vol: payload.vol,
      leverage: payload.leverage,
      side: payload.side,
      type: 5,
      openType: payload.openType
    })
  });

  if (!response.ok) {
    const body = (await response.json()) as { message?: string };
    throw new Error(body.message ?? "Failed to submit order.");
  }

  const body = (await response.json()) as {
    data: {
      data?: unknown;
    };
  };

  const mexcInner = body.data?.data;
  if (mexcInner && typeof mexcInner === "object" && "orderId" in mexcInner) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderId = (mexcInner as any).orderId;
    return { orderId: String(orderId) };
  }

  if (mexcInner !== undefined) {
    return { data: mexcInner };
  }

  return { data: body.data };
};

export const cancelOrders = async (payload: { email: string; orderIds: number[] }): Promise<unknown> => {
  const response = await fetch(`${API_URL}/mexc/order/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: payload.email,
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

