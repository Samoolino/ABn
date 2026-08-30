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

async function reconcileOrders(connector:PairExecutionConnector):Promise<boolean>{
  try { await Promise.all([connector.buy.reconcile(), connector.sell.reconcile()]); return true; } catch { return false; }
}
async function readFilled(adapter:CEXAdapter, orderId:string, symbol:string):Promise<number>{
  try { const status=await adapter.orderStatus(orderId,symbol); return Number.isFinite(status.filled)?Math.max(0,status.filled):0; } catch { return 0; }
}
async function cancelAndRead(adapter:CEXAdapter, orderId:string, symbol:string):Promise<number>{
  await adapter.cancelOrder(orderId,symbol).catch(()=>undefined);
  return readFilled(adapter,orderId,symbol);
}
async function hedge(adapter:CEXAdapter,symbol:string,amount:number,side:'buy'|'sell'):Promise<{orderId?:string;status?:string;ok:boolean}>{
  if(amount<=0) return {ok:true};
  try {
    const order=await adapter.createOrder({symbol,side,amount,type:'market'});
    const status=await adapter.orderStatus(order.id,symbol);
    return {orderId:order.id,status:status.status,ok:(status.status==='closed'||status.status==='filled')&&Number(status.filled)>=amount};
  } catch { return {ok:false}; }
}
async function recoverExposure(
  connector:PairExecutionConnector,
  input:PairExecutionInput,
  buyFilled:number,
  sellFilled:number,
):Promise<PairExecutionRecovery>{
  const net=buyFilled-sellFilled;
  let buyHedgeOrderId:string|undefined,buyHedgeStatus:string|undefined,sellHedgeOrderId:string|undefined,sellHedgeStatus:string|undefined;
  let hedgeOk=true;
  if(net>0){
    const h=await hedge(connector.buy,input.buy.symbol,net,'sell');
    buyHedgeOrderId=h.orderId; buyHedgeStatus=h.status; hedgeOk=h.ok;
  } else if(net<0){
    const h=await hedge(connector.sell,input.sell.symbol,Math.abs(net),'buy');
    sellHedgeOrderId=h.orderId; sellHedgeStatus=h.status; hedgeOk=h.ok;
  }
  const reconciled=await reconcileOrders(connector);
  return {buyFilled,sellFilled,buyHedgeOrderId,buyHedgeStatus,sellHedgeOrderId,sellHedgeStatus,reconciled:hedgeOk&&reconciled};
}

function terminalStatus(recovery: PairExecutionRecovery): PairExecutionResult['status'] {
  if (!recovery.reconciled) return 'FAILED';
  if (recovery.buyFilled <= 0 && recovery.sellFilled <= 0) return 'FAILED';
  if (Math.abs(recovery.buyFilled - recovery.sellFilled) < 1e-12) return 'COMPLETED';
  return 'HEDGE_OR_EXIT';
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
  const placed=await Promise.allSettled([
    connector.buy.createOrder({symbol:input.buy.symbol,side:'buy',amount:input.buy.amount,type:input.buy.type}),
    connector.sell.createOrder({symbol:input.sell.symbol,side:'sell',amount:input.sell.amount,type:input.sell.type}),
  ]);
  const buyOrder=placed[0].status==='fulfilled'?placed[0].value:undefined;
  const sellOrder=placed[1].status==='fulfilled'?placed[1].value:undefined;

  if(!buyOrder||!sellOrder){
    const buyFilled=buyOrder?await cancelAndRead(connector.buy,buyOrder.id,input.buy.symbol):0;
    const sellFilled=sellOrder?await cancelAndRead(connector.sell,sellOrder.id,input.sell.symbol):0;
    if(buyFilled||sellFilled){
      const recovery=await recoverExposure(connector,input,buyFilled,sellFilled);
      return {status:terminalStatus(recovery),buyOrderId:buyOrder?.id,sellOrderId:sellOrder?.id,recovery};
    }
    const reconciled=await reconcileOrders(connector);
    return {status:'FAILED',buyOrderId:buyOrder?.id,sellOrderId:sellOrder?.id,recovery:{buyFilled:0,sellFilled:0,reconciled}};
  }

  const timedOut=()=>Date.now()-started>timeoutMs;
  const timeoutResult=async():Promise<PairExecutionResult>=>{
    const [buyFilled,sellFilled]=await Promise.all([
      cancelAndRead(connector.buy,buyOrder.id,input.buy.symbol),
      cancelAndRead(connector.sell,sellOrder.id,input.sell.symbol),
    ]);
    if(buyFilled||sellFilled){
      const recovery=await recoverExposure(connector,input,buyFilled,sellFilled);
      return {status:terminalStatus(recovery),buyOrderId:buyOrder.id,sellOrderId:sellOrder.id,recovery};
    }
    const reconciled=await reconcileOrders(connector);
    return {status:'TIMEOUT',buyOrderId:buyOrder.id,sellOrderId:sellOrder.id,recovery:{buyFilled:0,sellFilled:0,reconciled}};
  };
  if(timedOut()) return timeoutResult();

  let [buyStatus,sellStatus]=await Promise.all([
    connector.buy.orderStatus(buyOrder.id,input.buy.symbol),
    connector.sell.orderStatus(sellOrder.id,input.sell.symbol),
  ]);
  if(timedOut()) return timeoutResult();

  const buyDone=buyStatus.status==='closed'||buyStatus.status==='filled';
  const sellDone=sellStatus.status==='closed'||sellStatus.status==='filled';
  if(buyDone&&sellDone){
    const reconciled=await reconcileOrders(connector);
    return {status:reconciled?'COMPLETED':'FAILED',buyOrderId:buyOrder.id,sellOrderId:sellOrder.id,recovery:{buyFilled:Number(buyStatus.filled||0),sellFilled:Number(sellStatus.filled||0),reconciled}};
  }

  const [actualBuyFilled,actualSellFilled]=await Promise.all([
    buyDone?readFilled(connector.buy,buyOrder.id,input.buy.symbol):cancelAndRead(connector.buy,buyOrder.id,input.buy.symbol),
    sellDone?readFilled(connector.sell,sellOrder.id,input.sell.symbol):cancelAndRead(connector.sell,sellOrder.id,input.sell.symbol),
  ]);
  if(timedOut()){
    if(actualBuyFilled||actualSellFilled){
      const recovery=await recoverExposure(connector,input,actualBuyFilled,actualSellFilled);
      return {status:terminalStatus(recovery),buyOrderId:buyOrder.id,sellOrderId:sellOrder.id,recovery};
    }
    const reconciled=await reconcileOrders(connector);
    return {status:'TIMEOUT',buyOrderId:buyOrder.id,sellOrderId:sellOrder.id,recovery:{buyFilled:0,sellFilled:0,reconciled}};
  }
  if(!actualBuyFilled&&!actualSellFilled){
    const reconciled=await reconcileOrders(connector);
    return {status:'FAILED',buyOrderId:buyOrder.id,sellOrderId:sellOrder.id,recovery:{buyFilled:0,sellFilled:0,reconciled}};
  }

  const recovery=await recoverExposure(connector,input,actualBuyFilled,actualSellFilled);
  const matchedExposure=Math.abs(actualBuyFilled-actualSellFilled)<1e-12;
  if(matchedExposure)
    return {status:recovery.reconciled?'COMPLETED':'FAILED',buyOrderId:buyOrder.id,sellOrderId:sellOrder.id,recovery};
  return {status:terminalStatus(recovery),buyOrderId:buyOrder.id,sellOrderId:sellOrder.id,recovery};
}
