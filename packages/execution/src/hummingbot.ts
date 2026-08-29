export interface HummingbotConfig {
  baseUrl: string;
  username?: string;
  password?: string;
  apiKey?: string;
  timeoutMs?: number;
}

export interface HummingbotClient {
  health(): Promise<boolean>;
  markets(): Promise<unknown>;
  tradingRules(connectorName: string, tradingPair: string): Promise<unknown>;
  orderBook(symbol: string, connectorName: string): Promise<unknown>;
  execute(payload: Record<string, unknown>): Promise<unknown>;
  cancel(payload: Record<string, unknown>): Promise<unknown>;
  status(payload?: Record<string, unknown>): Promise<unknown>;
}

export function createHummingbotClient(config: HummingbotConfig): HummingbotClient {
  const base = config.baseUrl.replace(/\/$/, '');
  const timeoutMs = config.timeoutMs ?? 5000;
  async function request(path: string, init: RequestInit = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = new Headers(init.headers);
      if (config.username && config.password) {
        headers.set('Authorization', `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`);
      } else if (config.apiKey) {
        headers.set('Authorization', `Bearer ${config.apiKey}`);
      }
      headers.set('Content-Type', 'application/json');
      const response = await fetch(`${base}${path}`, { ...init, headers, signal: controller.signal });
      if (!response.ok) throw new Error(`HUMMINGBOT_HTTP_${response.status}`);
      return response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    health: async () => {
      try {
        await request('/');
        return true;
      } catch {
        return false;
      }
    },
    markets: () => request('/connectors/'),
    tradingRules: (connectorName, tradingPair) => request(`/connectors/${encodeURIComponent(connectorName)}/trading-rules?trading_pairs=${encodeURIComponent(tradingPair)}`),
    orderBook: (symbol, connectorName) => request('/market-data/order-book', {
      method: 'POST',
      body: JSON.stringify({ connector_name: connectorName, trading_pair: symbol, depth: 100 }),
    }),
    execute: (payload) => request('/trading/orders', { method: 'POST', body: JSON.stringify(payload) }),
    cancel: (payload) => {
      const account = String(payload.account_name ?? process.env.HUMMINGBOT_ACCOUNT ?? 'master_account');
      const connector = String(payload.connector_name ?? '');
      const clientOrderId = String(payload.client_order_id ?? payload.order_id ?? '');
      if (!connector || !clientOrderId) throw new Error('HUMMINGBOT_CANCEL_IDENTIFIERS_MISSING');
      return request(`/trading/${encodeURIComponent(account)}/${encodeURIComponent(connector)}/orders/${encodeURIComponent(clientOrderId)}/cancel`, { method: 'POST', body: JSON.stringify({}) });
    },
    status: (payload = {}) => request('/trading/orders/search', { method: 'POST', body: JSON.stringify(payload) }),
  };
}
