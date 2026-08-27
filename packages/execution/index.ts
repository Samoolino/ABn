import type { Opportunity, CapitalAccess } from '@abn/types';
import type { CEXAdapter } from '@abn/venue-adapters';
import { createCEXAdapter } from '@abn/cex-adapters';
import { createHummingbotClient } from './src/hummingbot.ts';

export type LegResult = {status:'FULL_FILL'|'PARTIAL_FILL'|'REJECTED'|'CANCELLED'|'TIMEOUT'|'UNKNOWN'; filled:number; average?:number; externalId?:string};
export interface ExecutionPlan { correlationId:string; opportunityId:string; buy:Record<string,unknown>; sell:Record<string,unknown>; capital:CapitalAccess; }
export interface ExecutionConnector { executeBuy(plan:ExecutionPlan):Promise<LegResult>; executeSell(plan:ExecutionPlan):Promise<LegResult>; hedgeOrExit(plan:ExecutionPlan,leg:LegResult,sourceSide?:'buy'|'sell'):Promise<LegResult>; }

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`${name}_NOT_CONFIGURED`);
  return value;
}

function normalizeHummingbotResult(value: unknown, fallbackId?: string): LegResult {
  const row = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const rawStatus = String(row.status ?? row.state ?? 'UNKNOWN').toUpperCase();
  const status: LegResult['status'] =
    ['CLOSED','FILLED','FULL_FILL','COMPLETED'].includes(rawStatus) ? 'FULL_FILL' :
    ['OPEN','PENDING','PARTIALLY_FILLED','PARTIAL_FILL','PARTIAL'].includes(rawStatus) ? 'PARTIAL_FILL' :
    ['CANCELED','CANCELLED'].includes(rawStatus) ? 'CANCELLED' :
    rawStatus === 'REJECTED' || rawStatus === 'FAILED' ? 'REJECTED' :
    rawStatus === 'TIMEOUT' ? 'TIMEOUT' : 'UNKNOWN';
  const filled = Number(row.filled ?? row.executedQty ?? row.executed_quantity ?? 0);
  const average = row.average ?? row.avgPrice ?? row.average_price ?? row.price;
  const externalId = String(row.order_id ?? row.orderId ?? row.client_order_id ?? row.id ?? fallbackId ?? '');
  return {status, filled:Number.isFinite(filled) && filled >= 0 ? filled : 0, average:average == null ? undefined : Number(average), externalId:externalId || undefined};
}

function createHummingbotPairExecutionConnector(buyConnector: string, sellConnector: string): ExecutionConnector {
  const baseUrl = process.env.HUMMINGBOT_URL;
  const username = process.env.HUMMINGBOT_USERNAME;
  const password = process.env.HUMMINGBOT_PASSWORD;
  if (!baseUrl) throw new Error('HUMMINGBOT_URL_NOT_CONFIGURED');
  if (!username || !password) throw new Error('HUMMINGBOT_BASIC_AUTH_NOT_CONFIGURED');
  if (!buyConnector || !sellConnector) throw new Error('HUMMINGBOT_CONNECTORS_NOT_CONFIGURED');
  const accountName = process.env.HUMMINGBOT_ACCOUNT || 'master_account';
  const client = createHummingbotClient({baseUrl, username, password, apiKey:process.env.HUMMINGBOT_API_KEY, timeoutMs:Number(process.env.HUMMINGBOT_TIMEOUT_MS || '5000')});

  const execute = async (plan: ExecutionPlan, side: 'buy'|'sell'): Promise<LegResult> => {
    const leg = side === 'buy' ? plan.buy : plan.sell;
    const connectorName = side === 'buy' ? buyConnector : sellConnector;
    const symbol = requireString(leg.symbol, `${side.toUpperCase()}_SYMBOL`);
    const amount = Number(leg.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error(`${side.toUpperCase()}_AMOUNT_INVALID`);
    if (!(await client.health())) throw new Error('HUMMINGBOT_UNHEALTHY');
    await client.orderBook(symbol, connectorName);
    const clientOrderId = `${plan.correlationId}-${side}`;
    const created = await client.execute({
      account_name: accountName,
      connector_name: connectorName,
      trading_pair: symbol,
      trade_type: side.toUpperCase(),
      amount,
      order_type: leg.type === 'limit' ? 'LIMIT' : 'MARKET',
      ...(leg.price == null ? {} : {price:Number(leg.price)}),
      client_order_id: clientOrderId,
    });
    const initial = normalizeHummingbotResult(created, clientOrderId);
    if (initial.status === 'FULL_FILL' || initial.status === 'REJECTED' || initial.status === 'CANCELLED') return initial;
    const started = Date.now();
    const timeoutMs = Number(process.env.EXECUTION_ORDER_TIMEOUT_MS || '5000');
    let last = initial;
    while (Date.now() - started < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, 250));
      last = normalizeHummingbotResult(await client.status({account_name:accountName, connector_name:connectorName, client_order_id:clientOrderId}), clientOrderId);
      if (last.status === 'FULL_FILL' || last.status === 'REJECTED' || last.status === 'CANCELLED') return last;
    }
    await client.cancel({account_name:accountName, connector_name:connectorName, client_order_id:clientOrderId}).catch(() => undefined);
    const final = normalizeHummingbotResult(await client.status({account_name:accountName, connector_name:connectorName, client_order_id:clientOrderId}), clientOrderId);
    return final.filled > 0 ? {...final, status:'PARTIAL_FILL'} : {...final, status:'TIMEOUT'};
  };

  return {
    executeBuy: plan => execute(plan, 'buy'),
    executeSell: plan => execute(plan, 'sell'),
    hedgeOrExit: async (plan, leg, sourceSide = 'buy') => {
      const filled = Number(leg.filled);
      if (!Number.isFinite(filled) || filled <= 0) return {status:'UNKNOWN', filled:0};
      const next = sourceSide === 'buy' ? {...plan, sell:{...plan.sell, amount:filled}} : {...plan, buy:{...plan.buy, amount:filled}};
      return execute(next, sourceSide === 'buy' ? 'sell' : 'buy');
    },
  };
}

