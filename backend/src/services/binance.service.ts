import crypto from "crypto";

const FAPI_BASE = process.env.BINANCE_FAPI_BASE_URL ?? "https://fapi.binance.com";
const SAPI_BASE = process.env.BINANCE_SAPI_BASE_URL ?? "https://api.binance.com";
const DEFAULT_RECV_WINDOW = 10000;

let serverTimeOffsetMs = 0;
let lastServerTimeSync = 0;
const SERVER_TIME_TTL_MS = 60_000;

type BinanceSignatureType = "HMAC" | "ED25519";

type BinanceCredentials = {
  apiKey: string;
  signatureType: BinanceSignatureType;
  secret?: string;
  privateKey?: string;
};

const parseSignatureType = (): BinanceSignatureType => {
  const raw = (process.env.BINANCE_SIGNATURE_TYPE ?? "HMAC").trim().toUpperCase();
  return raw === "ED25519" ? "ED25519" : "HMAC";
};

const normalizePem = (raw: string): string => raw.replace(/\\n/g, "\n").trim();

export const getBinanceCredentials = (): BinanceCredentials => {
  const apiKey = process.env.BINANCE_API_KEY?.trim();
  const signatureType = parseSignatureType();
  if (!apiKey) {
    throw new Error("BINANCE_API_KEY must be set in the server environment (.env).");
  }

  if (signatureType === "ED25519") {
    const privateKeyRaw = process.env.BINANCE_PRIVATE_KEY?.trim() || process.env.BINANCE_API_SECRET?.trim();
    if (!privateKeyRaw) {
      throw new Error("For ED25519, set BINANCE_PRIVATE_KEY (PEM) or BINANCE_API_SECRET in .env.");
    }
    return { apiKey, signatureType, privateKey: normalizePem(privateKeyRaw) };
  }

  const secret = process.env.BINANCE_API_SECRET?.trim();
  if (!secret) {
    throw new Error("For HMAC, BINANCE_API_SECRET must be set in the server environment (.env).");
  }
  return { apiKey, signatureType, secret };
};

const hmacSha256Hex = (secret: string, payload: string): string => {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
};

const ed25519SignBase64 = (privateKey: string, payload: string): string => {
  const signature = crypto.sign(null, Buffer.from(payload), privateKey);
  return signature.toString("base64");
};

const signPayload = (credentials: BinanceCredentials, payload: string): string => {
  if (credentials.signatureType === "ED25519") {
    return ed25519SignBase64(credentials.privateKey as string, payload);
  }
  return hmacSha256Hex(credentials.secret as string, payload);
};

const buildSortedQuery = (params: Record<string, string | number | boolean | undefined>): string => {
  const keys = Object.keys(params).filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== "").sort();
  return keys.map((k) => `${k}=${encodeURIComponent(String(params[k]))}`).join("&");
};

const parseBinanceResponse = async <T>(response: Response, _context: string): Promise<T> => {
  const text = await response.text();
  let parsed: unknown = null;
  if (text.trim()) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      throw new Error(text.trim().slice(0, 200) || `Invalid response (HTTP ${response.status}).`);
    }
  }

  if (!response.ok) {
    const msg =
      parsed && typeof parsed === "object" && parsed !== null && "msg" in parsed
        ? String((parsed as { msg: string }).msg)
        : text.trim().slice(0, 300);
    throw new Error(msg || `HTTP ${response.status}`);
  }

  if (parsed && typeof parsed === "object" && parsed !== null) {
    const o = parsed as { code?: number; msg?: string; message?: string; success?: boolean };
    if (o.success === false) {
      throw new Error(o.msg ?? o.message ?? "Request failed.");
    }
    if (typeof o.code === "number" && o.code < 0) {
      throw new Error(o.msg ?? o.message ?? "Exchange error.");
    }
  }

  return parsed as T;
};

const getServerTimestamp = async (): Promise<number> => {
  const now = Date.now();
  if (lastServerTimeSync && now - lastServerTimeSync <= SERVER_TIME_TTL_MS) {
    const ts = Math.floor(now + serverTimeOffsetMs);
    return Number.isFinite(ts) ? ts : now;
  }

  // Compute offset using round-trip/2 to reduce impact of network latency.
  const t0 = Date.now();
  const res = await fetch(`${FAPI_BASE}/fapi/v1/time`, { headers: { Accept: "application/json" } });
  const body = (await res.json()) as { serverTime?: number };
  const t1 = Date.now();

  if (typeof body.serverTime === "number") {
    const mid = (t0 + t1) / 2;
    serverTimeOffsetMs = body.serverTime - mid;
    lastServerTimeSync = t1;
  } else {
    serverTimeOffsetMs = 0;
    lastServerTimeSync = t1;
  }

  // Binance requires integer millisecond timestamps.
  const ts = Math.floor(Date.now() + serverTimeOffsetMs);
  return Number.isFinite(ts) ? ts : Date.now();
};

export const fapiPublicGet = async <T>(path: string, query: Record<string, string | number | undefined> = {}): Promise<T> => {
  const qs = buildSortedQuery(query as Record<string, string | number | boolean | undefined>);
  const url = qs ? `${FAPI_BASE}${path}?${qs}` : `${FAPI_BASE}${path}`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  return parseBinanceResponse<T>(response, `FAPI GET ${path}`);
};

