import { useEffect, useRef } from "react";
import {
  ColorType,
  CrosshairMode,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp
} from "lightweight-charts";

export type MarkCandlesShape = {
  time: number[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
};

const BINANCE_UP = "#0ECB81";
const BINANCE_DOWN = "#F6465D";
const CHART_BG = "#131722";
const GRID = "#2B2B43";
const BORDER = "#363A45";
const TEXT = "#848E9C";

function toChartData(c: MarkCandlesShape) {
  const n = c.time.length;
  const rows: Array<{ time: UTCTimestamp; open: number; high: number; low: number; close: number }> = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      time: c.time[i] as UTCTimestamp,
      open: c.open[i],
      high: c.high[i],
      low: c.low[i],
      close: c.close[i]
    });
  }
  rows.sort((a, b) => a.time - b.time);
  return rows;
}

type Props = {
  candles: MarkCandlesShape | null;
  /** Live mark price from WebSocket — drawn as a horizontal price line on the series. */
  liveMarkPrice?: number | null;
  height?: number;
};

const LIVE_MARK_LINE = "#F0B90B";

export const MarkPriceCandleChart = ({ candles, liveMarkPrice = null, height = 360 }: Props) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const liveLineRef = useRef<IPriceLine | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const chart = createChart(el, {
      width: el.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: CHART_BG },
        textColor: TEXT,
        fontFamily: "Inter, system-ui, Segoe UI, Roboto, sans-serif"
      },
      grid: {
        vertLines: { color: GRID },
        horzLines: { color: GRID }
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#758696", width: 1, style: 3, labelBackgroundColor: "#4c525e" },
        horzLine: { color: "#758696", width: 1, style: 3, labelBackgroundColor: "#4c525e" }
      },
      rightPriceScale: {
        borderColor: BORDER,
        scaleMargins: { top: 0.08, bottom: 0.2 }
      },
      timeScale: {
        borderColor: BORDER,
        timeVisible: true,
        secondsVisible: false
      },
      localization: {
        priceFormatter: (p: number) => p.toFixed(2)
      }
    });

    const series = chart.addCandlestickSeries({
      upColor: BINANCE_UP,
      downColor: BINANCE_DOWN,
      borderUpColor: BINANCE_UP,
      borderDownColor: BINANCE_DOWN,
      wickUpColor: BINANCE_UP,
      wickDownColor: BINANCE_DOWN
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      if (!wrapRef.current) return;
      chart.applyOptions({ width: wrapRef.current.clientWidth });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      liveLineRef.current = null;
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height]);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;

    if (!candles || candles.time.length === 0) {
      series.setData([]);
      return;
    }

    const data = toChartData(candles);
    series.setData(data);
    chart.timeScale().fitContent();
  }, [candles]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    if (liveMarkPrice === null || liveMarkPrice === undefined || !Number.isFinite(liveMarkPrice)) {
      if (liveLineRef.current) {
        series.removePriceLine(liveLineRef.current);
        liveLineRef.current = null;
      }
      return;
    }

    if (!liveLineRef.current) {
      liveLineRef.current = series.createPriceLine({
        price: liveMarkPrice,
        color: LIVE_MARK_LINE,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "Live mark"
      });
    } else {
      liveLineRef.current.applyOptions({ price: liveMarkPrice });
    }
  }, [liveMarkPrice]);

  return (
    <div
      ref={wrapRef}
      className="w-full overflow-hidden rounded-lg border border-slate-700/80"
      style={{ minHeight: height }}
      aria-label="Mark price candlestick chart"
    />
  );
};
