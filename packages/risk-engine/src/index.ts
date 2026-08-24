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

export function passesRiskGate(s: RiskSnapshot, l: RiskLimits): boolean {
  return s.tradeSize <= l.maxTradeSize &&
    s.position <= l.maxPosition &&
    s.dailyLoss <= l.maxDailyLoss &&
    s.drawdown <= l.maxDrawdown &&
    s.slippageBps <= l.maxSlippageBps &&
    s.gas <= l.maxGas &&
    s.quoteAgeMs <= l.maxQuoteAgeMs &&
    s.unhedgedTimeMs <= l.maxUnhedgedTimeMs &&
    s.openTrades < l.maxOpenTrades;
}
