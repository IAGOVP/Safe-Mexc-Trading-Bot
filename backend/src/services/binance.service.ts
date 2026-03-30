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
