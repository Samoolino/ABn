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
function cexId(venue: string): CEXId { const id = venue.toLowerCase() as CEXId; if (!CEX_IDS.has(id)) throw new Error(`CEX_UNSUPPORTED:${venue}`); return id; }
export function createCEXAdapterFromEnv(venue: string): CEXAdapter { const id=cexId(venue), p=ENV_PREFIX[id]; const apiKey=process.env[`${p}_API_KEY`], secret=process.env[`${p}_API_SECRET`], password=process.env[`${p}_PASSWORD`]; if(!apiKey||!secret) throw new Error(`CEX_CREDENTIALS_NOT_CONFIGURED:${p}`); return createCEXAdapter(id,{apiKey,secret,...(password?{password}:{})}); }
export function createCEXPairExecutionConnector(buy: CEXAdapter,sell:CEXAdapter):PairExecutionConnector{return{buy,sell};}
async function hedgeFilledLeg(adapter:CEXAdapter,symbol:string,filled:number,side:'buy'|'sell'):{ } 
