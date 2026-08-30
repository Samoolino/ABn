import { describe, expect, it, vi } from 'vitest';
import type { CEXAdapter } from '@abn/venue-adapters';
import { executePair, type PairExecutionConnector, type PairExecutionInput } from './cex-pair';

const opportunity = {
  id: 'opp-1', symbol: 'ETH/USDC', buyVenue: 'binance', sellVenue: 'kraken', quantity: 1,
  grossProfit: 10, tradingFees: 1, gasCost: 0, slippageCost: 0, bridgeCost: 0, settlementCost: 0,
  safetyReserve: 1, netProfit: 8, expectedNetProfit: 8, netProfitPct: 0.8,
  capitalRequired: 100, capitalSource: 'FUNDED_INVENTORY' as const,
  quoteTimestamp: Date.now(), expiresAt: Date.now() + 60_000, status: 'EXECUTABLE' as const,
};

const input: PairExecutionInput = {
  correlationId: 'corr-1', opportunityId: 'opp-1',
  buy: { symbol: 'ETH/USDC', amount: 1, type: 'market' },
  sell: { symbol: 'ETH/USDC', amount: 1, type: 'market' },
  capital: { available: 1_000, source: 'FUNDED_INVENTORY', commitmentMs: 10_000, repayable: false, repaymentAmount: 0, collateralRequired: 0 },
};

function adapter(statuses: Array<{ status: string; filled: number }>, options?: { hedgeFails?: boolean; reconcileFails?: boolean; statusDelayMs?: number; createDelayMs?: number }): CEXAdapter {
  let orderNumber = 0; let statusIndex = 0;
  const createOrder = vi.fn(async () => {
    if (options?.createDelayMs) await new Promise(resolve => setTimeout(resolve, options.createDelayMs));
    if (options?.hedgeFails && orderNumber > 0) throw new Error('HEDGE_FAILED');
    orderNumber += 1; return { id: `order-${orderNumber}`, status: 'open' };
  });
  const orderStatus = vi.fn(async () => {
    if (options?.statusDelayMs) await new Promise(resolve => setTimeout(resolve, options.statusDelayMs));
    return statuses[Math.min(statusIndex++, statuses.length - 1)] ?? { status: 'open', filled: 0 };
  });
  const cancelOrder = vi.fn(async () => undefined);
  const reconcile = vi.fn(async () => {
    if (options?.reconcileFails) throw new Error('RECONCILIATION_FAILED');
    return { id: 'reconciled', status: 'closed', filled: 1, fee: 1 };
  });
  return { venue: 'binance', connect: vi.fn(async () => undefined), health: vi.fn(async () => true), markets: vi.fn(async () => ['ETH/USDC']), orderBook: vi.fn(async () => ({ bids: [], asks: [], timestamp: Date.now() })), balances: vi.fn(async () => ({ ETH: 10, USDC: 10_000 })), fees: vi.fn(async () => ({ maker: 0.001, taker: 0.001 })), createOrder, cancelOrder, orderStatus, reconcile } as unknown as CEXAdapter;
}
function connector(buy: CEXAdapter, sell: CEXAdapter): PairExecutionConnector { return { buy, sell }; }

