import crypto from 'node:crypto';
import type { Opportunity } from '@abn/types';
import type { HummingbotClient } from './hummingbot';

export interface HummingbotPairInput {
  accountName: string;
  buy: { connectorName: string; tradingPair: string; amount: number };
  sell: { connectorName: string; tradingPair: string; amount: number };
}

export interface HummingbotPairResult {
  status: 'COMPLETED' | 'FAILED' | 'TIMEOUT';
  buyOrderId?: string;
  sellOrderId?: string;
}

function extractOrderId(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  for (const key of ['client_order_id', 'clientOrderId', 'order_id', 'orderId', 'id']) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.length > 0) return candidate;
  }
  for (const key of ['data', 'order', 'result']) {
    const id = extractOrderId(record[key]);
    if (id) return id;
  }
  return undefined;
}

function statusFor(value: unknown, orderId: string): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.status === 'string') return record.status.toLowerCase();
  for (const key of ['data', 'items', 'orders', 'results']) {
    const nested = record[key];
    if (Array.isArray(nested)) {
      const match = nested.find((item) => extractOrderId(item) === orderId);
      const status = statusFor(match, orderId);
      if (status) return status;
    } else {
      const status = statusFor(nested, orderId);
      if (status) return status;
    }
  }
  return undefined;
}

function filled(status: string | undefined): boolean {
  return status === 'filled' || status === 'closed' || status === 'completed';
}

function failed(status: string | undefined): boolean {
  return status === 'failed' || status === 'rejected' || status === 'cancelled' || status === 'canceled' || status === 'expired';
}

async function waitForOrder(client: HummingbotClient, accountName: string, connectorName: string, orderId: string, deadline: number): Promise<string | undefined> {
  while (Date.now() < deadline) {
    const response = await client.status({ account_name: accountName, connector_name: connectorName, client_order_id: orderId, page: 1, limit: 20 });
    const status = statusFor(response, orderId);
    if (filled(status) || failed(status)) return status;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return undefined;
}

export async function executeHummingbotPair(
  opportunity: Opportunity,
  input: HummingbotPairInput,
  client: HummingbotClient,
  timeoutMs: number,
): Promise<HummingbotPairResult> {
  if (!Number.isFinite(opportunity.expectedNetProfit) || opportunity.expectedNetProfit <= 0) throw new Error('HUMMINGBOT_NET_PROFIT_GATE_REJECTED');
  if (!Number.isFinite(opportunity.capitalRequired) || opportunity.capitalRequired <= 0) throw new Error('HUMMINGBOT_CAPITAL_REQUIRED_INVALID');
  if (opportunity.expiresAt <= Date.now()) throw new Error('HUMMINGBOT_OPPORTUNITY_EXPIRED');
  if (!Number.isFinite(input.buy.amount) || input.buy.amount <= 0 || !Number.isFinite(input.sell.amount) || input.sell.amount <= 0) throw new Error('HUMMINGBOT_ORDER_AMOUNT_INVALID');
  if (!input.accountName) throw new Error('HUMMINGBOT_ACCOUNT_REQUIRED');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('HUMMINGBOT_TIMEOUT_INVALID');
  if (!(await client.health())) throw new Error('HUMMINGBOT_HEALTHCHECK_FAILED');
  await Promise.all([
    client.orderBook(input.buy.tradingPair, input.buy.connectorName),
    client.orderBook(input.sell.tradingPair, input.sell.connectorName),
  ]);

  const correlationId = opportunity.correlationId || crypto.randomUUID();
  const buyClientOrderId = `abn-${correlationId}-buy`;
  const sellClientOrderId = `abn-${correlationId}-sell`;
  const deadline = Math.min(opportunity.expiresAt, Date.now() + timeoutMs);

  const [buyResponse, sellResponse] = await Promise.all([
    client.execute({ account_name: input.accountName, connector_name: input.buy.connectorName, trading_pair: input.buy.tradingPair, trade_type: 'BUY', amount: input.buy.amount, order_type: 'MARKET', client_order_id: buyClientOrderId }),
    client.execute({ account_name: input.accountName, connector_name: input.sell.connectorName, trading_pair: input.sell.tradingPair, trade_type: 'SELL', amount: input.sell.amount, order_type: 'MARKET', client_order_id: sellClientOrderId }),
  ]);

  const buyOrderId = extractOrderId(buyResponse) || buyClientOrderId;
  const sellOrderId = extractOrderId(sellResponse) || sellClientOrderId;
  const [buyStatus, sellStatus] = await Promise.all([
    waitForOrder(client, input.accountName, input.buy.connectorName, buyOrderId, deadline),
    waitForOrder(client, input.accountName, input.sell.connectorName, sellOrderId, deadline),
  ]);

  if (filled(buyStatus) && filled(sellStatus)) return { status: 'COMPLETED', buyOrderId, sellOrderId };
  await Promise.allSettled([
    filled(buyStatus) ? Promise.resolve() : client.cancel({ account_name: input.accountName, connector_name: input.buy.connectorName, client_order_id: buyOrderId }),
    filled(sellStatus) ? Promise.resolve() : client.cancel({ account_name: input.accountName, connector_name: input.sell.connectorName, client_order_id: sellOrderId }),
  ]);
  return { status: Date.now() >= deadline ? 'TIMEOUT' : 'FAILED', buyOrderId, sellOrderId };
}
