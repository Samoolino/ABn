export type LegStatus='PENDING'|'SUBMITTED'|'FILLED'|'PARTIAL'|'FAILED'|'CANCELLED'|'UNKNOWN';
export interface ExecutionLeg{venue:string;symbol:string;side:'BUY'|'SELL';quantity:number;status:LegStatus;externalId?:string;}
export interface ExecutionPlan{correlationId:string;legs:ExecutionLeg[];maxUnhedgedMs:number;maxRecoverySlippageBps:number;}
export function needsRecovery(plan:ExecutionPlan,now=Date.now(),startedAt=now):boolean{const [a,b]=plan.legs;return (a.status==='FILLED'&&b.status!=='FILLED')||(b.status==='FILLED'&&a.status!=='FILLED')||(now-startedAt>plan.maxUnhedgedMs&&(a.status!=='FILLED'||b.status!=='FILLED'));}
