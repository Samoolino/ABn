import { createCEXAdapter } from '@abn/cex-adapters';
import type { CEXId, CEXAdapter } from '@abn/venue-adapters';
import type { Opportunity } from '@abn/types';

export interface PairExecutionConnector { buy: CEXAdapter; sell: CEXAdapter; }
export interface PairExecutionInput {
  correlationId: string; opportunityId: string;
  buy: { symbol: string; amount: number; type: 'market' | 'limit' };
  sell: { symbol: string; amount: number; type: 'market' | 'limit' };
  capital: { available: number; source: string; commitmentMs: number; repayable: boolean; repaymentAmount: number; collateralRequired: number };
}
export interface PairExecutionResult {
  status: 'COMPLETED' | 'FAILED' | 'TIMEOUT' | 'HEDGE_OR_EXIT';
  buyOrderId?: string; sellOrderId?: string; hedgeOrderId?: string;
  hedgeSide?: 'buy' | 'sell'; hedgeQuantity?: number; reconciliation?: unknown;
}
const CEX_IDS = new Set<CEXId>(['mexc','gate','binance','kraken','okx','bybit','coinbase','kucoin','bitfinex','lbank']);
const ENV_PREFIX: Record<CEXId, string> = { mexc:'MEXC', gate:'GATE', binance:'BINANCE', kraken:'KRAKEN', okx:'OKX', bybit:'BYBIT', coinbase:'COINBASE', kucoin:'KUCOIN', bitfinex:'BITFINEX', lbank:'LBANK' };
function cexId(venue: string): CEXId { const id = venue.toLowerCase() as CEXId; if (!CEX_IDS.has(id)) throw new Error(`CEX_UNSUPPORTED:${venue}`); return id; }
export function createCEXAdapterFromEnv(venue: string): CEXAdapter {
  const id = cexId(venue), p = ENV_PREFIX[id]; const apiKey = process.env[`${p}_API_KEY`]; const secret = process.env[`${p}_API_SECRET`]; const password = process.env[`${p}_PASSWORD`];
  if (!apiKey || !secret) throw new Error(`CEX_CREDENTIALS_NOT_CONFIGURED:${p}`);
  return createCEXAdapter(id, { apiKey, secret, ...(password ? { password } : {}) });
}
export function createCEXPairExecutionConnector(buy: CEXAdapter, sell: CEXAdapter): PairExecutionConnector { return { buy, sell }; }
async function hedgeResidual(buyAdapter: CEXAdapter, sellAdapter: CEXAdapter, input: PairExecutionInput, buyFilled: number, sellFilled: number): Promise<{ orderId: string; side: 'buy' | 'sell'; quantity: number }> {
  const buyResidual = Math.max(0, buyFilled - sellFilled), sellResidual = Math.max(0, sellFilled - buyFilled);
  if (buyResidual > 0) {
    const order = await buyAdapter.createOrder({ symbol: input.buy.symbol, side: 'sell', amount: buyResidual, type: 'market' });
    const status = await buyAdapter.orderStatus(order.id, input.buy.symbol);
    if (!(status.status === 'closed' || status.status === 'filled') || status.filled + Number.EPSILON < buyResidual) throw new Error(`PAIR_HEDGE_FAILED:sell:${buyResidual}`);
    await buyAdapter.reconcile();
    return { orderId: order.id, side: 'sell', quantity: buyResidual };
  }
  if (sellResidual > 0) {
    const order = await sellAdapter.createOrder({ symbol: input.sell.symbol, side: 'buy', amount: sellResidual, type: 'market' });
    const status = await sellAdapter.orderStatus(order.id, input.sell.symbol);
    if (!(status.status === 'closed' || status.status === 'filled') || status.filled + Number.EPSILON < sellResidual) throw new Error(`PAIR_HEDGE_FAILED:buy:${sellResidual}`);
    await sellAdapter.reconcile();
    return { orderId: order.id, side: 'buy', quantity: sellResidual };
  }
  throw new Error('PAIR_HEDGE_NO_RESIDUAL');
}
export async function executePair(opportunity: Opportunity, input: PairExecutionInput, connector: PairExecutionConnector, timeoutMs: number): Promise<PairExecutionResult> {
  if (!Number.isFinite(opportunity.expectedNetProfit) || opportunity.expectedNetProfit <= 0) throw new Error('PAIR_NET_PROFIT_GATE_REJECTED');
  if (!Number.isFinite(opportunity.capitalRequired) || opportunity.capitalRequired <= 0) throw new Error('PAIR_CAPITAL_REQUIRED_INVALID');
  if (opportunity.expiresAt <= Date.now()) throw new Error('PAIR_OPPORTUNITY_EXPIRED');
  if (input.capital.source !== 'FUNDED_INVENTORY') throw new Error('PAIR_CAPITAL_SOURCE_REJECTED');
  if (!Number.isFinite(input.capital.available) || input.capital.available < opportunity.capitalRequired) throw new Error('PAIR_CAPITAL_INSUFFICIENT');
  if (!input.correlationId || !input.opportunityId) throw new Error('PAIR_CORRELATION_REQUIRED');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('PAIR_TIMEOUT_INVALID');
  const started = Date.now();
  const [buyOrder, sellOrder] = await Promise.all([
    connector.buy.createOrder({ symbol: input.buy.symbol, side: 'buy', amount: input.buy.amount, type: input.buy.type }),
    connector.sell.createOrder({ symbol: input.sell.symbol, side: 'sell', amount: input.sell.amount, type: input.sell.type }),
  ]);
  if (Date.now() - started > timeoutMs) return { status: 'TIMEOUT', buyOrderId: buyOrder.id, sellOrderId: sellOrder.id };
  const [buyStatus, sellStatus] = await Promise.all([
    connector.buy.orderStatus(buyOrder.id, input.buy.symbol), connector.sell.orderStatus(sellOrder.id, input.sell.symbol),
  ]);
  const buyFilled = buyStatus.status === 'closed' || buyStatus.status === 'filled';
  const sellFilled = sellStatus.status === 'closed' || sellStatus.status === 'filled';
  if (buyFilled && sellFilled) return { status: 'COMPLETED', buyOrderId: buyOrder.id, sellOrderId: sellOrder.id };
  await Promise.allSettled([
    buyFilled ? Promise.resolve() : connector.buy.cancelOrder(buyOrder.id, input.buy.symbol),
    sellFilled ? Promise.resolve() : connector.sell.cancelOrder(sellOrder.id, input.sell.symbol),
  ]);
  const buyFilledQuantity = Number.isFinite(buyStatus.filled) ? Math.max(0, buyStatus.filled) : 0;
  const sellFilledQuantity = Number.isFinite(sellStatus.filled) ? Math.max(0, sellStatus.filled) : 0;
  if (buyFilledQuantity === 0 && sellFilledQuantity === 0) return { status: 'FAILED', buyOrderId: buyOrder.id, sellOrderId: sellOrder.id };
  try {
    const hedge = await hedgeResidual(connector.buy, connector.sell, input, buyFilledQuantity, sellFilledQuantity);
    return { status: 'HEDGE_OR_EXIT', buyOrderId: buyOrder.id, sellOrderId: sellOrder.id, hedgeOrderId: hedge.orderId, hedgeSide: hedge.side, hedgeQuantity: hedge.quantity, reconciliation: { reconciled: true } };
  } catch {
    return { status: 'HEDGE_OR_EXIT', buyOrderId: buyOrder.id, sellOrderId: sellOrder.id };
  }
}
