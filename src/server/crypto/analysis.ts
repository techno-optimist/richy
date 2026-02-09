import { getExchange } from "./client";

export interface TechnicalIndicators {
  symbol: string;
  timeframe: string;
  price: number;
  sma: { sma7: number; sma20: number; sma50: number };
  ema: { ema12: number; ema26: number };
  rsi14: number;
  macd: { macd: number; signal: number; histogram: number };
  support: number;
  resistance: number;
  volumeTrend: "increasing" | "decreasing" | "stable";
  trend: "bullish" | "bearish" | "neutral";
  signals: string[];
}

// ─── Indicator computations ─────────────────────────────────────────

function computeSMA(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1];
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function computeEMA(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1];
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

function computeEMASeries(closes: number[], period: number): number[] {
  const series: number[] = [];
  if (closes.length < period) {
    return closes.map(() => closes[0]);
  }
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = 0; i < period; i++) series.push(ema);
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
    series.push(ema);
  }
  return series;
}

function computeRSI(closes: number[], period: number = 14): number {
  if (closes.length < period + 1) return 50;

  let avgGain = 0;
  let avgLoss = 0;

  // Initial average
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  // Wilder's smoothing
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function computeMACD(
  closes: number[]
): { macd: number; signal: number; histogram: number } {
  const ema12 = computeEMASeries(closes, 12);
  const ema26 = computeEMASeries(closes, 26);

  const macdLine: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    macdLine.push(ema12[i] - ema26[i]);
  }

  // Signal line = 9-period EMA of MACD line
  const signalLine = computeEMASeries(macdLine, 9);

  const macd = macdLine[macdLine.length - 1];
  const signal = signalLine[signalLine.length - 1];
  return { macd, signal, histogram: macd - signal };
}

function findSupportResistance(
  highs: number[],
  lows: number[],
  closes: number[],
  windowSize: number = 5
): { support: number; resistance: number } {
  const swingHighs: number[] = [];
  const swingLows: number[] = [];

  for (let i = windowSize; i < highs.length - windowSize; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= windowSize; j++) {
      if (highs[i] <= highs[i - j] || highs[i] <= highs[i + j]) isHigh = false;
      if (lows[i] >= lows[i - j] || lows[i] >= lows[i + j]) isLow = false;
    }
    if (isHigh) swingHighs.push(highs[i]);
    if (isLow) swingLows.push(lows[i]);
  }

  const currentPrice = closes[closes.length - 1];

  // Support: highest swing low below current price
  const supports = swingLows.filter((l) => l < currentPrice);
  const support =
    supports.length > 0
      ? Math.max(...supports)
      : Math.min(...lows.slice(-20));

  // Resistance: lowest swing high above current price
  const resistances = swingHighs.filter((h) => h > currentPrice);
  const resistance =
    resistances.length > 0
      ? Math.min(...resistances)
      : Math.max(...highs.slice(-20));

  return { support, resistance };
}

function classifyVolumeTrend(
  volumes: number[]
): "increasing" | "decreasing" | "stable" {
  if (volumes.length < 10) return "stable";
  const recent = volumes.slice(-5);
  const prior = volumes.slice(-10, -5);
  const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
  const avgPrior = prior.reduce((a, b) => a + b, 0) / prior.length;
  const ratio = avgRecent / (avgPrior || 1);
  if (ratio > 1.2) return "increasing";
  if (ratio < 0.8) return "decreasing";
  return "stable";
}

// ─── Main exports ───────────────────────────────────────────────────

export async function computeIndicators(
  symbol: string,
  timeframe: string = "1h"
): Promise<TechnicalIndicators> {
  const exchange = getExchange();
  const ohlcv = await exchange.fetchOHLCV(symbol, timeframe, undefined, 60);

  if (!ohlcv || ohlcv.length < 10) {
    throw new Error(`Not enough candle data for ${symbol} (got ${ohlcv?.length || 0})`);
  }

  const closes = ohlcv.map((c) => c[4] as number);
  const highs = ohlcv.map((c) => c[2] as number);
  const lows = ohlcv.map((c) => c[3] as number);
  const volumes = ohlcv.map((c) => c[5] as number);
  const price = closes[closes.length - 1];

  const sma7 = computeSMA(closes, 7);
  const sma20 = computeSMA(closes, 20);
  const sma50 = computeSMA(closes, 50);
  const ema12 = computeEMA(closes, 12);
  const ema26 = computeEMA(closes, 26);
  const rsi14 = computeRSI(closes, 14);
  const macd = computeMACD(closes);
  const { support, resistance } = findSupportResistance(highs, lows, closes);
  const volumeTrend = classifyVolumeTrend(volumes);

  // ─── Classify overall trend ─────────────────────────────────
  let bullishCount = 0;
  let bearishCount = 0;

  if (price > sma7) bullishCount++;
  else bearishCount++;
  if (price > sma20) bullishCount++;
  else bearishCount++;
  if (price > sma50) bullishCount++;
  else bearishCount++;
  if (rsi14 > 50) bullishCount++;
  else if (rsi14 < 50) bearishCount++;
  if (macd.histogram > 0) bullishCount++;
  else if (macd.histogram < 0) bearishCount++;

  const trend: "bullish" | "bearish" | "neutral" =
    bullishCount >= 4 ? "bullish" : bearishCount >= 4 ? "bearish" : "neutral";

  // ─── Generate human-readable signals ────────────────────────
  const signals: string[] = [];

  if (rsi14 < 30) signals.push(`RSI oversold (${rsi14.toFixed(0)})`);
  else if (rsi14 > 70) signals.push(`RSI overbought (${rsi14.toFixed(0)})`);

  if (macd.histogram > 0 && macd.macd > macd.signal)
    signals.push("MACD bullish crossover");
  else if (macd.histogram < 0 && macd.macd < macd.signal)
    signals.push("MACD bearish crossover");

  if (sma7 > sma20 && sma20 > sma50) signals.push("Golden alignment SMA7>20>50");
  else if (sma7 < sma20 && sma20 < sma50) signals.push("Death alignment SMA7<20<50");

  if (price > sma7 && price > sma20) signals.push("Price above all short MAs");
  else if (price < sma7 && price < sma20) signals.push("Price below all short MAs");

  if (volumeTrend === "increasing") signals.push("Volume increasing");
  else if (volumeTrend === "decreasing") signals.push("Volume decreasing");

  const distToSupport = ((price - support) / price) * 100;
  const distToResist = ((resistance - price) / price) * 100;
  if (distToSupport < 2) signals.push(`Near support ($${support.toFixed(0)})`);
  if (distToResist < 2) signals.push(`Near resistance ($${resistance.toFixed(0)})`);

  return {
    symbol,
    timeframe,
    price,
    sma: { sma7, sma20, sma50 },
    ema: { ema12, ema26 },
    rsi14,
    macd,
    support,
    resistance,
    volumeTrend,
    trend,
    signals,
  };
}

export async function computeAllIndicators(
  symbols: string[],
  timeframe: string = "1h"
): Promise<Record<string, TechnicalIndicators>> {
  const results: Record<string, TechnicalIndicators> = {};
  const settled = await Promise.allSettled(
    symbols.map((s) => computeIndicators(s, timeframe))
  );
  for (let i = 0; i < symbols.length; i++) {
    const result = settled[i];
    if (result.status === "fulfilled") {
      results[symbols[i]] = result.value;
    } else {
      console.error(
        `[Richy:Analysis] Failed to compute indicators for ${symbols[i]}:`,
        result.reason?.message || result.reason
      );
    }
  }
  return results;
}
