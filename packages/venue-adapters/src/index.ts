export interface CEXAdapter {
  readonly id: string;
  connect(): Promise<void>;
  health(): Promise<{ ok: boolean; reason?: string }>;
  markets(): Promise<string[]>;
  ticker(symbol: string): Promise<{ bid: number; ask: number; timestamp: number }>;
  orderBook(symbol: string, limit?: number): Promise<{ bids: [number, number][]; asks: [number, number][]; timestamp: number }>;
  balances(): Promise<Record<string, number>>;
  fees(symbol: string): Promise<{ maker: number; taker: number }>;
  createOrder(input: { symbol: string; side: 'buy' | 'sell'; quantity: number; type: 'market' | 'limit'; price?: number }): Promise<{ id: string; status: string }>;
  cancelOrder(orderId: string, symbol: string): Promise<void>;
  orderStatus(orderId: string, symbol: string): Promise<{ id: string; status: string; filled: number; average?: number }>;
  reconcile(orderId: string, symbol: string): Promise<unknown>;
}

export interface DEXAdapter {
  readonly id: string;
  readonly chainId: number;
  connect(): Promise<void>;
  health(): Promise<{ ok: boolean; reason?: string }>;
  quoteExactInput(input: { tokenIn: string; tokenOut: string; amountIn: bigint }): Promise<{ amountOut: bigint; gasEstimate: bigint; timestamp: number }>;
  gasEstimate(input: unknown): Promise<bigint>;
  allowance(token: string, owner: string, spender: string): Promise<bigint>;
  buildSwap(input: unknown): Promise<{ to: string; data: string; value: bigint }>;
  transactionStatus(hash: string): Promise<{ status: 'pending' | 'success' | 'failed' }>; 
  reconcile(hash: string): Promise<unknown>;
}

export const SUPPORTED_CEX = ['mexc','gate','binance','kraken','okx','bybit','coinbase','kucoin','bitfinex','lbank'] as const;
export const SUPPORTED_DEX = ['uniswap','pancakeswap','sushiswap'] as const;
