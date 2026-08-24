import { buildOpportunity } from './index';
const q=(venue:string,side:'buy'|'sell',vwap:number)=>({venue,symbol:'USDC/USDT',side,quantity:1000,vwap,fee:0,gasCost:0,slippage:0,timestamp:Date.now(),expiresAt:Date.now()+1000});
const base={buyFee:1,sellFee:1,gas:1,slippage:1,bridge:0,settlement:0,fixed:0,reserve:1};
const o=buildOpportunity(q('a','buy',0.999),q('b','sell',1.003),base); if(!o||o.expectedNetProfit<=0)throw new Error('profitable opportunity test failed');
const bad=buildOpportunity(q('a','buy',1.001),q('b','sell',1.000),base); if(!bad||bad.expectedNetProfit>=0)throw new Error('negative opportunity test failed');
