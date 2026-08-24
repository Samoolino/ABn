import type { CapitalAccess, Opportunity } from '@abn/types';

/** Capital is access capacity, not a fixed account balance. A candidate may be funded inventory,
 * temporary liquidity, flash liquidity, or a composition of sources. The engine only counts capital
 * that is actually available for the required size, duration and repayment terms. */
export interface CapitalProvider {
  name: string;
  kind: CapitalAccess['source'];
  available(required: number): Promise<CapitalAccess>;
}

export async function selectCapital(opportunity: Opportunity, providers: CapitalProvider[]): Promise<CapitalAccess | null> {
  for (const provider of providers) {
    const access = await provider.available(opportunity.capitalRequired);
    if (access.available >= opportunity.capitalRequired && access.repayable && access.repaymentAmount <= access.available + opportunity.expectedNetProfit) return access;
  }
  return null;
}

export function capitalAtRisk(access: CapitalAccess): number {
  return Math.max(0, access.available - access.repaymentAmount);
}
