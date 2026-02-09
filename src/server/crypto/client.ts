import ccxt, { type Exchange } from "ccxt";
import { getSettingSync } from "../db/settings";

let cachedExchange: Exchange | null = null;
let cachedExchangeId: string | null = null;

/**
 * Get (or create) a CCXT exchange instance configured from settings.
 * Caches the instance and invalidates when the exchange ID changes.
 */
export function getExchange(): Exchange {
  const exchangeId = getSettingSync("crypto_exchange") || "coinbase";
  const apiKey = String(getSettingSync("crypto_api_key") || "");
  // Coinbase Advanced Trade API secrets are PEM-encoded EC keys.
  // When pasted into a single-line input, literal "\n" sequences replace
  // real newlines. Restore them so the PEM parser can read the key.
  const rawSecret = String(getSettingSync("crypto_api_secret") || "");
  const apiSecret = rawSecret.replace(/\\n/g, "\n");
  const passphrase = String(getSettingSync("crypto_passphrase") || "");
  const sandboxMode = getSettingSync("crypto_sandbox_mode");

  // Return cached if config hasn't changed
  const cacheKey = `${exchangeId}:${apiKey}:${apiSecret.slice(0, 20)}`;
  if (cachedExchange && cachedExchangeId === cacheKey) {
    return cachedExchange;
  }

  // Validate exchange ID
  if (!(exchangeId in ccxt)) {
    throw new Error(
      `Unsupported exchange: "${exchangeId}". Supported: coinbase, binance, kraken, bybit, okx, etc.`
    );
  }

  const ExchangeClass = (ccxt as any)[exchangeId] as new (
    config: any
  ) => Exchange;

  const exchange = new ExchangeClass({
    apiKey,
    secret: apiSecret,
    password: passphrase, // some exchanges (e.g. Coinbase Advanced) require this
    enableRateLimit: true, // built-in rate limiting per exchange
  });

  // Enable sandbox/testnet by default
  if (sandboxMode !== "off" && sandboxMode !== "false") {
    try {
      exchange.setSandboxMode(true);
    } catch (err: any) {
      // CRITICAL: If sandbox mode fails, do NOT allow live trading
      console.error(
        `[Richy:Crypto] CRITICAL: Failed to enable sandbox mode for ${exchangeId}. ` +
        `Refusing to create exchange client to prevent accidental live trades. Error: ${err.message}`
      );
      throw new Error(
        `Cannot enable sandbox mode on ${exchangeId}. Either disable sandbox mode in settings ` +
        `(WARNING: this means REAL MONEY trades) or use an exchange that supports sandbox mode.`
      );
    }
    // Verify sandbox is actually active
    if (!(exchange as any).sandbox) {
      console.error(
        `[Richy:Crypto] CRITICAL: setSandboxMode() did not activate sandbox on ${exchangeId}`
      );
      throw new Error(
        `Sandbox mode failed to activate on ${exchangeId}. ` +
        `The exchange may not support sandbox/testnet trading.`
      );
    }
  }

  cachedExchange = exchange;
  cachedExchangeId = cacheKey;
  return exchange;
}

/**
 * Clear the cached exchange instance (e.g. after settings change).
 */
export function clearExchangeCache(): void {
  cachedExchange = null;
  cachedExchangeId = null;
}

/**
 * Check if trading is enabled in settings.
 */
export function isTradingEnabled(): boolean {
  const enabled = getSettingSync("crypto_trading_enabled");
  return enabled === "true" || enabled === "on";
}

/**
 * Get the maximum trade value in USD.
 */
export function getMaxTradeUsd(): number {
  const max = getSettingSync("crypto_max_trade_usd");
  if (typeof max === "number") return max;
  if (typeof max === "string") {
    const parsed = parseFloat(max);
    if (!isNaN(parsed)) return parsed;
  }
  return 100; // default $100
}
