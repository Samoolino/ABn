import type { Opportunity, RiskLimits } from '@abn/types';

export interface RiskSnapshot { dailyLoss: number; drawdown: number; openTrades: number; healthy: boolean; }

export function riskGate(o: Opportunity, r: RiskSnapshot, l: RiskLimits, now = Date.now()): {ok:boolean; reason?:string} {
  if (!r.healthy) return {ok:false,reason:'SYSTEM_UNHEALTHY'};
  if (r.dailyLoss >= l.maxDailyLoss) return {ok:false,reason:'MAX_DAILY_LOSS'};
  if (r.drawdown >= l.maxDrawdown) return {ok:false,reason:'MAX_DRAWDOWN'};
  if (r.openTrades >= l.maxOpenTrades) return {ok:false,reason:'MAX_OPEN_TRADES'};
  if (o.quantity > l.maxTradeSize) return {ok:false,reason:'MAX_TRADE_SIZE'};
  if (o.expiresAt - now > l.maxQuoteAgeMs && o.quoteTimestamp + l.maxQuoteAgeMs < now) return {ok:false,reason:'STALE_QUOTE'};
  if (o.expectedNetProfit < l.minProfit + l.safetyReserve) return {ok:false,reason:'PROFIT_FLOOR'};
  return {ok:true};
}
