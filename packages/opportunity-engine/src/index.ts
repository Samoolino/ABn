import { expectedNetProfit } from '@abn/types';

export interface QuoteLeg { venue: string; network?: string; quantity: number; vwap: number; fee: number; gas: number; slippage: number; }
export interface OpportunityCandidate { buy: QuoteLeg; sell: QuoteLeg; bridgeCost: number; settlementCost: number; fixedCost: number; safetyReserve: number; minProfit: number; }

export function evaluateCandidate(c: OpportunityCandidate) {
  const purchaseCost = c.buy.quantity * c.buy.vwap;
  const grossProceeds = c.sell.quantity * c.sell.vwap;
  const netProfit = expectedNetProfit({ grossProceeds, purchaseCost, buyFee: c.buy.fee, sellFee: c.sell.fee, gas: c.buy.gas + c.sell.gas, slippage: c.buy.slippage + c.sell.slippage, bridge: c.bridgeCost, settlement: c.settlementCost, fixedCost: c.fixedCost, safetyReserve: c.safetyReserve, minProfit: c.minProfit });
  return { netProfit, executable: netProfit >= c.minProfit, capitalAtRisk: Math.max(0, purchaseCost), returnOnRisk: purchaseCost > 0 ? netProfit / purchaseCost : 0 };
}

export function rankCandidates<T extends { netProfit: number; capitalAtRisk: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => (b.capitalAtRisk > 0 ? b.netProfit / b.capitalAtRisk : -Infinity) - (a.capitalAtRisk > 0 ? a.netProfit / a.capitalAtRisk : -Infinity));
}
