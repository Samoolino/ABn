import { createCEXAdapter } from '@abn/cex-adapters';
import type { CEXId, CEXAdapter } from '@abn/venue-adapters';
import type { Opportunity } from '@abn/types';

export interface PairExecutionConnector { buy: CEXAdapter; sell: CEXAdapter; }
export interface PairExecutionInput {
  correlationId: string;
  opportunityId: string;
  buy: { symbol: string; amount: number; type: 'market' | 'limit' };
  sell: { symbol: string; amount: number; type: 'market' | 'limit' };
  capital: { available: number; source: string; commitmentMs: number; repayable: boolean; repaymentAmount: number; collateralRequired: number };
}
export interface PairExecutionRecovery {
  buyFilled: number; sellFilled: number;
  buyHedgeOrderId?: string; sellHedgeOrderId?: string;
  buyHedgeStatus?: string; sellHedgeStatus?: string;
  reconciled: boolean;
}
export interface PairExecutionResult {
  status: 'COMPLETED' | 'FAILED' | 'TIMEOUT' | 'HEDGE_OR_EXIT';
  buyOrderId?: string; sellOrderId?: string; recovery?: PairExecutionRecovery;
}

const CEX_IDS = new Set<CEXId>(['mexc','gate','binance','kraken','okx','bybit','coinbase','kucoin','bitfinex','lbank']);
const ENV_PREFIX: Record<CEXId, string> = { mexc:'MEXC', gate:'GATE', binance:'BINANCE', kraken:'KRAKEN', okx:'OKX', bybit:'BYBIT', coinbase:'COINBASE', kucoin:'KUCOIN', bitfinex:'BITFINEX', lbank:'LBANK' };
function cexId(venue: string): CEXId { const id=venue.toLowerCase() as CEXId; if(!CEX_IDS.has(id)) throw new Error(`CEX_UNSUPPORTED:${venue}`); return id; }
export function createCEXAdapterFromEnv(venue: string): CEXAdapter { const id=cexId(venue), p=ENV_PREFIX[id]; const apiKey=process.env[`${p}_API_KEY`], secret=process.env[`${p}_API_SECRET`], password=process.env[`${p}_PASSWORD`]; if(!apiKey||!secret) throw new Error(`CEX_CREDENTIALS_NOT_CONFIGURED:${p}`); return createCEXAdapter(id,{apiKey,secret,...(password?{password}:{})}); }
export function createCEXPairExecutionConnector(buy:CEXAdapter,sell:CEXAdapter):PairExecutionConnector{return{buy,sell};}

async function hedgeFilledLeg(adapter:CEXAdapter,symbol:string,filled:number,side:'buy'|'sell'):Promise<{orderId?:string;status?:string;ok:boolean}> {
  if(!Number.isFinite(filled)||filled<=0) return {ok:true};
  try {
    const hedge=await adapter.createOrder({symbol,side,amount:filled,type:'market'});
    const status=await adapter.orderStatus(hedge.id,symbol);
    const filledHedge=status.status==='closed'||status.status==='filled';
    return {orderId:hedge.id,status:status.status,ok:filledHedge&&Number.isFinite(status.filled)&&status.filled>=filled};
  } catch {
    return {ok:false};
  }
}

async function reconcileOrders(connector:PairExecutionConnector):Promise<boolean>{
  try {
    await Promise.all([connector.buy.reconcile(), connector.sell.reconcile()]);
    return true;
  } catch {
    return false;
  }
}

async function readFilledAfterCancellation(adapter:CEXAdapter, orderId:string, symbol:string):Promise<number>{
  try {
    const status=await adapter.orderStatus(orderId,symbol);
    return Number.isFinite(status.filled)?Math.max(0,status.filled):0;
  } catch {
    return 0;
  }
}

