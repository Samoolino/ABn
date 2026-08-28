export interface DexGatewayConfig {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
}

export interface DexQuoteRequest {
  chain: string;
  connector: string;
  tradingPair: string;
  side: 'BUY' | 'SELL';
  amount: string;
  slippagePct?: number;
}

export interface DexSwapRequest extends DexQuoteRequest {
  walletAddress: string;
  clientOrderId: string;
}

export interface DexGatewayClient {
  health(): Promise<boolean>;
  quote(request: DexQuoteRequest): Promise<unknown>;
  executeSwap(request: DexSwapRequest): Promise<unknown>;
  transactionStatus(request: { chain: string; txHash: string }): Promise<unknown>;
}

/**
 * Hummingbot Gateway adapter. LIVE execution is intentionally fail-closed:
 * callers must explicitly enable Gateway and provide a configured endpoint.
 */
export function createDexGatewayClient(config: DexGatewayConfig): DexGatewayClient {
  const base = config.baseUrl.replace(/\/$/, '');
  const timeoutMs = config.timeoutMs ?? 8000;

  async function request(path: string, init: RequestInit = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = new Headers(init.headers);
      headers.set('Content-Type', 'application/json');
      if (config.apiKey) headers.set('Authorization', `Bearer ${config.apiKey}`);
      const response = await fetch(`${base}${path}`, { ...init, headers, signal: controller.signal });
      if (!response.ok) throw new Error(`DEX_GATEWAY_HTTP_${response.status}`);
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
    quote: (payload) => request('/amm/price', { method: 'POST', body: JSON.stringify(payload) }),
    executeSwap: (payload) => request('/amm/trade', { method: 'POST', body: JSON.stringify(payload) }),
    transactionStatus: (payload) => request('/amm/transaction-status', { method: 'POST', body: JSON.stringify(payload) }),
  };
}
