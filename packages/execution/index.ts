import type { Opportunity, CapitalAccess } from '@abn/types';
import type { CEXAdapter } from '@abn/venue-adapters';
import { createCEXAdapter } from '@abn/cex-adapters';

export type LegResult = {status:'FULL_FILL'|'PARTIAL_FILL'|'REJECTED'|'CANCELLED'|'TIMEOUT'|'UNKNOWN'; filled:number; average?:number; externalId?:string};
export interface ExecutionPlan { correlationId:string; opportunityId:string; buy:Record<string,unknown>; sell:Record<string,unknown>; capital:CapitalAccess; }
export interface ExecutionConnector { executeBuy(plan:ExecutionPlan):Promise<LegResult>; executeSell(plan:ExecutionPlan):Promise<LegResult>; hedgeOrExit(plan:ExecutionPlan,leg:LegResult,sourceSide?:'buy'|'sell'):Promise<LegResult>; }

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`${name}_NOT_CONFIGURED`);
  return value;
}

export function createCEXPairExecutionConnector(buyAdapter: CEXAdapter, sellAdapter: CEXAdapter): ExecutionConnector {
  const execute = async (adapter: CEXAdapter, side: 'buy'|'sell', plan: ExecutionPlan): Promise<LegResult> => {
    const leg = side === 'buy' ? plan.buy : plan.sell;
    const symbol = requireString(leg.symbol, `${side.toUpperCase()}_SYMBOL`);
    const amount = Number(leg.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error(`${side.toUpperCase()}_AMOUNT_INVALID`);
    const type = (leg.type === 'limit' ? 'limit' : 'market') as 'market'|'limit';
    const price = leg.price === undefined ? undefined : Number(leg.price);
    const order = await adapter.createOrder({symbol, side, type, amount, price});
    const started = Date.now();
    const timeoutMs = Number(process.env.EXECUTION_ORDER_TIMEOUT_MS || '5000');
    while (Date.now() - started < timeoutMs) {
      const status = await adapter.orderStatus(order.id, symbol);
      const normalized = String(status.status).toUpperCase();
      if (normalized === 'CLOSED' || normalized === 'FILLED') return {status:'FULL_FILL', filled:status.filled, average:status.average, externalId:order.id};
      if (normalized === 'CANCELED' || normalized === 'CANCELLED') return {status:'CANCELLED', filled:status.filled, average:status.average, externalId:order.id};
      if (normalized === 'REJECTED') return {status:'REJECTED', filled:status.filled, average:status.average, externalId:order.id};
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    try { await adapter.cancelOrder(order.id, symbol); } catch {}
    const final = await adapter.orderStatus(order.id, symbol);
    return final.filled > 0 ? {status:'PARTIAL_FILL', filled:final.filled, average:final.average, externalId:order.id} : {status:'TIMEOUT', filled:0, externalId:order.id};
  };

  const hedge = async (plan: ExecutionPlan, leg: LegResult, sourceSide: 'buy'|'sell'): Promise<LegResult> => {
    const amount = Number(leg.filled);
    if (!Number.isFinite(amount) || amount <= 0) return {status:'UNKNOWN', filled:0};
    if (sourceSide === 'buy') {
      return execute(sellAdapter, 'sell', {...plan, sell:{...plan.sell, amount}});
    }
    return execute(buyAdapter, 'buy', {...plan, buy:{...plan.buy, amount}});
  };

  return {
    executeBuy: plan => execute(buyAdapter, 'buy', plan),
    executeSell: plan => execute(sellAdapter, 'sell', plan),
    hedgeOrExit: (plan, leg, sourceSide = 'buy') => hedge(plan, leg, sourceSide),
  };
}

export function createCEXAdapterFromEnv(venue: string): CEXAdapter {
  const id = venue.toLowerCase() as Parameters<typeof createCEXAdapter>[0];
  const prefix = id.toUpperCase();
  const apiKey = process.env[`${prefix}_API_KEY`];
  const secret = process.env[`${prefix}_API_SECRET`];
  const password = process.env[`${prefix}_PASSWORD`];
  if (!apiKey || !secret) throw new Error(`${prefix}_CREDENTIALS_NOT_CONFIGURED`);
  return createCEXAdapter(id, {apiKey, secret, ...(password ? {password} : {})});
}

function withResidual(plan: ExecutionPlan, residual: number): ExecutionPlan {
  return { ...plan, buy: { ...plan.buy, amount: residual }, sell: { ...plan.sell, amount: residual } };
}

export async function executePair(opportunity:Opportunity, plan:ExecutionPlan, connector:ExecutionConnector, maxUnhedgedMs:number):Promise<{status:string;buy:LegResult;sell:LegResult}> {
  void opportunity;
  const buy = await connector.executeBuy(plan);
  if (buy.status !== 'FULL_FILL') {
    const residualPlan = withResidual(plan, buy.filled);
    return {status:'HEDGE_OR_EXIT',buy,sell:await connector.hedgeOrExit(residualPlan,buy,'buy')};
  }

  const started = Date.now();
  const sell = await connector.executeSell(plan);
  if (sell.status === 'FULL_FILL') return {status:'COMPLETED',buy,sell};

  const residual = Math.max(0, buy.filled - sell.filled);
  if (residual > 0 && Date.now()-started > maxUnhedgedMs) {
    const residualPlan = withResidual(plan, residual);
    const hedge = await connector.hedgeOrExit(residualPlan,{...sell,filled:residual},'sell');
    return {status:'HEDGE_OR_EXIT',buy,sell:hedge};
  }

  return {status:'PARTIAL',buy,sell};
}
