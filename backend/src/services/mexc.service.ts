import crypto from "crypto";

const MEXC_BASE_URL = process.env.MEXC_BASE_URL ?? "https://api.mexc.com";

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

const buildGetParameterString = (query: Record<string, unknown>): string => {
  const filtered = pruneNullish(query);
  const keys = Object.keys(filtered).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (keys.length === 0) return "";

  return keys
    .map((key) => {
      const rawValue = filtered[key];
      const value = rawValue === undefined ? "" : String(rawValue);
      return `${key}=${encodeURIComponent(value)}`;
    })
    .join("&");
};

const buildPostParameterString = (body: unknown): string => {
  if (body === undefined) return "";
  if (body === null) return "";
  return JSON.stringify(body);
};

const mexcPrivateRequest = async <T>(
  accessKey: string,
  secretKey: string,
  method: HttpMethod,
  path: string,
  query: Record<string, unknown>,
  body: unknown
): Promise<T> => {
  const requestTime = Date.now().toString();

  const url = new URL(`${MEXC_BASE_URL}${path}`);
  const filteredQuery = pruneNullish(query);
  for (const [k, v] of Object.entries(filteredQuery)) {
    url.searchParams.set(k, String(v));
  }

  const parameterString = method === "GET" || method === "DELETE" ? buildGetParameterString(query) : buildPostParameterString(body);
  const target = `${accessKey}${requestTime}${parameterString}`;
  const signature = hmacSha256Hex(secretKey, target);

  const headers: Record<string, string> = {
    ApiKey: accessKey,
    "Request-Time": requestTime,
    Signature: signature
  };

  const isJson = method === "POST" || method === "PUT";
  if (isJson) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: isJson ? (body === undefined ? undefined : JSON.stringify(body)) : undefined
  });

  const json = (await response.json()) as T;
  return json;
};

export const mexcPublicGet = async <T>(path: string, query: Record<string, unknown> = {}): Promise<T> => {
  const url = new URL(`${MEXC_BASE_URL}${path}`);
  const filteredQuery = pruneNullish(query);
  for (const [k, v] of Object.entries(filteredQuery)) {
    url.searchParams.set(k, String(v));
  }

  const response = await fetch(url.toString(), {
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

