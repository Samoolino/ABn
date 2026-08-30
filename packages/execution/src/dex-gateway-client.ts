export type DexGatewayQuoteRequest = {
  chain: string;
  connector: string;
  tradingPair: string;
  side: "buy" | "sell";
  amount: string;
  slippagePct: number;
};

export type DexGatewayQuote = {
  requestId: string;
  price: string;
  amount: string;
  gasEstimate?: string;
  expiresAt?: string;
};

export type DexGatewaySwapRequest = DexGatewayQuoteRequest & {
  walletAddress: string;
  maxGas: string;
};

export type DexGatewaySwapResult = {
  requestId: string;
  txHash: string;
  status: "submitted" | "confirmed" | "failed";
};

/**
 * Typed HTTP boundary for Hummingbot Gateway.
 * Live execution is intentionally opt-in and requires every response to be
 * validated by the worker's profitability/capital gate before submission.
 */
export class DexGatewayClient {
  constructor(
    private readonly baseUrl: string,
    private readonly headers: Record<string, string> = {},
    private readonly timeoutMs = 10_000,
  ) {}

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}${path}`, {
        ...init,
        headers: { "content-type": "application/json", ...this.headers, ...(init.headers ?? {}) },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`DEX_GATEWAY_HTTP_${response.status}`);
      return (await response.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  async health(): Promise<unknown> {
    return this.request("/", { method: "GET" });
  }

  async quote(request: DexGatewayQuoteRequest): Promise<DexGatewayQuote> {
    return this.request<DexGatewayQuote>("/amm/price", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  async executeSwap(request: DexGatewaySwapRequest): Promise<DexGatewaySwapResult> {
    return this.request<DexGatewaySwapResult>("/amm/trade", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  async transactionStatus(txHash: string): Promise<unknown> {
    return this.request("/amm/transaction-status", {
      method: "POST",
      body: JSON.stringify({ txHash }),
    });
  }
}
