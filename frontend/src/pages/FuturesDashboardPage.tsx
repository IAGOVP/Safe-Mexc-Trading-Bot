import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { fetchAccountAssets, fetchIndexPriceCandles, fetchOpenPositions, submitMarketOrder, cancelOrders } from "../api/mexcApi";

type TradeAction = "open_long" | "open_short" | "close_long" | "close_short";

const symbolNormal = (s: string) => s.trim().toUpperCase().replace("/", "_");

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

  const [symbol, setSymbol] = useState("BTC_USDT");
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

  const [assets, setAssets] = useState<Array<{ currency: string; availableBalance: number; equity: number; unrealized: number }> | null>(null);
  const [positions, setPositions] = useState<Array<{ positionId: string; symbol: string; positionType: number; holdVol: number; holdAvgPrice: number; realised: number; leverage: number }> | null>(
    null
  );

  const [orderAction, setOrderAction] = useState<TradeAction>("open_long");
  const [openType, setOpenType] = useState<1 | 2>(1);
  const [leverage, setLeverage] = useState(5);
  const [vol, setVol] = useState<number>(1);
  const [priceOverride, setPriceOverride] = useState<string>("");
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

  useEffect(() => {
    if (!currentAccount) return;
    loadCandles();
  }, [currentAccount, symbol, interval]);

  useEffect(() => {
    if (!currentAccount) return;
    loadAssets();
    loadPositions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAccount]);

  const isOpening = orderAction === "open_long" || orderAction === "open_short";
  const side = actionToSide(orderAction);

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
                <input
                  className="input-theme mt-1 w-40 rounded-lg px-3 py-2"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                />
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
              <h4 className="text-sm font-semibold text-slate-200">Assets</h4>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {assets.slice(0, 6).map((a) => (
                  <div key={a.currency} className="rounded-xl border border-sky-500/10 bg-slate-950/30 p-3">
                    <p className="text-xs text-slate-400">{a.currency}</p>
                    <p className="mt-1 text-sm font-semibold">{a.availableBalance.toFixed(4)}</p>
                    <p className="mt-1 text-xs text-slate-400">Equity: {a.equity.toFixed(4)}</p>
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

      <section className="mt-4 glass-card rounded-2xl p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300/90">Order Ticket</p>
            <h3 className="mt-1 text-lg font-semibold">Market Trading (MVP)</h3>
          </div>
          <p className="text-sm text-slate-400">Uses last index candle close as default price.</p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
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
            <input
              className="input-theme mt-1 w-full rounded-lg px-3 py-2"
              type="number"
              step="any"
              value={vol}
              onChange={(e) => setVol(Number(e.target.value))}
              min={0}
            />
          </div>

          {isOpening ? (
            <div>
              <label className="text-xs text-slate-300">Leverage</label>
              <input
                className="input-theme mt-1 w-full rounded-lg px-3 py-2"
                type="number"
                step="1"
                value={leverage}
                onChange={(e) => setLeverage(Number(e.target.value))}
                min={1}
              />
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
                    const res = await submitMarketOrder({
                      email,
                      symbol: symbolNormal(symbol),
                      price: effectivePrice,
                      vol,
                      leverage: isOpening ? leverage : undefined,
                      side,
                      openType
                    });
                    if (res.orderId) {
                      setOrderResult(`Submitted. orderId=${res.orderId}`);
                    } else {
                      setOrderResult("Submitted.");
                    }
                    await loadPositions();
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

