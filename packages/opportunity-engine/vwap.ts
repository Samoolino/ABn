export type BookLevel={price:number;amount:number};
export interface VwapResult{filled:number;vwap:number;notional:number;unfilled:number;}
export function executableVwap(levels:BookLevel[],requested:number):VwapResult{
 if(requested<=0) return {filled:0,vwap:0,notional:0,unfilled:requested};
 let remaining=requested,notional=0,filled=0;
 for(const l of levels){if(l.price<=0||l.amount<=0) continue;const take=Math.min(remaining,l.amount);filled+=take;notional+=take*l.price;remaining-=take;if(remaining<=0)break;}
 return {filled,vwap:filled?notional/filled:0,notional,unfilled:remaining};
}
