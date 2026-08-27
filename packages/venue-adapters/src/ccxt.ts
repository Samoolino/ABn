import ccxt from 'ccxt';
import type { CEXAdapter, CEXId, NormalizedOrderBook } from '../index.ts';

type CcxtCredentials = { apiKey: string; secret: string; password?: string; enableRateLimit?: boolean };
const FACTORIES: Record<CEXId, new (config?: Record<string, unknown>) => any> = { mexc: ccxt.mexc, gate: ccxt.gate, binance: ccxt.binance, kraken: ccxt.kraken, okx: ccxt.okx, bybit: ccxt.bybit, coinbase: ccxt.coinbase, kucoin: ccxt.kucoin, bitfinex: ccxt.bitfinex, lbank: ccxt.lbank };

export class CcxtCEXAdapter implements CEXAdapter {
  readonly id: CEXId;
  readonly name: string;
  private readonly exchange: any;
  constructor(id: CEXId, credentials: CcxtCredentials) {
    this.id = id;
    this.name = id;
    const Factory = FACTORIES[id];
    if (!Factory) throw new Error(`${id.toUpperCase()}_NOT_SUPPORTED`);
    if (!credentials.apiKey || !credentials.secret) throw new Error(`${id.toUpperCase()}_NOT_CONFIGURED`);
    this.exchange = new Factory({ ...credentials, enableRateLimit: credentials.enableRateLimit ?? true });
  }
  async connect() { await this.exchange.loadMarkets(); }
  async health() { try { await this.exchange.fetchStatus(); return true; } catch { return false; } }
  async markets() { await this.exchange.loadMarkets(); return Object.keys(this.exchange.markets); }
  async ticker(symbol: string) { const t = await this.exchange.fetchTicker(symbol); return { bid: Number(t.bid), ask: Number(t.ask), timestamp: Number(t.timestamp ?? Date.now()) }; }
  async orderBook(symbol: string, limit = 20): Promise<NormalizedOrderBook> { const b = await this.exchange.fetchOrderBook(symbol, limit); return { symbol, bids: b.bids.map(([price, amount]: [number, number]) => ({ price: Number(price), amount: Number(amount) })), asks: b.asks.map(([price, amount]: [number, number]) => ({ price: Number(price), amount: Number(amount) })), timestamp: Number(b.timestamp ?? Date.now()) }; }
  async balances() { const b = await this.exchange.fetchBalance(); const out: Record<string, number> = {}; for (const [asset, value] of Object.entries(b.free ?? {})) out[asset] = Number(value); return out; }
  async fees(symbol: string) { const m = this.exchange.market(symbol); return { maker: Number(m?.maker ?? this.exchange.fees.trading.maker), taker: Number(m?.taker ?? this.exchange.fees.trading.taker) }; }
  async createOrder(input: { symbol: string; side: 'buy'|'sell'; type: 'market'|'limit'; amount: number; price?: number }) { const r = await this.exchange.createOrder(input.symbol, input.type, input.side, input.amount, input.price); return { id: String(r.id), status: String(r.status ?? 'open') }; }
  async cancelOrder(id: string, symbol: string) { await this.exchange.cancelOrder(id, symbol); }
  async orderStatus(id: string, symbol: string) { const o = await this.exchange.fetchOrder(id, symbol); return { status: String(o.status ?? 'unknown'), filled: Number(o.filled ?? 0), average: o.average == null ? undefined : Number(o.average), fee: o.fee?.cost == null ? undefined : Number(o.fee.cost) }; }
  async reconcile() { await this.exchange.fetchOpenOrders(); }
}
