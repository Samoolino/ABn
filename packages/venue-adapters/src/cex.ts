export type CexVenue = 'mexc' | 'gate' | 'binance' | 'kraken' | 'okx' | 'bybit' | 'coinbase' | 'kucoin' | 'bitfinex' | 'lbank';

export interface CexCredentials { apiKey: string; apiSecret: string; password?: string; }
export interface OrderBook { bids: Array<[number, number]>; asks: Array<[number, number]>; timestamp: number; }

export interface CEXAdapter {
  readonly venue: CexVenue;
  connect(credentials: CexCredentials): Promise<void>;
  health(): Promise<boolean>;
  markets(): Promise<string[]>;
  orderBook(symbol: string, limit?: number): Promise<OrderBook>;
  balances(): Promise<Record<string, number>>;
  fees(symbol?: string): Promise<{ maker: number; taker: number }>;
  createOrder(input: { symbol: string; side: 'buy' | 'sell'; type: 'market' | 'limit'; quantity: number; price?: number; dryRun?: boolean }): Promise<{ id: string; status: string }>;
  cancelOrder(symbol: string, orderId: string): Promise<void>;
  orderStatus(symbol: string, orderId: string): Promise<{ id: string; status: string; filled: number; average?: number }>;
  reconcile(symbol: string, orderId: string): Promise<{ id: string; status: string; filled: number; fee?: number }>;
}

export function assertCredentials(c: CexCredentials | undefined): asserts c is CexCredentials {
  if (!c?.apiKey || !c.apiSecret) throw new Error('VENUE_CREDENTIALS_NOT_CONFIGURED');
}
