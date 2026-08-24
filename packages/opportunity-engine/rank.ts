import type { Opportunity } from '@abn/types';
export function rankOpportunities(items:Opportunity[]):Opportunity[]{return [...items].filter(o=>o.expectedNetProfit>o.safetyReserve&&o.quantity>0).sort((a,b)=>{const ar=a.capitalRequired>0?a.expectedNetProfit/a.capitalRequired:0;const br=b.capitalRequired>0?b.expectedNetProfit/b.capitalRequired:0;return br-ar;});}
