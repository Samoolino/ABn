import type { Opportunity } from '@abn/types';
import { createCoordinatedExecutionPlan, type CoordinatedExecutionPlan } from './coordinated-plan';

export interface CoordinatedPlanValidation {
  accepted: boolean;
  reason?: string;
  plan?: CoordinatedExecutionPlan;
}

/** Fail-closed validation boundary. It never submits an order. */
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
  const netProfit = Number(opportunity.netProfit ?? opportunity.expectedNetProfit ?? 0);

  if (!Number.isFinite(netProfit) || netProfit <= input.minNetProfit) {
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
    return { accepted: true, plan: createCoordinatedExecutionPlan(opportunity, input) };
  } catch (error) {
    return { accepted: false, reason: String(error) };
  }
}
