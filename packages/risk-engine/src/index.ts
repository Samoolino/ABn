export interface RiskLimits {
  maxTradeSize: number;
  maxPosition: number;
  maxDailyLoss: number;
  maxDrawdown: number;
  maxSlippageBps: number;
  maxGas: number;
  maxQuoteAgeMs: number;
  maxUnhedgedTimeMs: number;
  maxOpenTrades: number;
}

export interface RiskSnapshot {
  tradeSize: number;
  position: number;
  dailyLoss: number;
  drawdown: number;
  slippageBps: number;
  gas: number;
  quoteAgeMs: number;
  unhedgedTimeMs: number;
  openTrades: number;
}

export interface RiskDecision { allowed: boolean; reasons: string[] }

export function evaluateRisk(s: RiskSnapshot, l: RiskLimits): RiskDecision {
  const reasons: string[] = [];
  if (s.tradeSize > l.maxTradeSize) reasons.push('MAX_TRADE_SIZE');
  if (s.position > l.maxPosition) reasons.push('MAX_POSITION');
  if (s.dailyLoss >= l.maxDailyLoss) reasons.push('MAX_DAILY_LOSS');
  if (s.drawdown >= l.maxDrawdown) reasons.push('MAX_DRAWDOWN');
  if (s.slippageBps > l.maxSlippageBps) reasons.push('MAX_SLIPPAGE');
  if (s.gas > l.maxGas) reasons.push('MAX_GAS');
  if (s.quoteAgeMs > l.maxQuoteAgeMs) reasons.push('STALE_QUOTE');
  if (s.unhedgedTimeMs > l.maxUnhedgedTimeMs) reasons.push('MAX_UNHEDGED_TIME');
  if (s.openTrades >= l.maxOpenTrades) reasons.push('MAX_OPEN_TRADES');
  return { allowed: reasons.length === 0, reasons };
}

export function passesRiskGate(s: RiskSnapshot, l: RiskLimits): boolean {
  return evaluateRisk(s, l).allowed;
}
