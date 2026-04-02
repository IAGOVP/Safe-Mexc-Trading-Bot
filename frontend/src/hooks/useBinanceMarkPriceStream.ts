import { useEffect, useState } from "react";

const DEFAULT_FSTREAM_WS = "wss://fstream.binance.com";

export type MarkPriceWsStatus = "idle" | "connecting" | "open" | "reconnecting" | "error";

function fstreamWsBase(): string {
  const raw = import.meta.env.VITE_BINANCE_FSTREAM_WS as string | undefined;
  if (raw && /^wss?:\/\//i.test(raw.trim())) {
    return raw.trim().replace(/\/$/, "");
  }
  return DEFAULT_FSTREAM_WS;
}

/**
 * Live USDⓈ-M mark (and index) price from Binance Futures WebSocket — no API key.
 * Stream: `<symbol>@markPrice@1s` on fstream.
 */
export function useBinanceMarkPriceStream(symbol: string | null, enabled: boolean) {
  const [markPrice, setMarkPrice] = useState<number | null>(null);
  const [indexPrice, setIndexPrice] = useState<number | null>(null);
  const [status, setStatus] = useState<MarkPriceWsStatus>("idle");
  const [lastEventTime, setLastEventTime] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !symbol?.trim()) {
      setMarkPrice(null);
      setIndexPrice(null);
      setStatus("idle");
      setErrorMessage(null);
      setLastEventTime(null);
      return;
    }

    const sym = symbol.trim().replace(/[_\-/]/g, "").toLowerCase();
    const base = fstreamWsBase();
    let cancelled = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const clearTimer = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const connect = () => {
      if (cancelled) return;
      clearTimer();
      setErrorMessage(null);
      setStatus(attempt === 0 ? "connecting" : "reconnecting");

      const url = `${base}/ws/${sym}@markPrice@1s`;
      try {
        ws = new WebSocket(url);
      } catch (e) {
        setStatus("error");
        setErrorMessage(e instanceof Error ? e.message : "Could not open WebSocket.");
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        if (cancelled) return;
        attempt = 0;
        setStatus("open");
      };

      ws.onmessage = (evt) => {
        if (cancelled) return;
        try {
          const o = JSON.parse(String(evt.data)) as Record<string, unknown>;
          if ("ping" in o) {
            ws?.send(JSON.stringify({ pong: o.ping }));
            return;
          }
          const payload =
            o.data !== undefined && typeof o.data === "object" && o.data !== null
              ? (o.data as Record<string, unknown>)
              : o;
          if (payload.e === "markPriceUpdate" && typeof payload.p === "string") {
            const mp = Number(payload.p);
            if (Number.isFinite(mp)) setMarkPrice(mp);
            if (typeof payload.i === "string") {
              const ip = Number(payload.i);
              if (Number.isFinite(ip)) setIndexPrice(ip);
            }
            if (typeof payload.E === "number") setLastEventTime(payload.E);
          }
        } catch {
          /* ignore malformed frames */
        }
      };

      ws.onerror = () => {
        if (!cancelled) setErrorMessage("WebSocket error (check network or ad blocker).");
      };

      ws.onclose = () => {
        ws = null;
        if (cancelled) return;
        setStatus("reconnecting");
        scheduleReconnect();
      };
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      attempt += 1;
      const delay = Math.min(30_000, 1500 * Math.pow(1.6, Math.min(attempt, 8)));
      clearTimer();
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (!cancelled) connect();
      }, delay);
    };

    connect();

    return () => {
      cancelled = true;
      clearTimer();
      if (ws) {
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        ws.onopen = null;
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      }
      setMarkPrice(null);
      setIndexPrice(null);
      setStatus("idle");
      setLastEventTime(null);
    };
  }, [symbol, enabled]);

  return { markPrice, indexPrice, status, lastEventTime, errorMessage };
}
