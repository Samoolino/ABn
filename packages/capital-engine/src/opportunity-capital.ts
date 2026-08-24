export type CapitalSourceKind = 'FUNDED_INVENTORY' | 'TEMPORARY_LIQUIDITY' | 'FLASH_LIQUIDITY' | 'COMPOSITE';
export interface CapitalSource { id:string; kind:CapitalSourceKind; asset:string; network?:string; accessibleAmount:number; cost:number; repaymentRequired:number; expiresAt?:number; verified:boolean; }
export interface CapitalRequirement { asset:string; network?:string; notional:number; expectedNetProfit:number; safetyReserve:number; }
export interface CapitalDecision { approved:boolean; accessibleAmount:number; sourceIds:string[]; reason:string; }
export function assessCapital(r:CapitalRequirement,sources:CapitalSource[],now=Date.now()):CapitalDecision {
 const valid=sources.filter(s=>s.verified&&s.asset===r.asset&&(!s.network||!r.network||s.network===r.network)&&(!s.expiresAt||s.expiresAt>now)).sort((a,b)=>(a.cost-b.cost)||(b.accessibleAmount-a.accessibleAmount));
 let amount=0; const ids:string[]=[];
 for(const s of valid){amount+=Math.min(s.accessibleAmount,Math.max(0,r.notional-amount));ids.push(s.id);if(amount>=r.notional)break;}
 const approved=amount>=r.notional&&r.expectedNetProfit>r.safetyReserve;
 return {approved,accessibleAmount:amount,sourceIds:ids,reason:approved?'CAPITAL_AND_PROFIT_FLOOR_PASSED':amount<r.notional?'INSUFFICIENT_VERIFIED_ACCESSIBLE_LIQUIDITY':'PROFIT_FLOOR_FAILED'};
}
