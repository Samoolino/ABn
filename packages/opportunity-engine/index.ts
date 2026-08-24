import type { Quote, Opportunity } from '@abn/types';

export interface CostModel { buyFee:number; sellFee:number; gas:number; slippage:number; bridge:number; settlement:number; fixed:number; reserve:number; }

export function buildOpportunity(buy: Quote, sell: Quote, costs: CostModel): Opportunity | null {
  if (buy.symbol !== sell.symbol || buy.quantity <= 0 || sell.quantity <= 0) return null;
  const quantity = Math.min(buy.quantity, sell.quantity);
  const grossProfit = (sell.vwap - buy.vwap) * quantity;
  const tradingFees = costs.buyFee + costs.sellFee;
  const total = costs.buyFee + costs.sellFee + costs.gas + costs.slippage + costs.bridge + costs.settlement + costs.fixed + costs.reserve;
  const expectedNetProfit = grossProfit - total;
  return { id: crypto.randomUUID(), symbol: buy.symbol, buyVenue: buy.venue, sellVenue: sell.venue, buyNetwork: buy.network, sellNetwork: sell.network, quantity, grossProfit, tradingFees, gasCost:costs.gas, slippageCost:costs.slippage, bridgeCost:costs.bridge, settlementCost:costs.settlement, safetyReserve:costs.reserve, expectedNetProfit, netProfitPct: buy.vwap > 0 ? expectedNetProfit/(buy.vwap*quantity)*100 : 0, capitalRequired: buy.vwap*quantity, capitalSource:'COMPOSITE', status:'DISCOVERED', quoteTimestamp:Math.min(buy.timestamp,sell.timestamp), expiresAt:Math.min(buy.expiresAt,sell.expiresAt), confidence:0 };
}
