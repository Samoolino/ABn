import type { CapitalAccess, Opportunity } from '@abn/types';

export interface CapitalProvider {
  name: string;
  kind: CapitalAccess['source'];
  available(required: number): Promise<CapitalAccess>;
}

export interface FundedCapitalPolicy {
  maxWorkingUsd: number;
  minReserveUsd: number;
  targetEquityUsd: number;
}

export function fundedCapitalPolicy(): FundedCapitalPolicy {
  return {
    maxWorkingUsd: Number(process.env.CAPITAL_MAX_WORKING_USD ?? 2.55),
    minReserveUsd: Number(process.env.CAPITAL_MIN_RESERVE_USD ?? 0.45),
    targetEquityUsd: Number(process.env.TARGET_EQUITY_USD ?? 3),
  };
}

export async function selectCapital(
  opportunity: Opportunity,
  providers: CapitalProvider[],
  policy = fundedCapitalPolicy(),
): Promise<CapitalAccess | null> {
  if (opportunity.capitalRequired <= 0 || opportunity.capitalRequired > policy.maxWorkingUsd) return null;
  if (opportunity.expectedNetProfit <= opportunity.safetyReserve) return null;

  for (const provider of providers) {
    const access = await provider.available(opportunity.capitalRequired + policy.minReserveUsd);
    if (access.source !== 'FUNDED_INVENTORY') continue;
    if (access.available < opportunity.capitalRequired + policy.minReserveUsd) continue;
    if (!access.repayable) continue;
    if (access.repaymentAmount > access.available + opportunity.expectedNetProfit) continue;
    return { ...access, available: Math.min(access.available, policy.maxWorkingUsd) };
  }
  return null;
}

export function capitalAtRisk(access: CapitalAccess): number {
  return Math.max(0, access.available - access.repaymentAmount);
}

export function shouldStopForTarget(equityUsd: number, policy = fundedCapitalPolicy()): boolean {
  return equityUsd >= policy.targetEquityUsd;
}
