export type VenueKind='CEX'|'DEX';
export interface NormalizedMarket { venue:string; symbol:string; base:string; quote:string; active:boolean; minAmount?:number; amountPrecision?:number; pricePrecision?:number; }
export interface OrderBookLevel { price:number; amount:number; }
export interface NormalizedOrderBook { bids:OrderBookLevel[]; asks:OrderBookLevel[]; timestamp:number; }
export interface CEXAdapter { name:string; connect():Promise<void>; health():Promise<boolean>; markets():Promise<NormalizedMarket[]>; orderBook(symbol:string):Promise<NormalizedOrderBook>; balances():Promise<Record<string,number>>; fees(symbol:string):Promise<{maker:number; taker:number}>; }
export interface DEXAdapter { name:string; chainId:number; health():Promise<boolean>; quoteExactInput(tokenIn:string,tokenOut:string,amountIn:string):Promise<{amountOut:string; gasEstimate?:string}>; }
