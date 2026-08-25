import type { ExecutionConnector, ExecutionPlan, LegResult } from '@abn/execution';
import { createCEXAdapter } from './index.js';

function credentialsFor(venue: string) {
  const prefix = venue.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  const apiKey = process.env[`${prefix}_API_KEY`];
  const secret = process.env[`${prefix}_API_SECRET`];
  const password = process.env[`${prefix}_PASSWORD`];
  if (!apiKey || !secret) throw new Error(`${prefix}_CREDENTIALS_NOT_CONFIGURED`);
  return { apiKey, secret, ...(password ? { password } : {}) };
}

function liveAllowed() {
  return process.env.TRADING_MODE === 'LIVE' && process.env.ALLOW_LIVE_EXECUTION === 'true';
}

export function createCEXExecutionConnector(): ExecutionConnector {
  const adapters = new Map<string, ReturnType<typeof createCEXAdapter>>();
  function adapter(venue: string) {
    const key = venue.toLowerCase();
    let value = adapters.get(key);
    if (!value) {
      value = createCEXAdapter(key as Parameters<typeof createCEXAdapter>[0], credentialsFor(key));
      adapters.set(key, value);
    }
    return value;
  }

  async function place(plan: ExecutionPlan, side: 'buy' | 'sell'): Promise<LegResult> {
    if (!liveAllowed()) return { status: 'CANCELLED', filled: 0 };
    const leg = (side === 'buy' ? plan.buy : plan.sell) as { venue: string; symbol: string; amount: number };
    if (!leg.venue || !leg.symbol || !Number.isFinite(leg.amount) || leg.amount <= 0) return { status: 'REJECTED', filled: 0 };
    const ex = adapter(leg.venue);
    await ex.connect();
    const order = await ex.createOrder({ symbol: leg.symbol, type: 'market', side, amount: leg.amount });
    const deadline = Date.now() + Number(process.env.ORDER_TIMEOUT_MS || '5000');
    while (Date.now() < deadline) {
      const status = await ex.orderStatus(order.id, leg.symbol);
      if (status.status === 'closed' || status.filled >= leg.amount) return { status: 'FULL_FILL', filled: status.filled, average: status.average, externalId: order.id };
      if (['canceled', 'cancelled', 'rejected'].includes(status.status)) return { status: status.status === 'rejected' ? 'REJECTED' : 'CANCELLED', filled: status.filled, average: status.average, externalId: order.id };
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    await ex.cancelOrder(order.id, leg.symbol).catch(() => undefined);
    const final = await ex.orderStatus(order.id, leg.symbol).catch(() => ({ status: 'unknown', filled: 0 }));
    return { status: final.filled > 0 ? 'PARTIAL_FILL' : 'TIMEOUT', filled: Number(final.filled || 0), average: final.average, externalId: order.id };
  }

  return {
    executeBuy: (plan) => place(plan, 'buy'),
    executeSell: (plan) => place(plan, 'sell'),
    async hedgeOrExit(plan, leg) {
      if (leg.filled <= 0) return { status: 'CANCELLED', filled: 0 };
      return place({ ...plan, sell: { ...(plan.buy as object), amount: leg.filled } }, 'sell');
    },
  };
}
