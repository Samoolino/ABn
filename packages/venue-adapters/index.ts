export interface OrderBookLevel { price:number; amount:number }
export interface NormalizedOrderBook { symbol:string; bids:OrderBookLevel[]; asks:OrderBookLevel[]; timestamp:number }
export interface CEXAdapter { readonly id:string; readonly name:string; connect():Promise<void>; health():Promise<boolean>; markets():Promise<string[]>; ticker(symbol:string):Promise<{bid:number;ask:number;timestamp:number}>; orderBook(symbol:string,limit?:number):Promise<NormalizedOrderBook>; balances():Promise<Record<string,number>>; fees(symbol:string):Promise<{maker:number;taker:number}>; createOrder(input:{symbol:string;side:'buy'|'sell';type:'market'|'limit';amount:number;price?:number}):Promise<{id:string;status:string}>; cancelOrder(id:string,symbol:string):Promise<void>; orderStatus(id:string,symbol:string):Promise<{status:string;filled:number;average?:number;fee?:number}>; reconcile():Promise<void>; }

export const CEX_IDS = ['mexc','gate','binance','kraken','okx','bybit','coinbase','kucoin','bitfinex','lbank'] as const;
export type CEXId = typeof CEX_IDS[number];

export interface VenueCredentialProvider { get(venue:CEXId):Promise<Record<string,string>|null> }
export function requireCredentials(venue:CEXId, credentials:Record<string,string>|null): asserts credentials is Record<string,string> { if (!credentials) throw new Error(`${venue.toUpperCase()}_NOT_CONFIGURED`); }
