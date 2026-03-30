import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  fetchAccountAssets,
  fetchBookTicker,
  fetchMarkPriceCandles,
  fetchOpenOrders,
  fetchOpenPositions,
  submitOrder,
  submitTriggerOrder,
  cancelOrders
} from "../api/binanceApi";
import { MarkPriceCandleChart } from "../components/charts/MarkPriceCandleChart";
import { useBinanceMarkPriceStream } from "../hooks/useBinanceMarkPriceStream";

type TradeAction = "open_long" | "open_short" | "close_long" | "close_short";
type SupportedSymbol = "BTCUSDT" | "ETHUSDT" | "SOLUSDT";
type TicketOrderMode = "regular" | "trigger";
const SUPPORTED_SYMBOLS: SupportedSymbol[] = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const ASSET_FOCUS_OPTIONS = ["BTC", "ETH", "SOL", "TAO"] as const;
const CANDLE_TABLE_PREVIEW = 10;
const CANDLE_SCROLL_CHUNK = 30;

const REGULAR_ORDER_TYPES = [
  { value: 1, label: "Limit" },
  { value: 2, label: "Post Only" },
  { value: 3, label: "IOC" },
  { value: 4, label: "FOK" },
  { value: 5, label: "Market" },
  { value: 6, label: "Chase / MTL" }
] as const;

const symbolNormal = (s: string): SupportedSymbol => {
  const normalized = s.trim().toUpperCase().replace(/[_\-/]/g, "");
  return SUPPORTED_SYMBOLS.includes(normalized as SupportedSymbol) ? (normalized as SupportedSymbol) : "BTCUSDT";
};

const actionToSide = (action: TradeAction): number => {
  switch (action) {
    case "open_long":
      return 1;
    case "close_short":
      return 2;
    case "open_short":
      return 3;
    case "close_long":
      return 4;
    default:
      return 1;
  }
};

