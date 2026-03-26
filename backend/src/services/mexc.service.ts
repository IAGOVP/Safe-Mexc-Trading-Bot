import crypto from "crypto";

const MEXC_BASE_URL = process.env.MEXC_BASE_URL ?? "https://api.mexc.com";
const DEFAULT_RECV_WINDOW_SECONDS = "30";
const TIME_SYNC_TTL_MS = 60_000;

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

const hmacSha256Hex = (secret: string, message: string): string => {
  return crypto.createHmac("sha256", secret).update(message).digest("hex");
};

const pruneNullish = <T extends Record<string, unknown>>(obj: T): Partial<T> => {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (out as any)[k] = v;
    }
  }
  return out;
};

const sortKeys = (obj: Record<string, unknown>): string[] => {
  return Object.keys(obj).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
};

const encodeForMexcGetSigning = (value: string): string => {
  // Integration guide: encode values containing commas/special chars.
  // Keep simple values readable to align with documented examples.
  const hasSpecial = /[^A-Za-z0-9_.~-]/.test(value);
  return hasSpecial ? encodeURIComponent(value) : value;
};

const buildGetParameterString = (query: Record<string, unknown>): string => {
  const filtered = pruneNullish(query);
  const keys = sortKeys(filtered);
  if (keys.length === 0) return "";

  return keys
    .map((key) => {
      const rawValue = filtered[key];
      const value = rawValue === undefined ? "" : String(rawValue);
      return `${key}=${encodeForMexcGetSigning(value)}`;
    })
    .join("&");
};

const buildPostParameterString = (body: unknown): string => {
  if (body === undefined) return "";
  if (body === null) return "";
  return JSON.stringify(body);
};

let timeOffsetMs = 0;
let lastTimeSyncAt = 0;

const syncServerTimeOffset = async (): Promise<void> => {
  const now = Date.now();
  if (now - lastTimeSyncAt < TIME_SYNC_TTL_MS) {
    return;
  }

  try {
    const response = await fetch(`${MEXC_BASE_URL}/api/v1/contract/ping`, {
      method: "GET"
    });
    const dateHeader = response.headers.get("date");
    if (dateHeader) {
      const serverNow = new Date(dateHeader).getTime();
      if (!Number.isNaN(serverNow)) {
        timeOffsetMs = serverNow - Date.now();
      }
    }
  } catch {
    // Fall back to local system time if sync fails.
  } finally {
    lastTimeSyncAt = Date.now();
  }
};

const mexcPrivateRequest = async <T>(
  accessKey: string,
  secretKey: string,
  method: HttpMethod,
  path: string,
  query: Record<string, unknown>,
  body: unknown
): Promise<T> => {
  await syncServerTimeOffset();
  const requestTime = Math.floor(Date.now() + timeOffsetMs).toString();
  const parameterString = method === "GET" || method === "DELETE" ? buildGetParameterString(query) : buildPostParameterString(body);
  const target = `${accessKey}${requestTime}${parameterString}`;
  const signature = hmacSha256Hex(secretKey, target);
  const url = parameterString ? `${MEXC_BASE_URL}${path}?${parameterString}` : `${MEXC_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    ApiKey: accessKey,
    "Request-Time": requestTime,
    Signature: signature,
    "Recv-Window": DEFAULT_RECV_WINDOW_SECONDS,
    "Revc-Window": DEFAULT_RECV_WINDOW_SECONDS
  };

  const isJson = method === "POST" || method === "PUT";
  if (isJson) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    method,
    headers,
    body: isJson ? (body === undefined ? undefined : JSON.stringify(body)) : undefined
  });

  const json = (await response.json()) as T;
  return json;
};

export const mexcPublicGet = async <T>(path: string, query: Record<string, unknown> = {}): Promise<T> => {
  const queryString = buildGetParameterString(query);
  const url = queryString ? `${MEXC_BASE_URL}${path}?${queryString}` : `${MEXC_BASE_URL}${path}`;

  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" }
  });

  const json = (await response.json()) as T;
  return json;
};

export const mexcPrivateGet = async <T>(
  accessKey: string,
  secretKey: string,
  path: string,
  query: Record<string, unknown> = {}
): Promise<T> => {
  return mexcPrivateRequest<T>(accessKey, secretKey, "GET", path, query, undefined);
};

export const mexcPrivatePost = async <T>(
  accessKey: string,
  secretKey: string,
  path: string,
  query: Record<string, unknown> = {},
  body: unknown
): Promise<T> => {
  return mexcPrivateRequest<T>(accessKey, secretKey, "POST", path, query, body);
};

