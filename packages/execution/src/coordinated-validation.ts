import type { Opportunity } from '@abn/types';
import { createCoordinatedExecutionPlan, type CoordinatedExecutionPlan } from './coordinated-plan';

export interface CoordinatedPlanValidation {
  accepted: boolean;
  reason?: string;
  plan?: CoordinatedExecutionPlan;
}

/**
 * Fail-closed validation boundary for mixed CEX/DEX and DEX/DEX opportunities.
 * No execution is released here.
 */
export function validateCoordinatedOpportunity(
  opportunity: Opportunity,
  input: {
    correlationId: string;
    maxUnhedgedMs: number;
    minNetProfit: number;
    isCexVenue: (venue: string) => boolean;
  },
): CoordinatedPlanValidation {
  if (!Number.isFinite(opportunity.expectedNetProfit) || opportunity.expectedNetProfit <= input.minNetProfit) {
    return { accepted: false, reason: 'COORDINATED_NET_PROFIT_GATE_REJECTED' };
  }
  if (!Number.isFinite(opportunity.expiresAt) || opportunity.expiresAt <= Date.now()) {
    return { accepted: false, reason: 'COORDINATED_QUOTE_EXPIRED' };
  }
  try {
    const plan = createCoordinatedExecutionPlan(opportunity, input);
    return { accepted: true, plan };
  } catch (error) {
    return { accepted: false, reason: String(error) };
  }
}
