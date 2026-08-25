import type { Opportunity } from '@abn/types';
import type { CapitalAccess } from '@abn/types';
import type { CEXAdapter, CEXId } from '@abn/venue-adapters';
import { executePair, type ExecutionConnector, type ExecutionPlan, type LegResult } from './index.ts';

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
    case 'open': return 'PARTIAL_FILL';
    case 'canceled':
    case 'cancelled': return 'CANCELLED';
    case 'rejected': return 'REJECTED';
    default: return 'UNKNOWN';
  }
}

function sideInput(plan: ExecutionPlan, side: 'buy' | 'sell') {
  const leg = side === 'buy' ? plan.buy : plan.sell;
  return {
    symbol: String(leg.symbol),
    side,
    type: (String(leg.type || 'market') === 'limit' ? 'limit' : 'market') as 'market' | 'limit',
    amount: Number(leg.amount),
    price: leg.price == null ? undefined : Number(leg.price),
  };
}

export function createCEXExecutionConnector(config: CEXConnectorConfig): ExecutionConnector {
  const execute = async (adapter: CEXAdapter, plan: ExecutionPlan, side: 'buy' | 'sell'): Promise<LegResult> => {
    const input = sideInput(plan, side);
    if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('INVALID_EXECUTION_AMOUNT');
    const created = await adapter.createOrder(input);
    const started = Date.now();
    let last = await adapter.orderStatus(created.id, input.symbol);
    while (last.status === 'open' || last.status === 'pending' || last.status === 'partially_filled') {
      if (Date.now() - started >= config.maxUnhedgedMs) {
        await adapter.cancelOrder(created.id, input.symbol).catch(() => undefined);
        return { status: 'TIMEOUT', filled: Number(last.filled || 0), average: last.average, externalId: created.id };
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
      last = await adapter.orderStatus(created.id, input.symbol);
    }
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
      const adapter = leg.status === 'FULL_FILL' || leg.status === 'PARTIAL_FILL' ? config.sellAdapter : config.buyAdapter;
      const side = adapter === config.sellAdapter ? 'sell' : 'buy';
      return execute(adapter, plan, side);
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

export type { CapitalAccess };
