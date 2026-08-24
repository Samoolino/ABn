export interface RiskSnapshot { expectedNetProfit:number; safetyReserve:number; quoteAgeMs:number; maxQuoteAgeMs:number; slippageBps:number; maxSlippageBps:number; gasCost:number; maxGasCost:number; openTrades:number; maxOpenTrades:number; capitalApproved:boolean; venueHealthy:boolean; }
export interface RiskDecision { approved:boolean; reasons:string[]; }
export function evaluateRisk(s:RiskSnapshot):RiskDecision {
 const reasons:string[]=[];
 if(s.expectedNetProfit<=s.safetyReserve) reasons.push('PROFIT_FLOOR_FAILED');
 if(s.quoteAgeMs>s.maxQuoteAgeMs) reasons.push('STALE_QUOTE');
 if(s.slippageBps>s.maxSlippageBps) reasons.push('SLIPPAGE_LIMIT');
 if(s.gasCost>s.maxGasCost) reasons.push('GAS_LIMIT');
 if(s.openTrades>=s.maxOpenTrades) reasons.push('OPEN_TRADE_LIMIT');
 if(!s.capitalApproved) reasons.push('CAPITAL_GATE');
 if(!s.venueHealthy) reasons.push('VENUE_UNHEALTHY');
 return {approved:reasons.length===0,reasons};
}
