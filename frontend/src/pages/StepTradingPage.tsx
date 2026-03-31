import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { StepOrdersSection } from "../components/steps/StepOrdersSection";
import { useBinanceMarkPriceStream } from "../hooks/useBinanceMarkPriceStream";
import { fetchOpenPositions, submitTriggerOrder } from "../api/binanceApi";

type SupportedSymbol = "BTCUSDT" | "ETHUSDT" | "SOLUSDT";
const SUPPORTED_SYMBOLS: SupportedSymbol[] = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

const symbolNormal = (s: string): SupportedSymbol => {
  const normalized = s.trim().toUpperCase().replace(/[_\-/]/g, "");
  return SUPPORTED_SYMBOLS.includes(normalized as SupportedSymbol) ? (normalized as SupportedSymbol) : "BTCUSDT";
};

export const StepTradingPage = () => {
  const { currentAccount } = useAuth();
  const [symbol, setSymbol] = useState<SupportedSymbol>("BTCUSDT");
  const { markPrice: btcMarkPrice } = useBinanceMarkPriceStream("BTCUSDT", true);
  const [btcMin, setBtcMin] = useState<number | null>(null);
  const [btcMax, setBtcMax] = useState<number | null>(null);
  const [protectSide, setProtectSide] = useState<"long" | "short">("long");
  const [protectSize, setProtectSize] = useState<string>("0");
  const [tpPrice, setTpPrice] = useState<string>("");
  const [slPrice, setSlPrice] = useState<string>("");
  const [protectLoading, setProtectLoading] = useState<"tp" | "sl" | null>(null);
  const [protectError, setProtectError] = useState("");
  const [protectFullLoading, setProtectFullLoading] = useState(false);

  useEffect(() => {
    if (btcMarkPrice === null || !Number.isFinite(btcMarkPrice)) return;
    setBtcMin((prev) => (prev === null ? btcMarkPrice : Math.min(prev, btcMarkPrice)));
    setBtcMax((prev) => (prev === null ? btcMarkPrice : Math.max(prev, btcMarkPrice)));
  }, [btcMarkPrice]);

  if (!currentAccount) {
    return (
      <main className="mx-auto mt-14 max-w-5xl px-4">
        <section className="glass-card rounded-2xl p-8">
          <h2 className="text-xl font-semibold">Sign in for step trading</h2>
          <p className="mt-2 text-slate-300">
            Sequential step orders run on the server with your Binance API keys. Sign in to use this page.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto mt-8 max-w-6xl px-4">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300/90">Trading</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-50">Step trading</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Chained USDⓈ-M stop plans: you confirm each step before it is sent; only one live stop at a time, in order.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-end">
          <div className="rounded-2xl border border-amber-400/25 bg-slate-950/60 px-4 py-3 shadow-[0_0_0_1px_rgba(15,23,42,0.9)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300/90">
              BTCUSDT live mark
            </p>
            <div className="mt-1 flex items-baseline gap-3">
              <span className="text-lg font-semibold tabular-nums text-slate-50">
                {btcMarkPrice !== null ? btcMarkPrice.toFixed(2) : "--"}
              </span>
              <div className="flex gap-3 text-[11px] text-slate-400">
                <span>
                  Min{" "}
                  <span className="font-mono text-xs text-slate-200">
                    {btcMin !== null ? btcMin.toFixed(2) : "--"}
                  </span>
                </span>
                <span>
                  Max{" "}
                  <span className="font-mono text-xs text-slate-200">
                    {btcMax !== null ? btcMax.toFixed(2) : "--"}
                  </span>
                </span>
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-300">Symbol</label>
            <select
              className="input-theme mt-1 w-44 rounded-lg px-3 py-2"
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
        </div>
      </div>

      <section className="mb-6 rounded-2xl border border-sky-500/25 bg-gradient-to-br from-slate-950/80 via-slate-950/50 to-slate-900/60 p-5 shadow-[0_18px_45px_rgba(15,23,42,0.85)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-md">
            <p className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-300/90">
              Position protection
              <span className="h-[1px] w-10 bg-sky-500/60" />
            </p>
            <h3 className="mt-1 text-sm font-semibold text-slate-50">One-click TP / SL triggers</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Fire-and-forget <span className="font-semibold text-slate-100">STOP_MARKET</span> orders for your active position on{" "}
              <span className="font-mono text-[11px] text-slate-100">{symbol}</span>. Choose side, size, and prices — we send clean
              Binance conditional triggers for you.
            </p>
          </div>
          <div className="flex flex-1 flex-col gap-3 rounded-xl border border-sky-500/25 bg-slate-950/60 px-3 py-3 md:px-4">
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <div className="space-y-1.5">
                <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Position side</span>
                <div className="inline-flex rounded-lg border border-slate-600/60 bg-slate-950/80 p-0.5 shadow-inner shadow-slate-900/60">
                  <button
                    type="button"
                    className={`min-w-[70px] rounded-md px-3 py-1.5 text-[11px] font-semibold ${
                      protectSide === "long"
                        ? "bg-emerald-500/25 text-emerald-50 shadow-[0_0_12px_rgba(16,185,129,0.55)]"
                        : "text-slate-400 hover:text-slate-100"
                    }`}
                    onClick={() => setProtectSide("long")}
                  >
                    Long
                  </button>
                  <button
                    type="button"
                    className={`min-w-[70px] rounded-md px-3 py-1.5 text-[11px] font-semibold ${
                      protectSide === "short"
                        ? "bg-rose-500/25 text-rose-50 shadow-[0_0_12px_rgba(248,113,113,0.55)]"
                        : "text-slate-400 hover:text-slate-100"
                    }`}
                    onClick={() => setProtectSide("short")}
                  >
                    Short
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  Size
                  <span className="ml-1 text-[10px] font-normal text-slate-500">(contracts / base)</span>
                </label>
                <div className="relative">
                  <input
                    className="input-theme w-full rounded-lg px-3 py-2 pr-12 text-sm tabular-nums"
                    type="number"
                    step="any"
                    value={protectSize}
                    onChange={(e) => setProtectSize(e.target.value)}
                    placeholder="e.g. 5"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-1 my-1 flex items-center rounded-md px-2.5 text-[11px] font-semibold text-sky-100 hover:text-sky-200 disabled:opacity-60"
                    disabled={protectFullLoading}
                    onClick={async () => {
                      setProtectError("");
                      setProtectFullLoading(true);
                      try {
                        const res = await fetchOpenPositions({ symbol });
                        const list = Array.isArray(res.data) ? res.data : [];
                        const wantType = protectSide === "long" ? 1 : 2;
                        const pos = list.find((p) => p.positionType === wantType && p.symbol === symbol);
                        if (!pos || !pos.holdVol || pos.holdVol <= 0) {
                          setProtectError(`No ${protectSide} position found for ${symbol}.`);
                        } else {
                          setProtectSize(String(pos.holdVol));
                        }
                      } catch (e) {
                        setProtectError(e instanceof Error ? e.message : "Failed to load position size.");
                      } finally {
                        setProtectFullLoading(false);
                      }
                    }}
                  >
                    {protectFullLoading ? "Full…" : "Full"}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium uppercase tracking-wide text-emerald-300/80">Take profit price</label>
                <input
                  className="input-theme w-full rounded-lg px-3 py-2 text-sm tabular-nums"
                  type="number"
                  step="any"
                  value={tpPrice}
                  onChange={(e) => setTpPrice(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium uppercase tracking-wide text-rose-300/80">Stop loss price</label>
                <input
                  className="input-theme w-full rounded-lg px-3 py-2 text-sm tabular-nums"
                  type="number"
                  step="any"
                  value={slPrice}
                  onChange={(e) => setSlPrice(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="neon-btn rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-70"
                disabled={protectLoading === "tp"}
                onClick={async () => {
              setProtectError("");
              const sizeNum = Number(protectSize.trim());
              const priceNum = Number(tpPrice.trim());
              if (!Number.isFinite(sizeNum) || sizeNum <= 0) {
                setProtectError("Enter a positive size.");
                return;
              }
              if (!Number.isFinite(priceNum) || priceNum <= 0) {
                setProtectError("Enter a positive TP price.");
                return;
              }
              const isLong = protectSide === "long";
              const side = isLong ? 4 : 2;
              setProtectLoading("tp");
              try {
                await submitTriggerOrder({
                  symbol,
                  price: undefined,
                  vol: sizeNum,
                  leverage: undefined,
                  side,
                  openType: 1,
                  triggerPrice: priceNum,
                  triggerType: isLong ? 1 : 2,
                  executeCycle: 1,
                  orderType: 5,
                  trend: 1
                });
              } catch (e) {
                setProtectError(e instanceof Error ? e.message : "Failed to place TP trigger.");
              } finally {
                setProtectLoading(null);
              }
            }}
              >
                {protectLoading === "tp" ? "Placing TP…" : "Place TP trigger"}
              </button>
              <button
                type="button"
                className="ghost-btn rounded-lg px-4 py-2 text-xs text-slate-100 disabled:opacity-70"
                disabled={protectLoading === "sl"}
                onClick={async () => {
              setProtectError("");
              const sizeNum = Number(protectSize.trim());
              const priceNum = Number(slPrice.trim());
              if (!Number.isFinite(sizeNum) || sizeNum <= 0) {
                setProtectError("Enter a positive size.");
                return;
              }
              if (!Number.isFinite(priceNum) || priceNum <= 0) {
                setProtectError("Enter a positive SL price.");
                return;
              }
              const isLong = protectSide === "long";
              const side = isLong ? 4 : 2;
              setProtectLoading("sl");
              try {
                await submitTriggerOrder({
                  symbol,
                  price: undefined,
                  vol: sizeNum,
                  leverage: undefined,
                  side,
                  openType: 1,
                  triggerPrice: priceNum,
                  triggerType: isLong ? 2 : 1,
                  executeCycle: 1,
                  orderType: 5,
                  trend: 1
                });
              } catch (e) {
                setProtectError(e instanceof Error ? e.message : "Failed to place SL trigger.");
              } finally {
                setProtectLoading(null);
              }
            }}
              >
                {protectLoading === "sl" ? "Placing SL…" : "Place SL trigger"}
              </button>
              <p className="ml-auto text-[11px] text-slate-500">
                Creates independent conditional closes; they will appear under your open orders on the main dashboard.
              </p>
            </div>
            {protectError ? <p className="mt-1 text-xs text-rose-400">{protectError}</p> : null}
          </div>
        </div>
      </section>

      <StepOrdersSection symbol={symbolNormal(symbol)} />
    </main>
  );
};
