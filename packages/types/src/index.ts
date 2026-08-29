export type RuntimeState = 'STOPPED' | 'DRY_RUN' | 'ARMED' | 'LIVE' | 'EMERGENCY_STOP';

export type OpportunityStatus =
  | 'DISCOVERED' | 'VALIDATING' | 'EXECUTABLE' | 'EXECUTING'
  | 'PARTIAL' | 'SETTLING' | 'COMPLETED' | 'REJECTED' | 'FAILED' | 'EXPIRED';

export type CapitalSource = 'FUNDED_INVENTORY' | 'CEX_ACCOUNT_BALANCES' | 'FLASH_LOAN' | 'OTHER';

export interface TokenRef { chainId: number; address: string; symbol: string; decimals: number }

export interface NormalizedQuote {
  venue: string;
  symbol: string;
  network?: string;
  bid: number;
  ask: number;
  vwapBuy?: number;
  vwapSell?: number;
  quantity: number;
  timestamp: number;
}

export interface Opportunity {
  id: string;
  correlationId?: string;
  symbol: string;
  buyVenue: string;
  sellVenue: string;
  buyNetwork?: string;
  sellNetwork?: string;
  quantity: number;
  grossProfit: number;
  tradingFees: number;
  gasCost: number;
  slippageCost: number;
  bridgeCost: number;
  settlementCost: number;
  safetyReserve: number;
  netProfit: number;
  /** Compatibility alias used by the worker/database projection. */
  expectedNetProfit?: number;
  netProfitPct: number;
  /** Capital required for the selected opportunity size. */
  capitalRequired?: number;
  /** Policy source from which execution capital is expected. */
  capitalSource?: CapitalSource;
  quoteTimestamp: number;
  expiresAt: number;
  status: OpportunityStatus;
  confidence?: number;
}

export interface ProfitAssertionInput {
  grossProceeds: number;
  purchaseCost: number;
  buyFee: number;
  sellFee: number;
  gas: number;
  slippage: number;
  bridge: number;
  settlement: number;
  fixedCost: number;
  safetyReserve: number;
  minProfit: number;
}

export function expectedNetProfit(i: ProfitAssertionInput): number {
  return i.grossProceeds - i.purchaseCost - i.buyFee - i.sellFee - i.gas - i.slippage - i.bridge - i.settlement - i.fixedCost - i.safetyReserve;
}

export function isExecutable(i: ProfitAssertionInput): boolean {
  return expectedNetProfit(i) >= i.minProfit;
}
