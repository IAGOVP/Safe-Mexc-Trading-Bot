import crypto from "crypto";

const FAPI_BASE = process.env.BINANCE_FAPI_BASE_URL ?? "https://fapi.binance.com";
const SAPI_BASE = process.env.BINANCE_SAPI_BASE_URL ?? "https://api.binance.com";
const DEFAULT_RECV_WINDOW = 5000;

export const getBinanceCredentials = (): { apiKey: string; secret: string } => {
  const apiKey = process.env.BINANCE_API_KEY?.trim();
  const secret = process.env.BINANCE_API_SECRET?.trim();
  if (!apiKey || !secret) {
    throw new Error("BINANCE_API_KEY and BINANCE_API_SECRET must be set in the server environment (.env).");
  }
  return { apiKey, secret };
};

const hmacSha256Hex = (secret: string, payload: string): string => {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
};

const buildSortedQuery = (params: Record<string, string | number | boolean | undefined>): string => {
  const keys = Object.keys(params).filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== "").sort();
  return keys.map((k) => `${k}=${encodeURIComponent(String(params[k]))}`).join("&");
};

const parseBinanceResponse = async <T>(response: Response, context: string): Promise<T> => {
  const text = await response.text();
  let parsed: unknown = null;
  if (text.trim()) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      throw new Error(`${context}: invalid JSON (${response.status}). ${text.slice(0, 200)}`);
    }
  }

  if (!response.ok) {
    const msg =
      parsed && typeof parsed === "object" && parsed !== null && "msg" in parsed
        ? String((parsed as { msg: string }).msg)
        : text.slice(0, 300);
    throw new Error(`${context}: HTTP ${response.status} ${msg}`);
  }

  if (parsed && typeof parsed === "object" && parsed !== null) {
    const o = parsed as { code?: number; msg?: string; message?: string; success?: boolean };
    if (o.success === false) {
      throw new Error(`${context}: ${o.msg ?? o.message ?? "request failed"}`);
    }
    if (typeof o.code === "number" && o.code < 0) {
      throw new Error(`${context}: ${o.msg ?? o.message ?? "error"} (${o.code})`);
    }
  }

  return parsed as T;
};

export const fapiPublicGet = async <T>(path: string, query: Record<string, string | number | undefined> = {}): Promise<T> => {
  const qs = buildSortedQuery(query as Record<string, string | number | boolean | undefined>);
  const url = qs ? `${FAPI_BASE}${path}?${qs}` : `${FAPI_BASE}${path}`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  return parseBinanceResponse<T>(response, `FAPI GET ${path}`);
};

export const fapiSignedGet = async <T>(path: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<T> => {
  const { apiKey, secret } = getBinanceCredentials();
  const timestamp = Date.now();
  const merged = { ...params, timestamp, recvWindow: DEFAULT_RECV_WINDOW };
  const qsBase = buildSortedQuery(merged);
  const signature = hmacSha256Hex(secret, qsBase);
  const qs = `${qsBase}&signature=${signature}`;
  const url = `${FAPI_BASE}${path}?${qs}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json", "X-MBX-APIKEY": apiKey }
  });
  return parseBinanceResponse<T>(response, `FAPI signed GET ${path}`);
};

export const fapiSignedPost = async <T>(path: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<T> => {
  const { apiKey, secret } = getBinanceCredentials();
  const timestamp = Date.now();
  const merged = { ...params, timestamp, recvWindow: DEFAULT_RECV_WINDOW };
  const qsBase = buildSortedQuery(merged);
  const signature = hmacSha256Hex(secret, qsBase);
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
  const { apiKey, secret } = getBinanceCredentials();
  const timestamp = Date.now();
  const merged = { ...params, timestamp, recvWindow: DEFAULT_RECV_WINDOW };
  const qsBase = buildSortedQuery(merged);
  const signature = hmacSha256Hex(secret, qsBase);
  const qs = `${qsBase}&signature=${signature}`;
  const url = `${FAPI_BASE}${path}?${qs}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: { Accept: "application/json", "X-MBX-APIKEY": apiKey }
  });
  return parseBinanceResponse<T>(response, `FAPI signed DELETE ${path}`);
};

/** USDⓈ-M algo orders (SAPI). See https://developers.binance.com/docs/algo/future-algo */
export const sapiSignedPost = async <T>(path: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<T> => {
  const { apiKey, secret } = getBinanceCredentials();
  const timestamp = Date.now();
  const merged = { ...params, timestamp, recvWindow: DEFAULT_RECV_WINDOW };
  const qsBase = buildSortedQuery(merged);
  const signature = hmacSha256Hex(secret, qsBase);
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
