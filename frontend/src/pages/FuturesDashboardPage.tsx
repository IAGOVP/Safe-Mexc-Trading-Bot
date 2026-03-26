import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { fetchAccountAssets, fetchIndexPriceCandles, fetchOpenOrders, fetchOpenPositions, submitOrder, submitTriggerOrder, cancelOrders } from "../api/mexcApi";

type TradeAction = "open_long" | "open_short" | "close_long" | "close_short";
type SupportedSymbol = "BTC_USDT" | "ETH_USDT" | "SOL_USDT";
type TicketOrderMode = "regular" | "trigger";
const SUPPORTED_SYMBOLS: SupportedSymbol[] = ["BTC_USDT", "ETH_USDT", "SOL_USDT"];
const ASSET_FOCUS_OPTIONS = ["BTC", "ETH", "SOL", "TAO"] as const;
const REGULAR_ORDER_TYPES = [
  { value: 1, label: "Limit" },
  { value: 2, label: "Post Only" },
  { value: 3, label: "IOC" },
  { value: 4, label: "FOK" },
  { value: 5, label: "Market" },
  { value: 6, label: "Chase / MTL" }
] as const;

const symbolNormal = (s: string): SupportedSymbol => {
  const normalized = s.trim().toUpperCase().replace("/", "_");
  return SUPPORTED_SYMBOLS.includes(normalized as SupportedSymbol) ? (normalized as SupportedSymbol) : "BTC_USDT";
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
  const email = currentAccount?.email ?? "";

  const [symbol, setSymbol] = useState<SupportedSymbol>("BTC_USDT");
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

  const [assetsLoading, setAssetsLoading] = useState(false);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [assetsError, setAssetsError] = useState("");
  const [positionsError, setPositionsError] = useState("");
  const [showAllAssetsDialog, setShowAllAssetsDialog] = useState(false);
  const [assetSearch, setAssetSearch] = useState("");

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

  const loadCandles = async () => {
    if (!symbol) return;
    setCandlesLoading(true);
    setCandlesError("");
    try {
      const res = await fetchIndexPriceCandles({ symbol: symbolNormal(symbol), interval });
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
      const res = await fetchAccountAssets(email);
      if (!Array.isArray(res.data)) {
        throw new Error("Unexpected MEXC account assets response.");
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
      const res = await fetchOpenPositions({ email, symbol: symbolNormal(symbol) });
      if (!Array.isArray(res.data)) {
        throw new Error("Unexpected MEXC open positions response.");
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
      const res = await fetchOpenOrders({ email, symbol: symbolNormal(symbol), pageNum: 1, pageSize: 20 });
      const rawList = Array.isArray(res.data)
        ? res.data
        : res.data && typeof res.data === "object" && Array.isArray(res.data.resultList)
          ? res.data.resultList
          : null;
      if (!rawList) throw new Error("Unexpected MEXC open orders response.");
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

  useEffect(() => {
    if (!currentAccount) return;
    loadCandles();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  const isOpening = orderAction === "open_long" || orderAction === "open_short";
  const side = actionToSide(orderAction);
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

  if (!currentAccount) {
    return (
      <main className="mx-auto mt-14 max-w-5xl px-4">
        <section className="glass-card rounded-2xl p-8">
          <h2 className="text-xl font-semibold">Sign in to trade</h2>
          <p className="mt-2 text-slate-300">After signing in, open Settings from the navbar menu and add your MEXC API keys.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto mt-8 max-w-6xl px-4">
      <section className="grid gap-4 md:grid-cols-2">
        <div className="glass-card rounded-2xl p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300/90">Index Price Candles</p>
              <h3 className="mt-1 text-lg font-semibold">Index Kline</h3>
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

          {candles ? (
            <div className="mt-5 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400">
                    <th className="py-2 pr-3">Time</th>
                    <th className="py-2 pr-3">Open</th>
                    <th className="py-2 pr-3">High</th>
                    <th className="py-2 pr-3">Low</th>
                    <th className="py-2 pr-3">Close</th>
                  </tr>
                </thead>
                <tbody>
                  {candles.time.slice(-20).map((t, idx) => {
                    const i = candles.time.length - 20 + idx;
                    const dt = new Date(t * 1000);
                    return (
                      <tr key={t} className="border-t border-sky-500/10 text-slate-200">
                        <td className="py-2 pr-3 text-xs text-slate-300">{dt.toLocaleTimeString()}</td>
                        <td className="py-2 pr-3">{candles.open[i].toFixed(2)}</td>
                        <td className="py-2 pr-3">{candles.high[i].toFixed(2)}</td>
                        <td className="py-2 pr-3">{candles.low[i].toFixed(2)}</td>
                        <td className="py-2 pr-3">{candles.close[i].toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-slate-400">
                Latest close: {lastPrice !== null ? lastPrice.toFixed(4) : "-"}
              </p>
            </div>
          ) : (
            <p className="mt-5 text-sm text-slate-400">No candle data yet.</p>
          )}
        </div>

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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300/90">Order Ticket</p>
            <h3 className="mt-1 text-lg font-semibold">Futures Order Ticket</h3>
          </div>
          <p className="text-sm text-slate-400">Uses last index candle close as default price for price and trigger fields.</p>
        </div>
        <p className="mt-3 text-sm text-slate-300">
          Total available futures balance: <span className="font-semibold text-slate-100">{totalAvailableFuturesBalance.toFixed(6)}</span>
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div>
            <label className="text-xs text-slate-300">Order Mode</label>
            <select
              className="input-theme mt-1 w-full rounded-lg px-3 py-2"
              value={ticketOrderMode}
              onChange={(e) => setTicketOrderMode(e.target.value as TicketOrderMode)}
            >
              <option value="regular">Regular</option>
              <option value="trigger">Trigger</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-300">Order Type</label>
            <select className="input-theme mt-1 w-full rounded-lg px-3 py-2" value={orderType} onChange={(e) => setOrderType(Number(e.target.value))}>
              {REGULAR_ORDER_TYPES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-300">Action</label>
            <select className="input-theme mt-1 w-full rounded-lg px-3 py-2" value={orderAction} onChange={(e) => setOrderAction(e.target.value as TradeAction)}>
              <option value="open_long">Open Long</option>
              <option value="close_long">Close Long</option>
              <option value="open_short">Open Short</option>
              <option value="close_short">Close Short</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-300">Open Type</label>
            <select className="input-theme mt-1 w-full rounded-lg px-3 py-2" value={openType} onChange={(e) => setOpenType(Number(e.target.value) as 1 | 2)}>
              <option value={1}>Isolated</option>
              <option value={2}>Cross</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-300">Quantity (vol)</label>
            <div className="mt-1 flex items-center gap-2">
              <button
                className="ghost-btn inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-100"
                type="button"
                onClick={() => setVol((prev) => Math.max(0, Number((prev - 1).toFixed(6))))}
              >
                -
              </button>
              <input
                className="input-theme w-full rounded-lg px-3 py-2 text-center"
                type="number"
                step="any"
                value={vol}
                onChange={(e) => setVol(Number(e.target.value))}
                min={0}
              />
              <button
                className="neon-btn inline-flex h-9 w-9 items-center justify-center rounded-lg text-white"
                type="button"
                onClick={() => setVol((prev) => Number((prev + 1).toFixed(6)))}
              >
                +
              </button>
            </div>
          </div>

          {isOpening ? (
            <div>
              <label className="text-xs text-slate-300">Leverage</label>
              <div className="mt-1 flex items-center gap-2">
                <button
                  className="ghost-btn inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-100"
                  type="button"
                  onClick={() => setLeverage((prev) => Math.max(1, prev - 1))}
                >
                  -
                </button>
                <input
                  className="input-theme w-full rounded-lg px-3 py-2 text-center"
                  type="number"
                  step="1"
                  value={leverage}
                  onChange={(e) => setLeverage(Math.max(1, Number(e.target.value) || 1))}
                  min={1}
                />
                <button
                  className="neon-btn inline-flex h-9 w-9 items-center justify-center rounded-lg text-white"
                  type="button"
                  onClick={() => setLeverage((prev) => prev + 1)}
                >
                  +
                </button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-400">
              <p className="mt-6">Leverage not needed for closes.</p>
            </div>
          )}

          <div className="md:col-span-2">
            <label className="text-xs text-slate-300">Price</label>
            <input
              className="input-theme mt-1 w-full rounded-lg px-3 py-2"
              type="text"
              placeholder={lastPrice !== null ? `Auto: ${lastPrice.toFixed(4)}` : "Auto price"}
              value={priceOverride}
              onChange={(e) => setPriceOverride(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-400">Effective price: {effectivePrice.toFixed(4)}</p>
          </div>

          {ticketOrderMode === "trigger" ? (
            <>
              <div>
                <label className="text-xs text-slate-300">Trigger Price</label>
                <input
                  className="input-theme mt-1 w-full rounded-lg px-3 py-2"
                  type="text"
                  placeholder={lastPrice !== null ? `Auto: ${lastPrice.toFixed(4)}` : "Auto trigger price"}
                  value={triggerPriceOverride}
                  onChange={(e) => setTriggerPriceOverride(e.target.value)}
                />
                <p className="mt-1 text-xs text-slate-400">Effective trigger: {effectiveTriggerPrice.toFixed(4)}</p>
              </div>
              <div>
                <label className="text-xs text-slate-300">Trigger Type</label>
                <select className="input-theme mt-1 w-full rounded-lg px-3 py-2" value={triggerType} onChange={(e) => setTriggerType(Number(e.target.value) as 1 | 2)}>
                  <option value={1}>Greater Than Or Equal</option>
                  <option value={2}>Less Than Or Equal</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-300">Trigger Price Source</label>
                <select className="input-theme mt-1 w-full rounded-lg px-3 py-2" value={trend} onChange={(e) => setTrend(Number(e.target.value) as 1 | 2 | 3)}>
                  <option value={1}>Latest Price</option>
                  <option value={2}>Fair Price</option>
                  <option value={3}>Index Price</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-300">Execute Cycle</label>
                <select className="input-theme mt-1 w-full rounded-lg px-3 py-2" value={executeCycle} onChange={(e) => setExecuteCycle(Number(e.target.value) as 1 | 2)}>
                  <option value={1}>24 Hours</option>
                  <option value={2}>7 Days</option>
                </select>
              </div>
            </>
          ) : null}

          <div className="md:col-span-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-400">
              side: <span className="text-slate-200">{side}</span>
            </div>
            <div className="flex gap-2">
              <button
                className="neon-btn rounded-lg px-4 py-2 font-medium text-white"
                disabled={orderLoading}
                onClick={async () => {
                  setOrderLoading(true);
                  setOrderError("");
                  setOrderResult("");
                  try {
                    const selectedOrderType = ticketOrderMode === "trigger" ? Math.min(orderType, 5) : orderType;
                    const res =
                      ticketOrderMode === "trigger"
                        ? await submitTriggerOrder({
                            email,
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
                            email,
                            symbol: symbolNormal(symbol),
                            price: effectivePrice,
                            vol,
                            leverage: isOpening ? leverage : undefined,
                            side,
                            type: selectedOrderType,
                            openType
                          });
                    if (res.orderId) {
                      setOrderResult(`${ticketOrderMode === "trigger" ? "Trigger" : "Order"} submitted. orderId=${res.orderId}`);
                    } else {
                      setOrderResult(`${ticketOrderMode === "trigger" ? "Trigger" : "Order"} submitted.`);
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
                {orderLoading ? "Submitting..." : "Submit Order"}
              </button>
            </div>
          </div>

          {orderError ? <p className="md:col-span-3 text-sm text-rose-400">{orderError}</p> : null}
          {orderResult ? <p className="md:col-span-3 text-sm text-emerald-400">{orderResult}</p> : null}
        </div>

        <div className="mt-6 border-t border-sky-500/15 pt-6">
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-200">Open Orders</h4>
              <button className="ghost-btn rounded-lg px-3 py-1.5 text-xs text-slate-100" onClick={loadOpenOrders} disabled={ordersLoading}>
                {ordersLoading ? "Loading..." : "Refresh"}
              </button>
            </div>
            {ordersError ? <p className="mt-2 text-sm text-rose-400">{ordersError}</p> : null}
            {openOrders && openOrders.length > 0 ? (
              <div className="smart-scroll mt-3 max-h-44 overflow-auto rounded-lg border border-sky-500/10">
                <table className="w-full text-sm">
                  <thead className="bg-slate-950/40">
                    <tr className="text-left text-slate-400">
                      <th className="px-3 py-2">Order ID</th>
                      <th className="px-3 py-2">Symbol</th>
                      <th className="px-3 py-2">Side</th>
                      <th className="px-3 py-2">Price</th>
                      <th className="px-3 py-2">Vol</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openOrders.map((o) => (
                      <tr key={o.orderId} className="border-t border-sky-500/10 text-slate-200">
                        <td className="px-3 py-2">{o.orderId}</td>
                        <td className="px-3 py-2">{o.symbol}</td>
                        <td className="px-3 py-2">{o.side}</td>
                        <td className="px-3 py-2">{o.price.toFixed(4)}</td>
                        <td className="px-3 py-2">{o.dealVol > 0 ? `${o.dealVol}/${o.vol}` : o.vol}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-400">{ordersLoading ? "Loading open orders..." : "No open orders."}</p>
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h4 className="text-sm font-semibold text-slate-200">Cancel Order</h4>
              <p className="mt-1 text-xs text-slate-400">Cancel by orderId (unfinished orders).</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                className="input-theme w-56 rounded-lg px-3 py-2"
                value={cancelOrderId}
                onChange={(e) => setCancelOrderId(e.target.value)}
                placeholder="orderId"
              />
              <button
                className="ghost-btn rounded-lg px-4 py-2 text-slate-100"
                disabled={cancelLoading || cancelOrderId.trim().length === 0}
                onClick={async () => {
                  setCancelLoading(true);
                  setCancelError("");
                  setCancelResult("");
                  try {
                    const idNum = Number(cancelOrderId);
                    if (!Number.isFinite(idNum)) throw new Error("orderId must be a number.");
                    await cancelOrders({ email, orderIds: [idNum] });
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
                {cancelLoading ? "Cancelling..." : "Cancel"}
              </button>
            </div>
          </div>
          {cancelError ? <p className="mt-3 text-sm text-rose-400">{cancelError}</p> : null}
          {cancelResult ? <p className="mt-3 text-sm text-emerald-400">{cancelResult}</p> : null}
        </div>
      </section>
    </main>
  );
};

