import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { ReverseStrategySection } from "../components/steps/ReverseStrategySection";

type SupportedSymbol = "BTCUSDT" | "ETHUSDT" | "SOLUSDT";
const SUPPORTED_SYMBOLS: SupportedSymbol[] = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

const symbolNormal = (s: string): SupportedSymbol => {
  const normalized = s.trim().toUpperCase().replace(/[_\-/]/g, "");
  return SUPPORTED_SYMBOLS.includes(normalized as SupportedSymbol) ? (normalized as SupportedSymbol) : "BTCUSDT";
};

export const ReverseStrategyPage = () => {
  const { currentAccount } = useAuth();
  const [symbol, setSymbol] = useState<SupportedSymbol>("BTCUSDT");
  const selectedSymbol = symbolNormal(symbol);

  useEffect(() => {
    setSymbol(selectedSymbol);
  }, [selectedSymbol]);

  if (!currentAccount) {
    return (
      <main className="mx-auto mt-14 max-w-5xl px-4">
        <section className="glass-card rounded-2xl p-8">
          <h2 className="text-xl font-semibold">Sign in for reverse strategy</h2>
          <p className="mt-2 text-slate-300">
            Reverse strategy runs on the server with your Binance API keys. Sign in to use this page.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto mt-8 max-w-6xl px-4">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300/90">Trading</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-50">Reverse strategy</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Run the hedged long/short ladder strategy independently from step trading.
          </p>
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

      <ReverseStrategySection symbol={selectedSymbol} />
    </main>
  );
};

