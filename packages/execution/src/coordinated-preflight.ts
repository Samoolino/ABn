import type { CoordinatedExecutionPlan, ExecutionLeg } from './coordinated-plan';

export interface LegPreflightResult {
  ready: boolean;
  reason?: string;
  availableCapital?: number;
  requiredCapital?: number;
  walletReady?: boolean;
  allowanceReady?: boolean;
  quoteTimestampMs?: number;
  netProfitAfterCosts?: number;
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

/** Validates both legs before execution release; never submits an order. */
export async function preflightCoordinatedExecution(input: CoordinatedPreflightInput): Promise<CoordinatedPreflightResult> {
  if (!input.plan || input.plan.legs.length !== 2) return { ready: false, reason: 'COORDINATED_TWO_LEGS_REQUIRED' };
  if (!Number.isFinite(input.minNetProfit) || input.minNetProfit < 0) return { ready: false, reason: 'COORDINATED_MIN_PROFIT_INVALID' };
  if (!Number.isFinite(input.maxQuoteAgeMs) || input.maxQuoteAgeMs <= 0) return { ready: false, reason: 'COORDINATED_QUOTE_AGE_POLICY_INVALID' };

  const now = input.now ?? Date.now();
  const legs = await Promise.all(input.plan.legs.map((leg) => input.preflightLeg(leg))) as [LegPreflightResult, LegPreflightResult];

  for (const leg of legs) {
    if (!leg.ready) return { ready: false, reason: leg.reason ?? 'COORDINATED_LEG_PREFLIGHT_FAILED', legs };
    if (leg.requiredCapital !== undefined && leg.availableCapital !== undefined && leg.availableCapital < leg.requiredCapital) {
      return { ready: false, reason: 'COORDINATED_INSUFFICIENT_CAPITAL', legs };
    }
    if (leg.walletReady !== true) return { ready: false, reason: 'COORDINATED_WALLET_NOT_READY', legs };
    if (leg.allowanceReady !== true) return { ready: false, reason: 'COORDINATED_ALLOWANCE_NOT_READY', legs };
    if (!Number.isFinite(leg.quoteTimestampMs) || now - Number(leg.quoteTimestampMs) > input.maxQuoteAgeMs || Number(leg.quoteTimestampMs) > now) {
      return { ready: false, reason: 'COORDINATED_QUOTE_STALE', legs };
    }
    if (!Number.isFinite(leg.netProfitAfterCosts) || Number(leg.netProfitAfterCosts) <= input.minNetProfit) {
      return { ready: false, reason: 'COORDINATED_NET_PROFIT_AFTER_COSTS_REJECTED', legs };
    }
  }
  return { ready: true, legs };
}