export async function executePair(opportunity:Opportunity,input:PairExecutionInput,connector:PairExecutionConnector,timeoutMs:number):Promise<PairExecutionResult>{
  if(!Number.isFinite(opportunity.expectedNetProfit)||opportunity.expectedNetProfit<=0) throw new Error('PAIR_NET_PROFIT_GATE_REJECTED');
  if(!Number.isFinite(opportunity.capitalRequired)||opportunity.capitalRequired<=0) throw new Error('PAIR_CAPITAL_REQUIRED_INVALID');
  if(opportunity.expiresAt<=Date.now()) throw new Error('PAIR_OPPORTUNITY_EXPIRED');
  if(input.capital.source!=='FUNDED_INVENTORY') throw new Error('PAIR_CAPITAL_SOURCE_REJECTED');
  if(!Number.isFinite(input.capital.available)||input.capital.available<opportunity.capitalRequired) throw new Error('PAIR_CAPITAL_INSUFFICIENT');
  if(!input.correlationId||!input.opportunityId) throw new Error('PAIR_CORRELATION_REQUIRED');
  if(!Number.isFinite(timeoutMs)||timeoutMs<=0) throw new Error('PAIR_TIMEOUT_INVALID');
  if(!Number.isFinite(input.buy.amount)||input.buy.amount<=0) throw new Error('PAIR_BUY_AMOUNT_INVALID');
  if(!Number.isFinite(input.sell.amount)||input.sell.amount<=0) throw new Error('PAIR_SELL_AMOUNT_INVALID');

  const started=Date.now();
  const [buyOrder,sellOrder]=await Promise.all([
    connector.buy.createOrder({symbol:input.buy.symbol,side:'buy',amount:input.buy.amount,type:input.buy.type}),
    connector.sell.createOrder({symbol:input.sell.symbol,side:'sell',amount:input.sell.amount,type:input.sell.type}),
  ]);
  if(Date.now()-started>timeoutMs){
    await Promise.allSettled([
      connector.buy.cancelOrder(buyOrder.id,input.buy.symbol),
      connector.sell.cancelOrder(sellOrder.id,input.sell.symbol),
    ]);
    const [buyFilled,sellFilled]=await Promise.all([
      readFilledAfterCancellation(connector.buy,buyOrder.id,input.buy.symbol),
      readFilledAfterCancellation(connector.sell,sellOrder.id,input.sell.symbol),
    ]);
    const reconciled=await reconcileOrders(connector);
    return {status:'TIMEOUT',buyOrderId:buyOrder.id,sellOrderId:sellOrder.id,recovery:{buyFilled,sellFilled,reconciled}};
  }

  let [buyStatus,sellStatus]=await Promise.all([
    connector.buy.orderStatus(buyOrder.id,input.buy.symbol),
    connector.sell.orderStatus(sellOrder.id,input.sell.symbol),
  ]);
  if(Date.now()-started>timeoutMs){
    await Promise.allSettled([
      connector.buy.cancelOrder(buyOrder.id,input.buy.symbol),
      connector.sell.cancelOrder(sellOrder.id,input.sell.symbol),
    ]);
    const [buyFilled,sellFilled]=await Promise.all([
      readFilledAfterCancellation(connector.buy,buyOrder.id,input.buy.symbol),
      readFilledAfterCancellation(connector.sell,sellOrder.id,input.sell.symbol),
    ]);
    const reconciled=await reconcileOrders(connector);
    return {status:'TIMEOUT',buyOrderId:buyOrder.id,sellOrderId:sellOrder.id,recovery:{buyFilled,sellFilled,reconciled}};
  }
  const buyFilled=buyStatus.status==='closed'||buyStatus.status==='filled';
  const sellFilled=sellStatus.status==='closed'||sellStatus.status==='filled';

  if(buyFilled&&sellFilled){
    const reconciled=await reconcileOrders(connector);
    return {status:reconciled?'COMPLETED':'FAILED',buyOrderId:buyOrder.id,sellOrderId:sellOrder.id,recovery:{buyFilled:Number(buyStatus.filled||0),sellFilled:Number(sellStatus.filled||0),reconciled}};
  }

  await Promise.allSettled([
    buyFilled?Promise.resolve():connector.buy.cancelOrder(buyOrder.id,input.buy.symbol),
    sellFilled?Promise.resolve():connector.sell.cancelOrder(sellOrder.id,input.sell.symbol),
  ]);
  if(Date.now()-started>timeoutMs){
    const [buyFilledAfterCancel,sellFilledAfterCancel]=await Promise.all([
      readFilledAfterCancellation(connector.buy,buyOrder.id,input.buy.symbol),
      readFilledAfterCancellation(connector.sell,sellOrder.id,input.sell.symbol),
    ]);
    const reconciled=await reconcileOrders(connector);
    return {status:'TIMEOUT',buyOrderId:buyOrder.id,sellOrderId:sellOrder.id,recovery:{buyFilled:buyFilledAfterCancel,sellFilled:sellFilledAfterCancel,reconciled}};
  }
  [buyStatus,sellStatus]=await Promise.all([
    connector.buy.orderStatus(buyOrder.id,input.buy.symbol),
    connector.sell.orderStatus(sellOrder.id,input.sell.symbol),
  ]);
  if(Date.now()-started>timeoutMs){
    const [buyFilledAfterCancel,sellFilledAfterCancel]=await Promise.all([
      readFilledAfterCancellation(connector.buy,buyOrder.id,input.buy.symbol),
      readFilledAfterCancellation(connector.sell,sellOrder.id,input.sell.symbol),
    ]);
    const reconciled=await reconcileOrders(connector);
    return {status:'TIMEOUT',buyOrderId:buyOrder.id,sellOrderId:sellOrder.id,recovery:{buyFilled:buyFilledAfterCancel,sellFilled:sellFilledAfterCancel,reconciled}};
  }
  const actualBuyFilled=Number.isFinite(buyStatus.filled)?Math.max(0,buyStatus.filled):0;
  const actualSellFilled=Number.isFinite(sellStatus.filled)?Math.max(0,sellStatus.filled):0;
  if(actualBuyFilled===0&&actualSellFilled===0){
    const reconciled=await reconcileOrders(connector);
    return {status:'FAILED',buyOrderId:buyOrder.id,sellOrderId:sellOrder.id,recovery:{buyFilled:0,sellFilled:0,reconciled}};
  }

  const netExposure=actualBuyFilled-actualSellFilled;
  const hedge = netExposure>0
    ? { side:'sell' as const, adapter:connector.buy, amount:netExposure, venue:'buy' as const }
    : { side:'buy' as const, adapter:connector.sell, amount:Math.abs(netExposure), venue:'sell' as const };

  const hedgeResult=await hedgeFilledLeg(hedge.adapter, hedge.venue==='buy' ? input.buy.symbol : input.sell.symbol, hedge.amount, hedge.side);
  if(Date.now()-started>timeoutMs){
    const reconciled=await reconcileOrders(connector);
    return {status:'TIMEOUT',buyOrderId:buyOrder.id,sellOrderId:sellOrder.id,recovery:{buyFilled:actualBuyFilled,sellFilled:actualSellFilled,...(hedge.venue==='buy'?{buyHedgeOrderId:hedgeResult.orderId,buyHedgeStatus:hedgeResult.status}:{sellHedgeOrderId:hedgeResult.orderId,sellHedgeStatus:hedgeResult.status}),reconciled}};
  }
  const reconciled=await reconcileOrders(connector);
  const recovery:PairExecutionRecovery={
    buyFilled:actualBuyFilled,
    sellFilled:actualSellFilled,
    ...(hedge.venue==='buy'?{buyHedgeOrderId:hedgeResult.orderId,buyHedgeStatus:hedgeResult.status}:{sellHedgeOrderId:hedgeResult.orderId,sellHedgeStatus:hedgeResult.status}),
    reconciled,
  };
  const recovered=hedgeResult.ok&&reconciled;
  return {status:recovered?'HEDGE_OR_EXIT':'FAILED',buyOrderId:buyOrder.id,sellOrderId:sellOrder.id,recovery};
}