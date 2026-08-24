export type CapitalSourceKind =
  | "PRE_FUNDED_INVENTORY"
  | "CEX_BALANCE"
  | "DEX_WALLET"
  | "FLASH_LIQUIDITY"
  | "BORROWED_LIQUIDITY"
  | "CREDIT_LINE"
  | "OTHER_ACCESSIBLE_LIQUIDITY";

export interface CapitalOpportunity {
  id: string;
  source: CapitalSourceKind;
  asset: string;
  network?: string;
  availableNotional: number;
  requiredNotional: number;
  expectedReturn: number;
  expectedNetProfit: number;
  totalCosts: number;
  safetyReserve: number;
  expectedDurationMs?: number;
  accessible: boolean;
  repayable: boolean;
}

export interface CapitalPolicy {
  minProfit: number;
  safetyReserve: number;
  maxLoss: number;
  maxNotional: number;
}

/**
 * Capital is modeled as accessible liquidity, not as a fixed wallet balance.
 * An opportunity can qualify when the required funds can be sourced for the
 * complete execution window and the modeled repayment/return remains safe.
 */
export function qualifiesCapital(
  opportunity: CapitalOpportunity,
  policy: CapitalPolicy,
): boolean {
  if (!opportunity.accessible || !opportunity.repayable) return false;
  if (opportunity.requiredNotional <= 0) return false;
  if (opportunity.requiredNotional > policy.maxNotional) return false;
  if (opportunity.expectedNetProfit < policy.minProfit) return false;
  if (opportunity.expectedNetProfit <= policy.safetyReserve) return false;
  if (opportunity.totalCosts + opportunity.safetyReserve >= opportunity.expectedReturn) return false;
  return opportunity.expectedNetProfit >= -policy.maxLoss;
}

export function capitalAtRisk(opportunity: CapitalOpportunity): number {
  return Math.max(0, opportunity.requiredNotional - opportunity.expectedReturn);
}

export function capitalEfficiency(opportunity: CapitalOpportunity): number {
  const risk = capitalAtRisk(opportunity);
  if (risk === 0) return opportunity.expectedNetProfit > 0 ? Number.POSITIVE_INFINITY : 0;
  return opportunity.expectedNetProfit / risk;
}
