import type { Opportunity } from '@abn/types';
import { CEXAdapter, CEXId } from '@abn/venue-adapters';
import { executePair, type ExecutionConnector, type ExecutionPlan, type LegResult } from './index.js';

export interface CEXConnectorConfig {
  buyVenue: CEXId;
  sellVenue: CEXId;
  buyAdapter: CEXAdapter;
  sellAdapter: CEXAdapter;
  maxUnhedgedMs: number;
}

function mapStatus(status: string | undefined): LegResult['status'] {
  switch (String(status).toLowerCase()) {
    case 'closed': return 'FULL_FILL';
    case 'open':
    case 'pending':
    case 'partially_filled': return 'PARTIAL_FILL';
    case 'canceled':
    case 'cancelled': return 'CANCELLED';
    case 'rejected': return 'REJECTED';
    default: return 'UNKNOWN';
  }
}

function sideInput(plan: ExecutionPlan, side: 'buy' | 'sell') {
  const leg = side === 'buy' ? plan.buy : plan.sell;
  const amount = Number(leg.amount ?? leg.quantity);
  return {
    symbol: String(leg.symbol),
    side,
    type: (String(leg.type || 'market') === 'limit' ? 'limit' : 'market') as 'market' | 'limit',
    quantity: amount,
    price: leg.price == null ? undefined : Number(leg.price),
  };
}

function recoveryPlan(plan: ExecutionPlan, leg: LegResult): ExecutionPlan {
  const filled = Number(leg.filled);
  if (!Number.isFinite(filled) || filled <= 0) return plan;
  return {
    ...plan,
    sell: { ...plan.sell, amount: filled, quantity: filled },
    buy: { ...plan.buy, amount: filled, quantity: filled },
  };
}

export function createCEXExecutionConnector(config: CEXConnectorConfig): ExecutionConnector {
  const execute = async (adapter: CEXAdapter, plan: ExecutionPlan, side: 'buy' | 'sell'): Promise<LegResult> => {
    const input = sideInput(plan, side);
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new Error('INVALID_EXECUTION_AMOUNT');

    const created = await adapter.createOrder({
      symbol: input.symbol,
      side: input.side,
      type: input.type,
      amount: input.quantity,
      ...(input.price == null ? {} : { price: input.price }),
    });
    const started = Date.now();
    let last = await adapter.orderStatus(created.id, input.symbol);

    while (last.status === 'open' || last.status === 'pending' || last.status === 'partially_filled') {
      if (Date.now() - started >= config.maxUnhedgedMs) {
        await adapter.cancelOrder(created.id, input.symbol).catch(() => undefined);
        await adapter.reconcile().catch(() => undefined);
        return {
          status: 'TIMEOUT',
          filled: Number(last.filled || 0),
          average: last.average,
          externalId: created.id,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
      last = await adapter.orderStatus(created.id, input.symbol);
    }

    await adapter.reconcile().catch(() => undefined);
    return {
      status: mapStatus(last.status),
      filled: Number(last.filled || 0),
      average: last.average,
      externalId: created.id,
    };
  };

  const connector: ExecutionConnector = {
    executeBuy: (plan) => execute(config.buyAdapter, plan, 'buy'),
    executeSell: (plan) => execute(config.sellAdapter, plan, 'sell'),
    async hedgeOrExit(plan, leg) {
      if (!Number.isFinite(Number(leg.filled)) || Number(leg.filled) <= 0) {
        return { status: 'UNKNOWN', filled: 0 };
      }
      const recovery = recoveryPlan(plan, leg);
      const adapter = leg.status === 'FULL_FILL' || leg.status === 'PARTIAL_FILL' ? config.sellAdapter : config.buyAdapter;
      const side = adapter === config.sellAdapter ? 'sell' : 'buy';
      return execute(adapter, recovery, side);
    },
  };
  return connector;
}

export async function executeCEXPair(
  opportunity: Opportunity,
  plan: ExecutionPlan,
  config: CEXConnectorConfig,
): Promise<{ status: string; buy: LegResult; sell: LegResult }> {
  return executePair(opportunity, plan, createCEXExecutionConnector(config), config.maxUnhedgedMs);
}
