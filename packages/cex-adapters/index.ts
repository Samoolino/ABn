import ccxt from 'ccxt';
import type { CEXAdapter } from '@abn/venue-adapters';
import type { CEXId } from '@abn/venue-adapters';

const classes: Record<CEXId, string> = {
  mexc: 'mexc', gate: 'gate', binance: 'binance', kraken: 'kraken', okx: 'okx',
  bybit: 'bybit', coinbase: 'coinbase', kucoin: 'kucoin', bitfinex: 'bitfinex', lbank: 'lbank',
};

export function createCEXAdapter(id: CEXId, credentials: Record<string, string>): CEXAdapter {
  const ctor = (ccxt as any)[classes[id]];
  if (!ctor) throw new Error(`${id.toUpperCase()}_UNSUPPORTED_BY_CCXT`);

  const ex = new ctor({
    apiKey: credentials.apiKey,
    secret: credentials.secret,
    password: credentials.password,
    enableRateLimit: true,
  });

  return {
    id,
    async connect() {
      await ex.loadMarkets();
    },
    async health() {
      try {
        await ex.fetchTime();
        return true;
      } catch {
        return false;
      }
    },
    async markets() {
      await ex.loadMarkets();
      return Object.keys(ex.markets);
    },
    async ticker(symbol) {
      const t = await ex.fetchTicker(symbol);
      return { bid: Number(t.bid), ask: Number(t.ask), timestamp: Number(t.timestamp || Date.now()) };
    },
    async orderBook(symbol, limit = 50) {
      const b = await ex.fetchOrderBook(symbol, limit);
      return {
        symbol,
        bids: b.bids.map((x: any) => ({price: Number(x[0]), amount: Number(x[1])})),
        asks: b.asks.map((x: any) => ({price: Number(x[0]), amount: Number(x[1])})),
        timestamp: Number(b.timestamp || Date.now()),
      };
    },
    async balances() {
      const b = await ex.fetchBalance();
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(b.total || {})) out[k] = Number(v);
      return out;
    },
    async fees(symbol) {
      const m = ex.markets[symbol];
      return { maker: Number(m?.maker ?? 0), taker: Number(m?.taker ?? 0) };
    },
    async createOrder(input) {
      const o = await ex.createOrder(input.symbol, input.type, input.side, input.amount, input.price);
      return { id: o.id, status: String(o.status || 'open') };
    },
    async cancelOrder(orderId, symbol) {
      await ex.cancelOrder(orderId, symbol);
    },
    async orderStatus(orderId, symbol) {
      const o = await ex.fetchOrder(orderId, symbol);
      return {
        status: String(o.status || 'unknown'),
        filled: Number(o.filled || 0),
        average: o.average == null ? undefined : Number(o.average),
        fee: o.fee?.cost == null ? undefined : Number(o.fee.cost),
      };
    },
    async reconcile() {
      return;
    },
  };
}
