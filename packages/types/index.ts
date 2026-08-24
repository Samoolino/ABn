export type RuntimeMode = 'STOPPED' | 'DRY_RUN' | 'ARMED' | 'LIVE' | 'EMERGENCY_STOP';
export type OpportunityStatus = 'DISCOVERED' | 'VALIDATING' | 'EXECUTABLE' | 'EXECUTING' | 'PARTIAL' | 'SETTLING' | 'COMPLETED' | 'REJECTED' | 'FAILED' | 'EXPIRED';

export interface Quote { venue: string; network?: string; symbol: string; side: 'buy' | 'sell'; quantity: number; vwap: number; fee: number; gasCost: number; slippage: number; timestamp: number; expiresAt: number; }
export interface Opportunity { id: string; symbol: string; buyVenue: string; sellVenue: string; buyNetwork?: string; sellNetwork?: string; quantity: number; grossProfit: number; tradingFees: number; gasCost: number; slippageCost: number; bridgeCost: number; settlementCost: number; safetyReserve: number; expectedNetProfit: number; netProfitPct: number; capitalRequired: number; capitalSource: 'FUNDED_INVENTORY' | 'TEMPORARY_LIQUIDITY' | 'FLASH_LIQUIDITY' | 'COMPOSITE'; status: OpportunityStatus; quoteTimestamp: number; expiresAt: number; confidence: number; }
export interface CapitalAccess { available: number; source: Opportunity['capitalSource']; commitmentMs: number; repayable: boolean; repaymentAmount: number; collateralRequired: number; }
export interface RiskLimits { minProfit: number; safetyReserve: number; maxTradeSize: number; maxPosition: number; maxDailyLoss: number; maxDrawdown: number; maxSlippageBps: number; maxGas: number; maxQuoteAgeMs: number; maxUnhedgedTimeMs: number; maxOpenTrades: number; }

export const isExecutable = (o: Opportunity, now = Date.now(), limits?: Partial<RiskLimits>) => {
  const minProfit = limits?.minProfit ?? 0;
  const reserve = limits?.safetyReserve ?? o.safetyReserve;
  return o.expectedNetProfit >= minProfit + reserve && o.expiresAt > now && o.quantity > 0 && o.capitalRequired > 0;
};