export const FuturesDashboardPage = () => {
  const { currentAccount } = useAuth();

  const [symbol, setSymbol] = useState<SupportedSymbol>("BTCUSDT");
  const [interval, setInterval] = useState("Min15");

  const [candlesLoading, setCandlesLoading] = useState(false);
  const [candlesError, setCandlesError] = useState("");
  const [candles, setCandles] = useState<{
    time: number[];
    open: number[];
    close: number[];
    high: number[];
    low: number[];
  } | null>(null);
  const [bestBidAsk, setBestBidAsk] = useState<{ bid1: number | null; ask1: number | null }>({ bid1: null, ask1: null });

  const [assetsLoading, setAssetsLoading] = useState(false);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [assetsError, setAssetsError] = useState("");
  const [positionsError, setPositionsError] = useState("");
  const [showAllAssetsDialog, setShowAllAssetsDialog] = useState(false);
  const [assetSearch, setAssetSearch] = useState("");
  const [candlesExpanded, setCandlesExpanded] = useState(false);
  const [candlesVisibleRows, setCandlesVisibleRows] = useState(CANDLE_TABLE_PREVIEW);
  const candleScrollRef = useRef<HTMLDivElement>(null);
  const candleSentinelRef = useRef<HTMLDivElement>(null);

  const [assets, setAssets] = useState<Array<{ currency: string; availableBalance: number; equity: number; unrealized: number }> | null>(null);
  const [positions, setPositions] = useState<Array<{ positionId: string; symbol: string; positionType: number; holdVol: number; holdAvgPrice: number; realised: number; leverage: number }> | null>(
    null
  );
  const [openOrders, setOpenOrders] = useState<Array<{ orderId: string; symbol: string; side: number; price: number; vol: number; dealVol: number }> | null>(null);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");

  const [orderAction, setOrderAction] = useState<TradeAction>("open_long");
  const [ticketOrderMode, setTicketOrderMode] = useState<TicketOrderMode>("regular");
  const [orderType, setOrderType] = useState<number>(5);
  const [openType, setOpenType] = useState<1 | 2>(1);
  const [leverage, setLeverage] = useState(5);
  const [vol, setVol] = useState<number>(1);
  const [priceOverride, setPriceOverride] = useState<string>("");
  const [chasePriceOverride, setChasePriceOverride] = useState<string>("");
  const [triggerPriceOverride, setTriggerPriceOverride] = useState<string>("");
  const [triggerType, setTriggerType] = useState<1 | 2>(1);
  const [trend, setTrend] = useState<1 | 2 | 3>(1);
  const [executeCycle, setExecuteCycle] = useState<1 | 2>(1);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [orderResult, setOrderResult] = useState<string>("");

  const [cancelOrderId, setCancelOrderId] = useState<string>("");
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [cancelResult, setCancelResult] = useState("");

  const lastPrice = useMemo(() => {
    const c = candles?.close;
    if (!c || c.length === 0) return null;
    return c[c.length - 1];
  }, [candles]);

  const {
    markPrice: liveMarkPrice,
    indexPrice: liveIndexPrice,
    status: markWsStatus,
    lastEventTime: markWsEventTime,
    errorMessage: markWsError
  } = useBinanceMarkPriceStream(symbolNormal(symbol), Boolean(currentAccount));

  const effectivePrice = useMemo(() => {
    const trimmed = priceOverride.trim();
    if (!trimmed) return lastPrice ?? 0;
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : lastPrice ?? 0;
  }, [lastPrice, priceOverride]);
  const effectiveTriggerPrice = useMemo(() => {
    const trimmed = triggerPriceOverride.trim();
    if (!trimmed) return lastPrice ?? 0;
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : lastPrice ?? 0;
  }, [lastPrice, triggerPriceOverride]);
  const effectiveChasePrice = useMemo(() => {
    const isBuyAction = orderAction === "open_long" || orderAction === "close_short";
    const reference = isBuyAction ? bestBidAsk.ask1 : bestBidAsk.bid1;
    const distance = Number(chasePriceOverride.trim());
    if (reference === null || reference === undefined) return lastPrice ?? 0;
    if (!Number.isFinite(distance)) return reference;
    return reference + distance;
  }, [bestBidAsk.ask1, bestBidAsk.bid1, chasePriceOverride, lastPrice, orderAction]);
  const effectiveMarketPrice = useMemo(() => {
    const isBuyAction = orderAction === "open_long" || orderAction === "close_short";
    const reference = isBuyAction ? bestBidAsk.ask1 : bestBidAsk.bid1;
    if (reference !== null && reference !== undefined) return reference;
    return effectivePrice;
  }, [bestBidAsk.ask1, bestBidAsk.bid1, effectivePrice, orderAction]);

  const loadCandles = async () => {
    if (!symbol) return;
    setCandlesLoading(true);
    setCandlesError("");
    try {
      const res = await fetchMarkPriceCandles({ symbol: symbolNormal(symbol), interval });
      setCandles(res.data);
    } catch (err) {
      setCandlesError(err instanceof Error ? err.message : "Failed to load candles.");
      setCandles(null);
    } finally {
      setCandlesLoading(false);
    }
  };

  const loadAssets = async () => {
    setAssetsLoading(true);
    setAssetsError("");
    try {
      const res = await fetchAccountAssets();
      if (!Array.isArray(res.data)) {
        throw new Error("Unexpected Binance account assets response.");
      }
      setAssets(
        res.data.map((a) => ({
          currency: a.currency,
          availableBalance: a.availableBalance,
          equity: a.equity,
          unrealized: a.unrealized
        }))
      );
    } catch (err) {
      setAssetsError(err instanceof Error ? err.message : "Failed to load account assets.");
      setAssets(null);
    } finally {
      setAssetsLoading(false);
    }
  };

  const loadPositions = async () => {
    setPositionsLoading(true);
    setPositionsError("");
    try {
      const res = await fetchOpenPositions({ symbol: symbolNormal(symbol) });
      if (!Array.isArray(res.data)) {
        throw new Error("Unexpected Binance open positions response.");
      }
      setPositions(
        res.data.map((p) => ({
          positionId: String(p.positionId),
          symbol: p.symbol,
          positionType: p.positionType,
          holdVol: Number(p.holdVol),
          holdAvgPrice: Number(p.holdAvgPrice),
          realised: Number(p.realised),
          leverage: Number(p.leverage)
        }))
      );
    } catch (err) {
      setPositionsError(err instanceof Error ? err.message : "Failed to load open positions.");
      setPositions(null);
    } finally {
      setPositionsLoading(false);
    }
  };

  const loadOpenOrders = async () => {
    setOrdersLoading(true);
    setOrdersError("");
    try {
      const res = await fetchOpenOrders({ symbol: symbolNormal(symbol) });
      const rawList = Array.isArray(res.data) ? res.data : null;
      if (!rawList) throw new Error("Unexpected Binance open orders response.");
      setOpenOrders(
        rawList.map((o) => ({
          orderId: String(o.orderId),
          symbol: o.symbol,
          side: Number(o.side),
          price: Number(o.price),
          vol: Number(o.vol),
          dealVol: Number(o.dealVol ?? 0)
        }))
      );
    } catch (err) {
      setOrdersError(err instanceof Error ? err.message : "Failed to load open orders.");
      setOpenOrders(null);
    } finally {
      setOrdersLoading(false);
    }
  };

  const loadTicker = async () => {
    try {
      const res = await fetchBookTicker(symbolNormal(symbol));
      if (!Array.isArray(res.data)) return;
      const current = res.data.find((item) => item.symbol === symbolNormal(symbol));
      if (!current) return;
      setBestBidAsk({
        bid1: typeof current.bid1 === "number" ? current.bid1 : null,
        ask1: typeof current.ask1 === "number" ? current.ask1 : null
      });
    } catch {
      setBestBidAsk({ bid1: null, ask1: null });
    }
  };

  useEffect(() => {
    if (!currentAccount) return;
    loadCandles();
    loadTicker();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAccount, symbol, interval]);

  useEffect(() => {
    if (!currentAccount) return;
    loadAssets();
    loadPositions();
    loadOpenOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAccount]);

  useEffect(() => {
    if (!currentAccount) return;
    loadOpenOrders();
    loadTicker();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  const isOpening = orderAction === "open_long" || orderAction === "open_short";
  const side = actionToSide(orderAction);
  const isRegularMode = ticketOrderMode === "regular";
  const isMarketOrder = orderType === 5;
  const isChaseOrder = orderType === 6;
  const showRegularPriceField = isRegularMode && !isMarketOrder && !isChaseOrder;
  const showChasePriceField = isRegularMode && isChaseOrder;
  const chaseReferenceLabel = side === 1 || side === 2 ? "Ask1" : "Bid1";
  const chaseReferencePrice = side === 1 || side === 2 ? bestBidAsk.ask1 : bestBidAsk.bid1;
  const orderTypeLabel = REGULAR_ORDER_TYPES.find((v) => v.value === orderType)?.label ?? `Type ${orderType}`;
  const orderTypeHint = useMemo(() => {
    switch (orderType) {
      case 1:
        return "Limit: set exact limit price.";
      case 2:
        return "Post Only: maker-only, should not execute immediately.";
      case 3:
        return "IOC: execute immediately, cancel unfilled part.";
      case 4:
        return "FOK: fully fill immediately or cancel all.";
      case 5:
        return "Market: no price input required.";
      case 6:
        return "Chase/MTL: uses Bid1/Ask1 plus distance offset.";
      default:
        return "";
    }
  }, [orderType]);
  const focusedAssets = useMemo(() => {
    const map = new Map<string, { currency: string; availableBalance: number; equity: number; unrealized: number }>();
    for (const a of assets ?? []) {
      map.set(a.currency.toUpperCase(), a);
    }
    return ASSET_FOCUS_OPTIONS.map((currency) => ({
      currency,
      value: map.get(currency) ?? null
    }));
  }, [assets]);

  const filteredAllAssets = useMemo(() => {
    if (!assets) return [];
    const keyword = assetSearch.trim().toUpperCase();
    if (!keyword) return assets;
    return assets.filter((a) => a.currency.toUpperCase().includes(keyword));
  }, [assets, assetSearch]);
  const totalAvailableFuturesBalance = useMemo(() => {
    return (assets ?? []).reduce((sum, a) => sum + a.availableBalance, 0);
  }, [assets]);

  const candlesSortedDesc = useMemo(() => {
    if (!candles || candles.time.length === 0) return [];
    const n = candles.time.length;
    const rows: Array<{ time: number; open: number; high: number; low: number; close: number }> = [];
    for (let i = 0; i < n; i++) {
      rows.push({
        time: candles.time[i],
        open: candles.open[i],
        high: candles.high[i],
        low: candles.low[i],
        close: candles.close[i]
      });
    }
    rows.sort((a, b) => b.time - a.time);
    return rows;
  }, [candles]);

  useEffect(() => {
    setCandlesExpanded(false);
    setCandlesVisibleRows(CANDLE_TABLE_PREVIEW);
  }, [candles]);

  const candleTotalRows = candlesSortedDesc.length;

  const loadMoreCandleRows = useCallback(() => {
    setCandlesVisibleRows((n) => Math.min(candleTotalRows, n + CANDLE_SCROLL_CHUNK));
  }, [candleTotalRows]);

  useEffect(() => {
    if (!candlesExpanded || candleTotalRows === 0) return;
    const root = candleScrollRef.current;
    const target = candleSentinelRef.current;
    if (!root || !target || candlesVisibleRows >= candleTotalRows) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        if (hit) loadMoreCandleRows();
      },
      { root, rootMargin: "120px", threshold: 0 }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [candlesExpanded, candlesVisibleRows, candleTotalRows, loadMoreCandleRows]);

  const candleRowsToShow = useMemo(() => {
    const cap = candlesExpanded ? candlesVisibleRows : CANDLE_TABLE_PREVIEW;
    return candlesSortedDesc.slice(0, Math.min(cap, candleTotalRows));
  }, [candlesExpanded, candlesSortedDesc, candlesVisibleRows, candleTotalRows]);

  if (!currentAccount) {
    return (
      <main className="mx-auto mt-14 max-w-5xl px-4">
        <section className="glass-card rounded-2xl p-8">
          <h2 className="text-xl font-semibold">Sign in to trade</h2>
          <p className="mt-2 text-slate-300">
            After signing in, ensure the backend has BINANCE_API_KEY and BINANCE_API_SECRET in its .env (USDⓈ-M futures enabled).
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto mt-8 max-w-6xl px-4">
      <section className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300/90">Account & Positions</p>
              <h3 className="mt-1 text-lg font-semibold">Live Overview</h3>
            </div>
            <div className="flex gap-2">
              <button className="ghost-btn rounded-lg px-4 py-2 text-slate-100" onClick={loadAssets} disabled={assetsLoading}>
                {assetsLoading ? "Loading..." : "Assets"}
              </button>
              <button className="ghost-btn rounded-lg px-4 py-2 text-slate-100" onClick={loadPositions} disabled={positionsLoading}>
                {positionsLoading ? "Loading..." : "Positions"}
              </button>
            </div>
          </div>

          {assetsError ? <p className="mt-3 text-sm text-rose-400">{assetsError}</p> : null}
          {assets ? (
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-200">Assets</h4>
                <button
                  className="ghost-btn rounded-lg px-3 py-1.5 text-xs text-slate-100"
                  onClick={() => setShowAllAssetsDialog(true)}
                >
                  View All
                </button>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {focusedAssets.map((item) => (
                  <div key={item.currency} className="rounded-xl border border-sky-500/10 bg-slate-950/30 p-3">
                    <p className="text-xs text-slate-400">{item.currency}</p>
                    <p className="mt-1 text-sm font-semibold">
                      Available: {item.value ? item.value.availableBalance.toFixed(6) : "0.000000"}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">Equity: {item.value ? item.value.equity.toFixed(6) : "0.000000"}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      Unrealized: {item.value ? item.value.unrealized.toFixed(6) : "0.000000"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-400">{assetsLoading ? "Loading assets..." : "No assets loaded."}</p>
          )}

          {positionsError ? <p className="mt-4 text-sm text-rose-400">{positionsError}</p> : null}
          {positions ? (
            <div className="mt-6">
              <h4 className="text-sm font-semibold text-slate-200">Open Positions</h4>
              {positions.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400">No open positions for {symbolNormal(symbol)}.</p>
              ) : (
                <div className="mt-2 overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-400">
                        <th className="py-2 pr-3">Symbol</th>
                        <th className="py-2 pr-3">Side</th>
                        <th className="py-2 pr-3">Size</th>
                        <th className="py-2 pr-3">Avg Price</th>
                        <th className="py-2 pr-3">Realized</th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map((p) => {
                        const sideLabel = p.positionType === 1 ? "LONG" : "SHORT";
                        return (
                          <tr key={p.positionId} className="border-t border-sky-500/10 text-slate-200">
                            <td className="py-2 pr-3">{p.symbol}</td>
                            <td className="py-2 pr-3">{sideLabel}</td>
                            <td className="py-2 pr-3">{p.holdVol}</td>
                            <td className="py-2 pr-3">{p.holdAvgPrice.toFixed(4)}</td>
                            <td className="py-2 pr-3">{p.realised.toFixed(4)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <p className="mt-6 text-sm text-slate-400">{positionsLoading ? "Loading positions..." : "No positions loaded."}</p>
          )}
        </div>

        <div className="glass-card flex max-h-[min(88vh,940px)] flex-col overflow-hidden rounded-2xl ring-1 ring-sky-500/20">
          <div className="shrink-0 border-b border-sky-500/15 bg-gradient-to-br from-slate-950/80 to-slate-900/40 px-5 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-400/90">Order ticket</p>
                <h3 className="mt-0.5 text-base font-semibold tracking-tight text-slate-50">USDⓈ-M futures</h3>
                <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-500">
                  Mark price from the chart below fills limit defaults. Size must follow Binance step rules per symbol.
                </p>
              </div>
              <div className="flex flex-col items-stretch gap-2 sm:items-end">
                <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Available balance</span>
                <div className="rounded-lg border border-sky-500/25 bg-slate-950/60 px-4 py-2 text-right tabular-nums">
                  <span className="text-lg font-semibold text-sky-100">{totalAvailableFuturesBalance.toFixed(6)}</span>
                  <span className="ml-1.5 text-xs text-slate-500">USDT</span>
                </div>
              </div>
            </div>
          </div>

          <div className="smart-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <div className="rounded-xl border border-sky-500/12 bg-slate-950/35 p-4">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Execution mode</p>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-950/70 p-1 ring-1 ring-slate-700/50">
                <button
                  type="button"
                  onClick={() => setTicketOrderMode("regular")}
                  className={`rounded-md px-3 py-2.5 text-sm font-medium transition ${
                    ticketOrderMode === "regular"
                      ? "bg-sky-500/20 text-sky-100 shadow-sm ring-1 ring-sky-400/35"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  Regular
                </button>
                <button
                  type="button"
                  onClick={() => setTicketOrderMode("trigger")}
                  className={`rounded-md px-3 py-2.5 text-sm font-medium transition ${
                    ticketOrderMode === "trigger"
                      ? "bg-amber-500/15 text-amber-100 shadow-sm ring-1 ring-amber-400/35"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  Trigger
                </button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Order type</label>
                  <select className="input-theme w-full rounded-lg px-3 py-2.5 text-sm" value={orderType} onChange={(e) => setOrderType(Number(e.target.value))}>
                    {REGULAR_ORDER_TYPES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {orderTypeHint ? <p className="text-[11px] leading-snug text-slate-500">{orderTypeHint}</p> : null}
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Margin mode</label>
                  <select className="input-theme w-full rounded-lg px-3 py-2.5 text-sm" value={openType} onChange={(e) => setOpenType(Number(e.target.value) as 1 | 2)}>
                    <option value={1}>Isolated</option>
                    <option value={2}>Cross</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-sky-500/12 bg-slate-950/35 p-4">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Direction</p>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { value: "open_long" as TradeAction, title: "Open long", hint: "Add long", ring: "ring-emerald-400/45", activeBg: "bg-emerald-500/15" },
                    { value: "open_short", title: "Open short", hint: "Add short", ring: "ring-rose-400/45", activeBg: "bg-rose-500/15" },
                    { value: "close_long", title: "Close long", hint: "Reduce long", ring: "ring-sky-400/45", activeBg: "bg-sky-500/12" },
                    { value: "close_short", title: "Close short", hint: "Reduce short", ring: "ring-violet-400/45", activeBg: "bg-violet-500/12" }
                  ] as const
                ).map((opt) => {
                  const on = orderAction === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setOrderAction(opt.value)}
                      className={`rounded-lg border border-slate-600/35 px-3 py-2.5 text-left transition ${
                        on ? `${opt.activeBg} ring-2 ${opt.ring} border-transparent` : "bg-slate-900/30 hover:border-sky-500/25 hover:bg-slate-900/50"
                      }`}
                    >
                      <span className="block text-sm font-semibold text-slate-100">{opt.title}</span>
                      <span className="text-[11px] text-slate-500">{opt.hint}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-sky-500/12 bg-slate-950/35 p-4">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Size & leverage</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Quantity (base)</label>
                  <div className="flex items-stretch gap-1.5">
                    <button
                      className="ghost-btn inline-flex w-10 shrink-0 items-center justify-center rounded-lg text-lg leading-none text-slate-200"
                      type="button"
                      onClick={() => setVol((prev) => Math.max(0, Number((prev - 1).toFixed(6))))}
                    >
                      −
                    </button>
                    <input
                      className="input-theme min-w-0 flex-1 rounded-lg px-2 py-2 text-center text-sm tabular-nums"
                      type="number"
                      step="any"
                      value={vol}
                      onChange={(e) => setVol(Number(e.target.value))}
                      min={0}
                    />
                    <button
                      className="neon-btn inline-flex w-10 shrink-0 items-center justify-center rounded-lg text-lg leading-none text-white"
                      type="button"
                      onClick={() => setVol((prev) => Number((prev + 1).toFixed(6)))}
                    >
                      +
                    </button>
                  </div>
                </div>
                {isOpening ? (
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Leverage</label>
                    <div className="flex items-stretch gap-1.5">
                      <button
                        className="ghost-btn inline-flex w-10 shrink-0 items-center justify-center rounded-lg text-lg leading-none text-slate-200"
                        type="button"
                        onClick={() => setLeverage((prev) => Math.max(1, prev - 1))}
                      >
                        −
                      </button>
                      <input
                        className="input-theme min-w-0 flex-1 rounded-lg px-2 py-2 text-center text-sm tabular-nums"
                        type="number"
                        step="1"
                        value={leverage}
                        onChange={(e) => setLeverage(Math.max(1, Number(e.target.value) || 1))}
                        min={1}
                      />
                      <button
                        className="neon-btn inline-flex w-10 shrink-0 items-center justify-center rounded-lg text-lg leading-none text-white"
                        type="button"
                        onClick={() => setLeverage((prev) => prev + 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-end">
                    <p className="rounded-lg border border-dashed border-slate-600/50 bg-slate-900/20 px-3 py-2.5 text-xs text-slate-500">Closing orders do not use leverage.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-sky-500/12 bg-slate-950/35 p-4">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Price</p>
              <div className="space-y-3">
                {showRegularPriceField ? (
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Limit price</label>
                    <input
                      className="input-theme w-full rounded-lg px-3 py-2.5 text-sm"
                      type="text"
                      placeholder={lastPrice !== null ? `Default ${lastPrice.toFixed(4)}` : "Enter price"}
                      value={priceOverride}
                      onChange={(e) => setPriceOverride(e.target.value)}
                    />
                    <p className="text-[11px] text-slate-500">
                      Effective{" "}
                      <span className="font-mono tabular-nums text-slate-300">{effectivePrice.toFixed(4)}</span>
                    </p>
                  </div>
                ) : null}

                {showChasePriceField ? (
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Offset from {chaseReferenceLabel}</label>
                    <input
                      className="input-theme w-full rounded-lg px-3 py-2.5 text-sm"
                      type="text"
                      placeholder="e.g. 0.5 or −0.5"
                      value={chasePriceOverride}
                      onChange={(e) => setChasePriceOverride(e.target.value)}
                    />
                    <p className="text-[11px] text-slate-500">
                      {chaseReferenceLabel}{" "}
                      <span className="font-mono tabular-nums text-slate-300">
                        {chaseReferencePrice !== null ? chaseReferencePrice.toFixed(4) : "—"}
                      </span>
                      <span className="mx-1.5 text-slate-600">→</span>
                      Chase{" "}
                      <span className="font-mono tabular-nums text-slate-300">{effectiveChasePrice.toFixed(4)}</span>
                    </p>
                  </div>
                ) : null}

                {isRegularMode && isMarketOrder ? (
                  <div className="rounded-lg border border-sky-500/20 bg-sky-500/[0.07] px-3 py-2.5 text-xs leading-relaxed text-slate-400">
                    Market order — fill price follows live depth when the order executes.
                  </div>
                ) : null}

                {ticketOrderMode === "trigger" ? (
                  <div className="space-y-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-200/90">Trigger</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5 sm:col-span-2">
                        <label className="text-[11px] font-medium uppercase tracking-wide text-amber-200/70">Trigger price</label>
                        <input
                          className="input-theme w-full rounded-lg px-3 py-2.5 text-sm"
                          type="text"
                          placeholder={lastPrice !== null ? `Default ${lastPrice.toFixed(4)}` : "Price"}
                          value={triggerPriceOverride}
                          onChange={(e) => setTriggerPriceOverride(e.target.value)}
                        />
                        <p className="text-[11px] text-slate-500">
                          Effective{" "}
                          <span className="font-mono tabular-nums text-slate-300">{effectiveTriggerPrice.toFixed(4)}</span>
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-medium uppercase tracking-wide text-amber-200/70">Condition</label>
                        <select
                          className="input-theme w-full rounded-lg px-3 py-2.5 text-sm"
                          value={triggerType}
                          onChange={(e) => setTriggerType(Number(e.target.value) as 1 | 2)}
                        >
                          <option value={1}>≥ trigger</option>
                          <option value={2}>≤ trigger</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-medium uppercase tracking-wide text-amber-200/70">Price source</label>
                        <select className="input-theme w-full rounded-lg px-3 py-2.5 text-sm" value={trend} onChange={(e) => setTrend(Number(e.target.value) as 1 | 2 | 3)}>
                          <option value={1}>Latest</option>
                          <option value={2}>Fair</option>
                          <option value={3}>Index</option>
                        </select>
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <label className="text-[11px] font-medium uppercase tracking-wide text-amber-200/70">Watch window</label>
                        <select
                          className="input-theme w-full rounded-lg px-3 py-2.5 text-sm"
                          value={executeCycle}
                          onChange={(e) => setExecuteCycle(Number(e.target.value) as 1 | 2)}
                        >
                          <option value={1}>24 hours</option>
                          <option value={2}>7 days</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-xl border border-sky-400/30 bg-gradient-to-br from-sky-500/[0.12] via-slate-950/50 to-slate-950/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Request side</span>
                  <span className="rounded-md border border-slate-600/50 bg-slate-950/70 px-2.5 py-1 font-mono text-xs text-sky-100">{side}</span>
                </div>
                <button
                  type="button"
                  className="neon-btn w-full rounded-lg px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/20 sm:w-auto"
                  disabled={orderLoading}
                  onClick={async () => {
                    setOrderLoading(true);
                    setOrderError("");
                    setOrderResult("");
                    try {
                      if (!Number.isFinite(vol) || vol <= 0) {
                        throw new Error("Invalid quantity: vol must be greater than 0.");
                      }
                      if (isOpening && (!Number.isFinite(leverage) || leverage < 1)) {
                        throw new Error("Invalid leverage: opening orders require leverage >= 1.");
                      }
                      if (ticketOrderMode === "regular" && !isMarketOrder && !isChaseOrder && (!Number.isFinite(effectivePrice) || effectivePrice <= 0)) {
                        throw new Error("Invalid price: please provide a positive price.");
                      }
                      if (ticketOrderMode === "regular" && isChaseOrder && !Number.isFinite(effectiveChasePrice)) {
                        throw new Error("Invalid chase setup: Bid1/Ask1 reference is unavailable, please refresh and retry.");
                      }
                      if (ticketOrderMode === "trigger" && (!Number.isFinite(effectiveTriggerPrice) || effectiveTriggerPrice <= 0)) {
                        throw new Error("Invalid trigger price: please provide a positive trigger price.");
                      }

                      const selectedOrderType = ticketOrderMode === "trigger" ? Math.min(orderType, 5) : orderType;
                      const res =
                        ticketOrderMode === "trigger"
                          ? await submitTriggerOrder({
                              symbol: symbolNormal(symbol),
                              price: selectedOrderType === 5 ? undefined : effectivePrice,
                              vol,
                              leverage: isOpening ? leverage : undefined,
                              side,
                              openType,
                              triggerPrice: effectiveTriggerPrice,
                              triggerType,
                              executeCycle,
                              orderType: selectedOrderType,
                              trend
                            })
                          : await submitOrder({
                              symbol: symbolNormal(symbol),
                              price: isMarketOrder ? undefined : isChaseOrder ? effectiveChasePrice : effectivePrice,
                              vol,
                              leverage: isOpening ? leverage : undefined,
                              side,
                              type: selectedOrderType,
                              openType
                            });
                      if (res.orderId) {
                        setOrderResult(`${ticketOrderMode === "trigger" ? "Trigger" : orderTypeLabel} submitted. orderId=${res.orderId}`);
                      } else {
                        setOrderResult(`${ticketOrderMode === "trigger" ? "Trigger" : orderTypeLabel} submitted.`);
                      }
                      await loadPositions();
                      await loadOpenOrders();
                    } catch (err) {
                      setOrderError(err instanceof Error ? err.message : "Order failed.");
                    } finally {
                      setOrderLoading(false);
                    }
                  }}
              >
                {orderLoading ? "Submitting…" : "Submit order"}
              </button>
              </div>
              {orderError ? <p className="mt-3 text-sm text-rose-400">{orderError}</p> : null}
              {orderResult ? <p className="mt-3 text-sm text-emerald-400">{orderResult}</p> : null}
            </div>
          </div>

          <div className="shrink-0 border-t border-sky-500/15 bg-slate-950/35 px-5 py-4">
            <div className="mb-5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Working orders</p>
                  <h4 className="mt-0.5 text-sm font-semibold text-slate-100">Open orders</h4>
                </div>
                <button
                  type="button"
                  className="ghost-btn rounded-lg px-3 py-1.5 text-xs text-slate-100"
                  onClick={loadOpenOrders}
                  disabled={ordersLoading}
                >
                  {ordersLoading ? "…" : "Refresh"}
                </button>
              </div>
            {ordersError ? <p className="mt-2 text-sm text-rose-400">{ordersError}</p> : null}
            {openOrders && openOrders.length > 0 ? (
              <div className="smart-scroll mt-3 max-h-48 overflow-auto overflow-x-auto rounded-lg ring-1 ring-sky-500/15">
                <table className="w-full min-w-[320px] text-sm">
                  <thead className="sticky top-0 z-[1] bg-slate-950/95 text-[11px] uppercase tracking-wide text-slate-500 backdrop-blur-sm">
                    <tr className="text-left">
                      <th className="px-3 py-2.5 font-semibold">ID</th>
                      <th className="px-3 py-2.5 font-semibold">Pair</th>
                      <th className="px-3 py-2.5 font-semibold">Side</th>
                      <th className="px-3 py-2.5 font-semibold">Price</th>
                      <th className="px-3 py-2.5 font-semibold">Vol</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {openOrders.map((o, i) => (
                      <tr key={o.orderId} className={i % 2 === 0 ? "bg-slate-950/20" : "bg-slate-900/25"}>
                        <td className="px-3 py-2 font-mono text-xs text-slate-300">{o.orderId}</td>
                        <td className="px-3 py-2">{o.symbol}</td>
                        <td className="px-3 py-2 tabular-nums">{o.side}</td>
                        <td className="px-3 py-2 tabular-nums">{o.price.toFixed(4)}</td>
                        <td className="px-3 py-2 tabular-nums">{o.dealVol > 0 ? `${o.dealVol}/${o.vol}` : o.vol}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">{ordersLoading ? "Loading…" : "No open orders for this symbol."}</p>
            )}
          </div>

          <div className="rounded-xl border border-slate-600/30 bg-slate-950/40 p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Cancel</p>
                <h4 className="mt-0.5 text-sm font-semibold text-slate-100">Order ID</h4>
                <p className="mt-0.5 text-[11px] text-slate-500">Unfilled orders only.</p>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-xs sm:flex-row sm:items-stretch">
                <input
                  className="input-theme min-w-0 flex-1 rounded-lg px-3 py-2.5 font-mono text-sm"
                  value={cancelOrderId}
                  onChange={(e) => setCancelOrderId(e.target.value)}
                  placeholder="e.g. 123456789"
                />
                <button
                  type="button"
                  className="ghost-btn shrink-0 rounded-lg px-4 py-2.5 text-sm text-slate-100"
                  disabled={cancelLoading || cancelOrderId.trim().length === 0}
                  onClick={async () => {
                    setCancelLoading(true);
                    setCancelError("");
                    setCancelResult("");
                    try {
                      const idNum = Number(cancelOrderId);
                      if (!Number.isFinite(idNum)) throw new Error("orderId must be a number.");
                      await cancelOrders({ symbol: symbolNormal(symbol), orderIds: [idNum] });
                      setCancelResult("Cancel request sent.");
                      setCancelOrderId("");
                      await loadPositions();
                      await loadOpenOrders();
                    } catch (err) {
                      setCancelError(err instanceof Error ? err.message : "Cancel failed.");
                    } finally {
                      setCancelLoading(false);
                    }
                  }}
              >
                {cancelLoading ? "Cancelling…" : "Cancel"}
              </button>
              </div>
            </div>
            {cancelError ? <p className="mt-2 text-sm text-rose-400">{cancelError}</p> : null}
            {cancelResult ? <p className="mt-2 text-sm text-emerald-400">{cancelResult}</p> : null}
          </div>
        </div>
        </div>
      </section>

      {showAllAssetsDialog ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/75 p-4">
          <div className="glass-card w-full max-w-2xl rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <h3 className="bg-gradient-to-r from-sky-300 to-blue-400 bg-clip-text text-lg font-semibold text-transparent">All Assets</h3>
              <button className="ghost-btn rounded-lg px-3 py-1.5 text-sm text-slate-100" onClick={() => setShowAllAssetsDialog(false)}>
                Close
              </button>
            </div>
            <div className="mt-4">
              <input
                className="input-theme w-full rounded-lg px-3 py-2"
                type="text"
                placeholder="Search asset by currency (e.g. USDT, BTC)"
                value={assetSearch}
                onChange={(e) => setAssetSearch(e.target.value)}
              />
            </div>
            <div className="smart-scroll mt-4 max-h-[420px] overflow-auto">
              {filteredAllAssets.length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400">
                      <th className="py-2 pr-3">Currency</th>
                      <th className="py-2 pr-3">Available</th>
                      <th className="py-2 pr-3">Equity</th>
                      <th className="py-2 pr-3">Unrealized</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAllAssets.map((a) => (
                      <tr key={a.currency} className="border-t border-sky-500/10 text-slate-200">
                        <td className="py-2 pr-3">{a.currency}</td>
                        <td className="py-2 pr-3">{a.availableBalance.toFixed(6)}</td>
                        <td className="py-2 pr-3">{a.equity.toFixed(6)}</td>
                        <td className="py-2 pr-3">{a.unrealized.toFixed(6)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-slate-400">No assets match your search.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <section className="mt-4 glass-card rounded-2xl p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300/90">Mark Price Candles</p>
            <h3 className="mt-1 text-lg font-semibold">USDⓈ-M Mark Kline</h3>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div>
              <label className="text-xs text-slate-300">Symbol</label>
              <select
                className="input-theme mt-1 w-40 rounded-lg px-3 py-2"
                value={symbol}
                onChange={(e) => setSymbol(symbolNormal(e.target.value))}
              >
                {SUPPORTED_SYMBOLS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-300">Interval</label>
              <select
                className="input-theme mt-1 w-32 rounded-lg px-3 py-2"
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
              >
                {["Min1", "Min5", "Min15", "Min30", "Min60", "Hour4", "Hour8", "Day1"].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <button className="neon-btn mt-6 h-10 rounded-lg px-4 font-medium text-white" onClick={loadCandles} disabled={candlesLoading}>
              {candlesLoading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>

        {candlesError ? <p className="mt-4 text-sm text-rose-400">{candlesError}</p> : null}

        <div className="mt-4 rounded-xl border border-sky-500/20 bg-slate-950/40 px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Live (Binance WebSocket)</p>
              <div className="mt-1 flex flex-wrap items-baseline gap-3">
                <span className="text-2xl font-semibold tabular-nums text-amber-300">
                  {liveMarkPrice !== null ? liveMarkPrice.toFixed(4) : "—"}
                </span>
                <span className="text-sm text-slate-400">
                  Mark · <span className="text-slate-200">{symbolNormal(symbol)}</span>
                </span>
                {liveIndexPrice !== null ? (
                  <span className="text-xs text-slate-500">
                    Index <span className="tabular-nums text-slate-400">{liveIndexPrice.toFixed(4)}</span>
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex flex-col items-start gap-1 text-xs sm:items-end">
              <span className="inline-flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${
                    markWsStatus === "open"
                      ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]"
                      : markWsStatus === "connecting" || markWsStatus === "reconnecting"
                        ? "animate-pulse bg-amber-400"
                        : "bg-slate-600"
                  }`}
                  aria-hidden
                />
                <span className="text-slate-400">
                  {markWsStatus === "open"
                    ? "Streaming @1s"
                    : markWsStatus === "connecting"
                      ? "Connecting…"
                      : markWsStatus === "reconnecting"
                        ? "Reconnecting…"
                        : "Idle"}
                </span>
              </span>
              {markWsEventTime ? (
                <span className="text-[11px] text-slate-600">
                  Last push {new Date(markWsEventTime).toLocaleTimeString()}
                </span>
              ) : null}
              {markWsError ? <span className="text-[11px] text-rose-400">{markWsError}</span> : null}
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-600">
            Direct <code className="rounded bg-slate-900/80 px-1 py-0.5 text-slate-400">{symbolNormal(symbol).toLowerCase()}@markPrice@1s</code> — no API key.
            Yellow line on the chart is live mark when connected.
          </p>
        </div>

        <div className="mt-5">
          <MarkPriceCandleChart candles={candles} liveMarkPrice={liveMarkPrice} height={380} />
        </div>

        {candles && candleTotalRows > 0 ? (
          <div className="mt-5">
            <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-400">
                {candlesExpanded
                  ? "Scroll the list to load more rows automatically."
                  : "Latest candles first (newest at top)."}
              </p>
              {candleTotalRows > CANDLE_TABLE_PREVIEW ? (
                <button
                  type="button"
                  className="ghost-btn self-start rounded-lg px-3 py-1.5 text-xs text-slate-100 sm:self-auto"
                  onClick={() => {
                    if (candlesExpanded) {
                      setCandlesExpanded(false);
                      setCandlesVisibleRows(CANDLE_TABLE_PREVIEW);
                    } else {
                      setCandlesExpanded(true);
                      setCandlesVisibleRows((prev) =>
                        Math.min(candleTotalRows, Math.max(prev + CANDLE_SCROLL_CHUNK, CANDLE_TABLE_PREVIEW + CANDLE_SCROLL_CHUNK))
                      );
                    }
                  }}
                >
                  {candlesExpanded ? "Show less" : "View all"}
                </button>
              ) : null}
            </div>
            <div
              ref={candleScrollRef}
              className={
                candlesExpanded
                  ? "smart-scroll max-h-[min(55vh,520px)] overflow-y-auto rounded-lg border border-sky-500/15 bg-slate-950/20"
                  : "overflow-x-auto"
              }
            >
              <table className="w-full text-sm">
                <thead
                  className={
                    candlesExpanded
                      ? "sticky top-0 z-[1] border-b border-sky-500/20 bg-[rgba(8,16,35,0.92)] backdrop-blur-sm"
                      : ""
                  }
                >
                  <tr className="text-left text-slate-400">
                    <th className="py-2 pr-3">Time</th>
                    <th className="py-2 pr-3">Open</th>
                    <th className="py-2 pr-3">High</th>
                    <th className="py-2 pr-3">Low</th>
                    <th className="py-2 pr-3">Close</th>
                  </tr>
                </thead>
                <tbody>
                  {candleRowsToShow.map((row, idx) => (
                    <tr key={`${row.time}-${idx}`} className="border-t border-sky-500/10 text-slate-200">
                      <td className="py-2 pr-3 text-xs text-slate-300">
                        {new Date(row.time * 1000).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                      </td>
                      <td className="py-2 pr-3">{row.open.toFixed(2)}</td>
                      <td className="py-2 pr-3">{row.high.toFixed(2)}</td>
                      <td className="py-2 pr-3">{row.low.toFixed(2)}</td>
                      <td className="py-2 pr-3">{row.close.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {candlesExpanded && candlesVisibleRows < candleTotalRows ? (
                <div ref={candleSentinelRef} className="flex min-h-[1px] justify-center py-3" aria-hidden>
                  <span className="text-[11px] text-slate-500">Loading more as you scroll…</span>
                </div>
              ) : null}
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Latest candle close: {lastPrice !== null ? lastPrice.toFixed(4) : "-"}
              {liveMarkPrice !== null ? (
                <span className="ml-2">
                  · Live mark: <span className="tabular-nums text-amber-200/90">{liveMarkPrice.toFixed(4)}</span>
                </span>
              ) : null}
              {!candlesExpanded && candleTotalRows > CANDLE_TABLE_PREVIEW
                ? ` · Showing ${CANDLE_TABLE_PREVIEW} of ${candleTotalRows}`
                : null}
              {candlesExpanded
                ? ` · Showing ${candleRowsToShow.length} of ${candleTotalRows}${candlesVisibleRows < candleTotalRows ? " (scroll for more)" : " (all loaded)"}`
                : null}
            </p>
          </div>
        ) : candles ? (
          <p className="mt-5 text-sm text-slate-400">No candle rows to display.</p>
        ) : (
          <p className="mt-5 text-sm text-slate-400">No candle data yet.</p>
        )}
      </section>
    </main>
  );
};

