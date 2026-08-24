export interface OrderBookLevel { price: number; quantity: number; }

export interface VwapResult {
  quantity: number;
  vwap: number;
  notional: number;
  filled: boolean;
  slippageBps: number;
}

/** Calculate executable VWAP against an order-book side. */
export function executableVwap(levels: OrderBookLevel[], requestedQuantity: number, referencePrice?: number): VwapResult {
  if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) throw new Error('INVALID_QUANTITY');
  if (!levels.length) return { quantity: 0, vwap: 0, notional: 0, filled: false, slippageBps: Infinity };

  let remaining = requestedQuantity;
  let notional = 0;
  let filled = 0;
  for (const level of levels) {
    if (level.price <= 0 || level.quantity <= 0) continue;
    const take = Math.min(remaining, level.quantity);
    notional += take * level.price;
    filled += take;
    remaining -= take;
    if (remaining <= Number.EPSILON) break;
  }

  const vwap = filled > 0 ? notional / filled : 0;
  const ref = referencePrice ?? levels[0]?.price ?? 0;
  const slippageBps = ref > 0 && vwap > 0 ? Math.abs(vwap - ref) / ref * 10_000 : Infinity;
  return { quantity: filled, vwap, notional, filled: filled + Number.EPSILON >= requestedQuantity, slippageBps };
}

export function rankByReturnOnRisk(items: Array<{ expectedNetProfit: number; capitalAtRisk: number }>) {
  return [...items].sort((a, b) => {
    const ar = a.capitalAtRisk > 0 ? a.expectedNetProfit / a.capitalAtRisk : -Infinity;
    const br = b.capitalAtRisk > 0 ? b.expectedNetProfit / b.capitalAtRisk : -Infinity;
    return br - ar;
  });
}
