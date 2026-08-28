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
  walletAddress: string;
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
  transactionStatus(request: { chain: string; txHash: string }): Promise<DexTransactionStatus>;
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

/**
 * Hummingbot Gateway adapter. LIVE callers must independently opt in and
 * validate Gateway's deployed API contract. Unknown or malformed responses
 * fail closed instead of being treated as executable.
 */
export function createDexGatewayClient(config: DexGatewayConfig): DexGatewayClient {
  if (!config.baseUrl) throw new Error('DEX_GATEWAY_URL_REQUIRED');
  const base = config.baseUrl.replace(/\/$/, '');
  const timeoutMs = config.timeoutMs ?? 8000;

  async function request(path: string, init: RequestInit = {}): Promise<unknown> {
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
    quote: async (payload) => {
      const raw = await request('/amm/price', { method: 'POST', body: JSON.stringify(payload) });
      const data = asRecord(raw);
      const amountIn = readString(data, 'amountIn', 'amount');
      const amountOut = readString(data, 'amountOut');
      if (!amountIn || !amountOut) throw new Error('DEX_GATEWAY_INVALID_QUOTE');
      return {
        quoteId: readString(data, 'quoteId', 'id'),
        amountIn,
        amountOut,
        price: readString(data, 'price'),
        gasCost: readString(data, 'gasCost', 'gas'),
        expiresAt: Number(data.expiresAt ?? data.expiry ?? 0) || undefined,
        raw,
      };
    },
    executeSwap: async (payload) => {
      const raw = await request('/amm/trade', { method: 'POST', body: JSON.stringify(payload) });
      const data = asRecord(raw);
      const txHash = readString(data, 'txHash', 'transactionHash', 'hash');
      if (!txHash) throw new Error('DEX_GATEWAY_MISSING_TX_HASH');
      return { txHash, raw };
    },
    transactionStatus: async (payload) => {
      const raw = await request('/amm/transaction-status', { method: 'POST', body: JSON.stringify(payload) });
      const data = asRecord(raw);
      const statusRaw = String(data.status ?? '').toUpperCase();
      const status = statusRaw === 'CONFIRMED' || statusRaw === 'SUCCESS'
        ? 'CONFIRMED'
        : statusRaw === 'FAILED' || statusRaw === 'ERROR'
          ? 'FAILED'
          : 'PENDING';
      return {
        txHash: readString(data, 'txHash', 'transactionHash', 'hash') ?? payload.txHash,
        status,
        actualAmountOut: readString(data, 'actualAmountOut', 'amountOut', 'outputAmount'),
        raw,
      };
    },
  };
}