export const fapiSignedGet = async <T>(path: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<T> => {
  const credentials = getBinanceCredentials();
  const { apiKey } = credentials;
  const timestamp = await getServerTimestamp();
  const merged = { ...params, timestamp, recvWindow: DEFAULT_RECV_WINDOW };
  const qsBase = buildSortedQuery(merged);
  const signature = encodeURIComponent(signPayload(credentials, qsBase));
  const qs = `${qsBase}&signature=${signature}`;
  const url = `${FAPI_BASE}${path}?${qs}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json", "X-MBX-APIKEY": apiKey }
  });
  return parseBinanceResponse<T>(response, `FAPI signed GET ${path}`);
};

export const fapiSignedPost = async <T>(path: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<T> => {
  const credentials = getBinanceCredentials();
  const { apiKey } = credentials;
  const timestamp = await getServerTimestamp();
  const merged = { ...params, timestamp, recvWindow: DEFAULT_RECV_WINDOW };
  const qsBase = buildSortedQuery(merged);
  const signature = encodeURIComponent(signPayload(credentials, qsBase));
  const body = `${qsBase}&signature=${signature}`;
  const response = await fetch(`${FAPI_BASE}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "X-MBX-APIKEY": apiKey
    },
    body
  });
  return parseBinanceResponse<T>(response, `FAPI signed POST ${path}`);
};

export const fapiSignedDelete = async <T>(path: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<T> => {
  const credentials = getBinanceCredentials();
  const { apiKey } = credentials;
  const timestamp = await getServerTimestamp();
  const merged = { ...params, timestamp, recvWindow: DEFAULT_RECV_WINDOW };
  const qsBase = buildSortedQuery(merged);
  const signature = encodeURIComponent(signPayload(credentials, qsBase));
  const qs = `${qsBase}&signature=${signature}`;
  const url = `${FAPI_BASE}${path}?${qs}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: { Accept: "application/json", "X-MBX-APIKEY": apiKey }
  });
  return parseBinanceResponse<T>(response, `FAPI signed DELETE ${path}`);
};

/**
 * USDⓈ-M conditional stops (STOP / STOP_MARKET) must use POST /fapi/v1/algoOrder, not /fapi/v1/order.
 * @see https://developers.binance.com/docs/derivatives/usds-margined-futures/trade/rest-api/New-Algo-Order
 */
export const fapiPlaceConditionalAlgoOrder = async (p: {
  symbol: string;
  side: "BUY" | "SELL";
  orderType: "STOP_MARKET" | "STOP";
  triggerPrice: string;
  quantity: string;
  limitPrice?: string;
  workingType?: "CONTRACT_PRICE" | "MARK_PRICE";
  reduceOnly?: boolean;
}): Promise<{ algoId: number }> => {
  const params: Record<string, string | number | boolean | undefined> = {
    algoType: "CONDITIONAL",
    symbol: p.symbol,
    side: p.side,
    type: p.orderType,
    triggerPrice: p.triggerPrice,
    quantity: p.quantity,
    workingType: p.workingType ?? "CONTRACT_PRICE"
  };
  if (p.reduceOnly) params.reduceOnly = "true";
  if (p.orderType === "STOP") {
    if (!p.limitPrice) {
      throw new Error("limit price is required for STOP conditional orders.");
    }
    params.price = p.limitPrice;
    params.timeInForce = "GTC";
  }
  return fapiSignedPost<{ algoId: number }>("/fapi/v1/algoOrder", params);
};

/** Map GET /fapi/v1/algoOrder `algoStatus` to step-plan tick semantics. */
export const normalizeFuturesAlgoStatusForStepTick = (algoStatus: string | undefined): string | null => {
  if (!algoStatus) return null;
  const u = algoStatus.toUpperCase();
  if (u === "FINISHED" || u === "FILLED") return "FILLED";
  if (u === "CANCELED" || u === "CANCELLED") return "CANCELED";
  if (u === "EXPIRED") return "EXPIRED";
  if (u === "REJECTED") return "REJECTED";
  return "NEW";
};

export const fapiQueryConditionalAlgoStatusNormalized = async (algoId: number): Promise<string | null> => {
  try {
    const row = await fapiSignedGet<{ algoStatus?: string }>("/fapi/v1/algoOrder", { algoId });
    return normalizeFuturesAlgoStatusForStepTick(row.algoStatus) ?? "NEW";
  } catch {
    return null;
  }
};

export const fapiCancelConditionalAlgoOrder = async (algoId: number): Promise<unknown> => {
  return fapiSignedDelete<unknown>("/fapi/v1/algoOrder", { algoId });
};

/** Cancel a normal order; if Binance reports unknown order (-2011), try conditional algo cancel (same numeric id). */
export const fapiCancelFuturesOrderOrAlgo = async (symbol: string, id: number): Promise<unknown> => {
  try {
    return await fapiSignedDelete<unknown>("/fapi/v1/order", { symbol, orderId: id });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (/\b-2011\b|Unknown order/i.test(m)) {
      return fapiCancelConditionalAlgoOrder(id);
    }
    throw e;
  }
};

/** USDⓈ-M algo orders (SAPI). See https://developers.binance.com/docs/algo/future-algo */
export const sapiSignedPost = async <T>(path: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<T> => {
  const credentials = getBinanceCredentials();
  const { apiKey } = credentials;
  const timestamp = await getServerTimestamp();
  const merged = { ...params, timestamp, recvWindow: DEFAULT_RECV_WINDOW };
  const qsBase = buildSortedQuery(merged);
  const signature = encodeURIComponent(signPayload(credentials, qsBase));
  const body = `${qsBase}&signature=${signature}`;
  const response = await fetch(`${SAPI_BASE}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "X-MBX-APIKEY": apiKey
    },
    body
  });
  return parseBinanceResponse<T>(response, `SAPI POST ${path}`);
};
