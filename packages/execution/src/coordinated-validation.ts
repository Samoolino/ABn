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
    maxQuoteAgeMs: number;
    nowMs?: number;
    isCexVenue: (venue: string) => boolean;
  },
): CoordinatedPlanValidation {
  const nowMs = input.nowMs ?? Date.now();

  if (!Number.isFinite(opportunity.netProfit) || opportunity.netProfit <= input.minNetProfit) {
    return { accepted: false, reason: 'COORDINATED_NET_PROFIT_GATE_REJECTED' };
  }
  if (!Number.isFinite(opportunity.quoteTimestamp) || opportunity.quoteTimestamp <= 0) {
    return { accepted: false, reason: 'COORDINATED_QUOTE_TIMESTAMP_INVALID' };
  }
  if (!Number.isFinite(input.maxQuoteAgeMs) || input.maxQuoteAgeMs <= 0) {
    return { accepted: false, reason: 'COORDINATED_QUOTE_AGE_POLICY_INVALID' };
  }
  if (nowMs - opportunity.quoteTimestamp < 0 || nowMs - opportunity.quoteTimestamp > input.maxQuoteAgeMs) {
    return { accepted: false, reason: 'COORDINATED_QUOTE_STALE' };
  }
  if (!Number.isFinite(opportunity.expiresAt) || opportunity.expiresAt <= nowMs) {
    return { accepted: false, reason: 'COORDINATED_QUOTE_EXPIRED' };
  }
  try {
    const plan = createCoordinatedExecutionPlan(opportunity, input);
    return { accepted: true, plan };
  } catch (error) {
    return { accepted: false, reason: String(error) };
  }
}
