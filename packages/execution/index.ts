import type { Opportunity } from '@abn/types';
import type { CapitalAccess } from '@abn/types';

export type LegResult = {status:'FULL_FILL'|'PARTIAL_FILL'|'REJECTED'|'CANCELLED'|'TIMEOUT'|'UNKNOWN'; filled:number; average?:number; externalId?:string};
export interface ExecutionPlan { correlationId:string; opportunityId:string; buy:Record<string,unknown>; sell:Record<string,unknown>; capital:CapitalAccess; }
export interface ExecutionConnector { executeBuy(plan:ExecutionPlan):Promise<LegResult>; executeSell(plan:ExecutionPlan):Promise<LegResult>; hedgeOrExit(plan:ExecutionPlan,leg:LegResult):Promise<LegResult>; }

export async function executePair(opportunity:Opportunity, plan:ExecutionPlan, connector:ExecutionConnector, maxUnhedgedMs:number):Promise<{status:string;buy:LegResult;sell:LegResult}> {
  const buy = await connector.executeBuy(plan);
  if (buy.status !== 'FULL_FILL') return {status:'HEDGE_OR_EXIT',buy,sell:await connector.hedgeOrExit(plan,buy)};
  const started = Date.now();
  const sell = await connector.executeSell(plan);
  if (sell.status === 'FULL_FILL') return {status:'COMPLETED',buy,sell};
  if (Date.now()-started > maxUnhedgedMs || sell.status !== 'FULL_FILL') return {status:'HEDGE_OR_EXIT',buy,sell:await connector.hedgeOrExit(plan,buy)};
  return {status:'PARTIAL',buy,sell};
}
