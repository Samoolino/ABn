export interface DexGatewayConfig {
  baseUrl: string;
  username: string;
  password: string;
  timeoutMs?: number;
}

export interface DexQuoteRequest {
  connector: string;
  network: string;
  tradingPair: string;
  side: 'BUY' | 'SELL';
  amount: string;
  slippagePct?: number;
}

export interface DexExecutableQuote {
  quoteId?: string;
  amountIn: string;
  amountOut: string;
  price?: string;
  gasCost?: string;
  expiresAt?: number;
  raw: unknown;
}

export interface DexSwapRequest extends DexQuoteRequest {
  walletAddress?: string;
  clientOrderId: string;
}

export interface DexSwapResult {
  txHash: string;
  raw: unknown;
}

export interface DexTransactionStatus {
  txHash: string;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED';
  actualAmountOut?: string;
  raw: unknown;
}

export interface DexGatewayClient {
  health(): Promise<boolean>;
  quote(request: DexQuoteRequest): Promise<DexExecutableQuote>;
  executeSwap(request: DexSwapRequest): Promise<DexSwapResult>;
  transactionStatus(request: { txHash: string }): Promise<DexTransactionStatus>;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('DEX_GATEWAY_INVALID_RESPONSE');
  }
  return value as Record<string, unknown>;
}

function readString(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' || typeof value === 'number') return String(value);
  }
  return undefined;
}

function basicAuth(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;
}

/**
 * Hummingbot API Gateway adapter.
 *
 * The current Hummingbot API exposes Gateway through /gateway/* and uses
 * HTTP Basic Auth. LIVE callers must still independently enforce profitability,
 * wallet/capital, allowance, slippage, and settlement gates.
 */
export function createDexGatewayClient(config: DexGatewayConfig): DexGatewayClient {
  if (!config.baseUrl) throw new Error('DEX_GATEWAY_URL_REQUIRED');
  if (!config.username || !config.password) throw new Error('DEX_GATEWAY_AUTH_REQUIRED');
  const base = config.baseUrl.replace(/\/$/, '');
  const timeoutMs = config.timeoutMs ?? 8000;
  const authorization = basicAuth(config.username, config.password);

  async function request(path: string, init: RequestInit = {}): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = new Headers(init.headers);
      headers.set('Content-Type', 'application/json');
      headers.set('Authorization', authorization);
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
        const raw = asRecord(await request('/'));
        return raw.status === undefined || String(raw.status).toLowerCase() === 'running';
      } catch {
        return false;
      }
    },
    quote: async (payload) => {
      const raw = await request('/gateway/swap/quote', {
        method: 'POST',
        body: JSON.stringify({
          connector: payload.connector,
          network: payload.network,
          trading_pair: payload.tradingPair,
          side: payload.side,
          amount: Number(payload.amount),
          slippage_pct: payload.slippagePct ?? 1,
        }),
      });
      const data = asRecord(raw);
      const amountIn = readString(data, 'amount_in', 'amountIn');
      const amountOut = readString(data, 'amount_out', 'amountOut', 'expected_amount');
      if (!amountIn || !amountOut) throw new Error('DEX_GATEWAY_INVALID_QUOTE');
      return {
        quoteId: readString(data, 'quote_id', 'quoteId', 'id'),
        amountIn,
        amountOut,
        price: readString(data, 'price'),
        gasCost: readString(data, 'gas_estimate', 'gasCost', 'gas'),
        raw,
      };
    },
    executeSwap: async (payload) => {
      const raw = await request('/gateway/swap/execute', {
        method: 'POST',
        body: JSON.stringify({
          connector: payload.connector,
          network: payload.network,
          trading_pair: payload.tradingPair,
          side: payload.side,
          amount: Number(payload.amount),
          slippage_pct: payload.slippagePct ?? 1,
          ...(payload.walletAddress ? { wallet_address: payload.walletAddress } : {}),
        }),
      });
      const data = asRecord(raw);
      const txHash = readString(data, 'transaction_hash', 'txHash', 'transactionHash', 'hash');
      if (!txHash) throw new Error('DEX_GATEWAY_MISSING_TX_HASH');
      return { txHash, raw };
    },
    transactionStatus: async (payload) => {
      const raw = await request(`/gateway/swaps/${encodeURIComponent(payload.txHash)}/status`);
      const data = asRecord(raw);
      const statusRaw = String(data.status ?? '').toUpperCase();
      const status = ['CONFIRMED', 'SUCCESS', 'COMPLETED'].includes(statusRaw)
        ? 'CONFIRMED'
        : ['FAILED', 'ERROR', 'REVERTED'].includes(statusRaw)
          ? 'FAILED'
          : 'PENDING';
      return {
        txHash: readString(data, 'transaction_hash', 'txHash', 'transactionHash', 'hash') ?? payload.txHash,
        status,
        actualAmountOut: readString(data, 'actual_amount_out', 'actualAmountOut', 'amount_out', 'amountOut', 'outputAmount'),
        raw,
      };
    },
  };
}