function createDirectCEXPairExecutionConnector(buyAdapter: CEXAdapter, sellAdapter: CEXAdapter): ExecutionConnector {
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
    if (sourceSide === 'buy') return execute(sellAdapter, 'sell', {...plan, sell:{...plan.sell, amount}});
    return execute(buyAdapter, 'buy', {...plan, buy:{...plan.buy, amount}});
  };
  return {executeBuy: plan => execute(buyAdapter, 'buy', plan), executeSell: plan => execute(sellAdapter, 'sell', plan), hedgeOrExit: (plan, leg, sourceSide = 'buy') => hedge(plan, leg, sourceSide)};
}

export function createCEXPairExecutionConnector(buyAdapter: CEXAdapter, sellAdapter: CEXAdapter): ExecutionConnector {
  if (process.env.TRADING_MODE === 'LIVE') {
    if (process.env.HUMMINGBOT_EXECUTION_ENABLED !== 'true') throw new Error('HUMMINGBOT_LIVE_REQUIRED');
    return createHummingbotPairExecutionConnector(process.env.HUMMINGBOT_BUY_CONNECTOR || buyAdapter.name, process.env.HUMMINGBOT_SELL_CONNECTOR || sellAdapter.name);
  }
  return createDirectCEXPairExecutionConnector(buyAdapter, sellAdapter);
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
  const activeConnector = process.env.TRADING_MODE === 'LIVE'
    ? createHummingbotPairExecutionConnector(opportunity.buyVenue, opportunity.sellVenue)
    : connector;
  const buy = await activeConnector.executeBuy(plan);
  if (buy.status !== 'FULL_FILL') {
    const residualPlan = withResidual(plan, buy.filled);
    return {status:'HEDGE_OR_EXIT',buy,sell:await activeConnector.hedgeOrExit(residualPlan,buy,'buy')};
  }
  const started = Date.now();
  const sell = await activeConnector.executeSell(plan);
  if (sell.status === 'FULL_FILL') return {status:'COMPLETED',buy,sell};
  const residual = Math.max(0, buy.filled - sell.filled);
  if (residual > 0 && Date.now()-started > maxUnhedgedMs) {
    const residualPlan = withResidual(plan, residual);
    const hedge = await activeConnector.hedgeOrExit(residualPlan,{...sell,filled:residual},'sell');
    return {status:'HEDGE_OR_EXIT',buy,sell:hedge};
  }
  return {status:'PARTIAL',buy,sell};
}