describe('executePair partial-fill recovery', () => {
  it('completes when both legs fill and reconcile', async () => {
    const result = await executePair(opportunity, input, connector(adapter([{ status: 'closed', filled: 1 }]), adapter([{ status: 'closed', filled: 1 }])), 5_000);
    expect(result.status).toBe('COMPLETED'); expect(result.recovery?.reconciled).toBe(true);
  });
  it('hedges a buy-only residual', async () => {
    const buy = adapter([{ status: 'open', filled: 0 }, { status: 'closed', filled: 0.4 }]);
    const sell = adapter([{ status: 'open', filled: 0 }, { status: 'open', filled: 0 }]);
    const result = await executePair(opportunity, input, connector(buy, sell), 5_000);
    expect(result.status).toBe('HEDGE_OR_EXIT'); expect(result.recovery?.buyFilled).toBe(0.4); expect(buy.createOrder).toHaveBeenCalledTimes(2);
  });
  it('hedges a sell-only residual', async () => {
    const buy = adapter([{ status: 'open', filled: 0 }, { status: 'open', filled: 0 }]);
    const sell = adapter([{ status: 'open', filled: 0 }, { status: 'closed', filled: 0.6 }]);
    const result = await executePair(opportunity, input, connector(buy, sell), 5_000);
    expect(result.status).toBe('HEDGE_OR_EXIT'); expect(result.recovery?.sellFilled).toBe(0.6); expect(sell.createOrder).toHaveBeenCalledTimes(2);
  });
  it('nets both partial fills and hedges only the residual exposure', async () => {
    const buy = adapter([{ status: 'open', filled: 0 }, { status: 'closed', filled: 0.4 }]);
    const sell = adapter([{ status: 'open', filled: 0 }, { status: 'closed', filled: 0.6 }]);
    const result = await executePair(opportunity, input, connector(buy, sell), 5_000);
    expect(result.status).toBe('HEDGE_OR_EXIT');
    expect(result.recovery?.buyFilled).toBe(0.4);
    expect(result.recovery?.sellFilled).toBe(0.6);
    expect(buy.createOrder).toHaveBeenCalledTimes(1);
    expect(sell.createOrder).toHaveBeenCalledTimes(2);
    expect(sell.createOrder).toHaveBeenLastCalledWith({ symbol: 'ETH/USDC', side: 'buy', amount: expect.closeTo(0.2, 10), type: 'market' });
  });
  it('fails when neither leg fills', async () => {
    const result = await executePair(opportunity, input, connector(adapter([{ status: 'open', filled: 0 }, { status: 'canceled', filled: 0 }]), adapter([{ status: 'open', filled: 0 }, { status: 'canceled', filled: 0 }])), 5_000);
    expect(result.status).toBe('FAILED');
  });
  it('fails when hedge cannot fill', async () => {
    const result = await executePair(opportunity, input, connector(adapter([{ status: 'open', filled: 0 }, { status: 'closed', filled: 0.4 }], { hedgeFails: true }), adapter([{ status: 'open', filled: 0 }, { status: 'open', filled: 0 }])), 5_000);
    expect(result.status).toBe('FAILED');
  });
  it('fails when reconciliation fails', async () => {
    const result = await executePair(opportunity, input, connector(adapter([{ status: 'closed', filled: 1 }], { reconcileFails: true }), adapter([{ status: 'closed', filled: 1 }])), 5_000);
    expect(result.status).toBe('FAILED');
  });
  it('completes when timeout occurs after both legs actually filled', async () => {
    const buy = adapter([{ status: 'closed', filled: 1 }], { statusDelayMs: 10 });
    const sell = adapter([{ status: 'closed', filled: 1 }], { statusDelayMs: 10 });
    const result = await executePair(opportunity, input, connector(buy, sell), 1);
    expect(result.status).toBe('COMPLETED');
  });
  it('recovers residual exposure after initial placement timeout', async () => {
    const buy = adapter([{ status: 'closed', filled: 0.3 }], { createDelayMs: 10 });
    const sell = adapter([{ status: 'closed', filled: 0 }], { createDelayMs: 10 });
    const result = await executePair(opportunity, input, connector(buy, sell), 1);
    expect(result.status).toBe('HEDGE_OR_EXIT');
    expect(result.recovery?.buyFilled).toBe(0.3);
    expect(result.recovery?.sellFilled).toBe(0);
    expect(buy.cancelOrder).toHaveBeenCalledTimes(1);
    expect(sell.cancelOrder).toHaveBeenCalledTimes(1);
    expect(buy.orderStatus).toHaveBeenCalledTimes(1);
    expect(sell.orderStatus).toHaveBeenCalledTimes(1);
  });
  it('cancels both opened legs when initial placement exceeds the timeout', async () => {
    const buy = adapter([{ status: 'open', filled: 0 }], { createDelayMs: 10 });
    const sell = adapter([{ status: 'open', filled: 0 }], { createDelayMs: 10 });
    const result = await executePair(opportunity, input, connector(buy, sell), 1);
    expect(result.status).toBe('TIMEOUT');
    expect(buy.cancelOrder).toHaveBeenCalledTimes(1);
    expect(sell.cancelOrder).toHaveBeenCalledTimes(1);
  });
  it('rejects non-funded capital', async () => {
    await expect(executePair(opportunity, { ...input, capital: { ...input.capital, source: 'CEX_ACCOUNT_BALANCES' } }, connector(adapter([]), adapter([])), 5_000)).rejects.toThrow('PAIR_CAPITAL_SOURCE_REJECTED');
  });
  it('rejects insufficient capital', async () => {
    await expect(executePair(opportunity, { ...input, capital: { ...input.capital, available: 50 } }, connector(adapter([]), adapter([])), 5_000)).rejects.toThrow('PAIR_CAPITAL_INSUFFICIENT');
  });
  it('rejects zero profit', async () => {
    await expect(executePair({ ...opportunity, expectedNetProfit: 0 }, input, connector(adapter([]), adapter([])), 5_000)).rejects.toThrow('PAIR_NET_PROFIT_GATE_REJECTED');
  });
  it('rejects expired opportunities', async () => {
    await expect(executePair({ ...opportunity, expiresAt: Date.now() - 1 }, input, connector(adapter([]), adapter([])), 5_000)).rejects.toThrow('PAIR_OPPORTUNITY_EXPIRED');
  });
  it('classifies equal nonzero partial fills as completed after reconciliation', async () => {
    const buy = adapter([{ status: 'open', filled: 0 }, { status: 'closed', filled: 0.5 }]);
    const sell = adapter([{ status: 'open', filled: 0 }, { status: 'closed', filled: 0.5 }]);
    const result = await executePair(opportunity, input, connector(buy, sell), 5_000);
    expect(result.status).toBe('COMPLETED');
    expect(buy.createOrder).toHaveBeenCalledTimes(1);
    expect(sell.createOrder).toHaveBeenCalledTimes(1);
  });
  it('fails closed when one initial placement rejects and no residual fills exist', async () => {
    const buy = adapter([{ status: 'open', filled: 0 }]);
    const sell = adapter([{ status: 'open', filled: 0 }]);
    (sell.createOrder as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('SELL_REJECTED'));
    const result = await executePair(opportunity, input, connector(buy, sell), 5_000);
    expect(result.status).toBe('FAILED');
    expect(buy.cancelOrder).toHaveBeenCalledTimes(1);
  });

});
