import { executableVwap, type OrderBookLevel } from './vwap';

export interface VenueSnapshot {
  venue: string;
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  takerFeeBps: number;
  timestamp: number;
}

export interface ScannerConfig {
  quantity: number;
  minProfit: number;
  maxQuoteAgeMs: number;
  gasCost: number;
  bridgeCost: number;
  settlementCost: number;
  fixedCost: number;
  safetyReserve: number;
}

export interface ScannerOpportunity {
  buyVenue: string;
  sellVenue: string;
  symbol: string;
  quantity: number;
  buyVwap: number;
  sellVwap: number;
  grossProfit: number;
  costs: number;
  expectedNetProfit: number;
  capitalAtRisk: number;
  executable: boolean;
  reason: string;
  timestamp: number;
}

export function scanPair(a: VenueSnapshot, b: VenueSnapshot, config: ScannerConfig): ScannerOpportunity | null {
  if (a.symbol !== b.symbol) return null;
  const now = Date.now();
  if (now - a.timestamp > config.maxQuoteAgeMs || now - b.timestamp > config.maxQuoteAgeMs) return null;

  const buy = executableVwap(a.asks, config.quantity);
  const sell = executableVwap(b.bids, config.quantity);
  if (!buy.filled || !sell.filled) return null;

  const grossProfit = sell.notional - buy.notional;
  const buyFee = buy.notional * a.takerFeeBps / 10_000;
  const sellFee = sell.notional * b.takerFeeBps / 10_000;
  const costs = buyFee + sellFee + config.gasCost + config.bridgeCost + config.settlementCost + config.fixedCost + config.safetyReserve;
  const expectedNetProfit = grossProfit - costs;
  const executable = expectedNetProfit >= config.minProfit;

  return {
    buyVenue: a.venue,
    sellVenue: b.venue,
    symbol: a.symbol,
    quantity: config.quantity,
    buyVwap: buy.vwap,
    sellVwap: sell.vwap,
    grossProfit,
    costs,
    expectedNetProfit,
    capitalAtRisk: buy.notional,
    executable,
    reason: executable ? 'PROFIT_FLOOR_PASSED' : 'NET_PROFIT_BELOW_FLOOR',
    timestamp: now,
  };
}
