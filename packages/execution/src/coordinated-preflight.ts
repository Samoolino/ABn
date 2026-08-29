import type { CoordinatedExecutionPlan, ExecutionLeg } from './coordinated-plan';

export interface LegPreflightResult {
  ready: boolean;
  reason?: string;
  availableCapital?: number;
  requiredCapital?: number;
  walletReady?: boolean;
  allowanceReady?: boolean;
}

export interface CoordinatedPreflightInput {
  plan: CoordinatedExecutionPlan;
  minNetProfit: number;
  now?: number;
  maxQuoteAgeMs: number;
  preflightLeg: (leg: ExecutionLeg) => Promise<LegPreflightResult>;
}

export interface CoordinatedPreflightResult {
  ready: boolean;
  reason?: string;
  legs?: [LegPreflightResult, LegPreflightResult];
}

/**
 * Validates BOTH legs before any execution release. This layer performs no
 * order submission and fails closed when either venue/capital preflight is
 * unavailable or unsuccessful.
 */
export async function preflightCoordinatedExecution(
  input: CoordinatedPreflightInput,
): Promise<CoordinatedPreflightResult> {
  if (!input.plan || input.plan.legs.length !== 2) {
    return { ready: false, reason: 'COORDINATED_TWO_LEGS_REQUIRED' };
  }
  if (!Number.isFinite(input.minNetProfit) || input.minNetProfit < 0) {
    return { ready: false, reason: 'COORDINATED_MIN_PROFIT_INVALID' };
  }
  if (!Number.isFinite(input.maxQuoteAgeMs) || input.maxQuoteAgeMs <= 0) {
    return { ready: false, reason: 'COORDINATED_QUOTE_AGE_POLICY_INVALID' };
  }

  const legs = await Promise.all(input.plan.legs.map((leg) => input.preflightLeg(leg))) as [LegPreflightResult, LegPreflightResult];

  for (const leg of legs) {
    if (!leg.ready) return { ready: false, reason: leg.reason ?? 'COORDINATED_LEG_PREFLIGHT_FAILED', legs };
    if (leg.requiredCapital !== undefined && leg.availableCapital !== undefined && leg.availableCapital < leg.requiredCapital) {
      return { ready: false, reason: 'COORDINATED_INSUFFICIENT_CAPITAL', legs };
    }
    if (leg.kind === undefined) continue;
  }

  return { ready: true, legs };
}
