import type { CoordinatedExecutionPlan } from './coordinated-plan';
import { preflightCoordinatedExecution, type LegPreflightResult } from './coordinated-preflight';

export interface CoordinatedReleaseInput {
  plan: CoordinatedExecutionPlan;
  minNetProfit: number;
  maxQuoteAgeMs: number;
  preflightLeg: (leg: CoordinatedExecutionPlan['legs'][number]) => Promise<LegPreflightResult>;
  release: (plan: CoordinatedExecutionPlan) => Promise<void>;
}

export interface CoordinatedReleaseResult {
  released: boolean;
  reason?: string;
  legs?: [LegPreflightResult, LegPreflightResult];
}

/**
 * Single release boundary for coordinated arbitrage. Nothing is submitted
 * unless both legs pass the authoritative preflight immediately beforehand.
 */
export async function releaseCoordinatedExecution(input: CoordinatedReleaseInput): Promise<CoordinatedReleaseResult> {
  const preflight = await preflightCoordinatedExecution({
    plan: input.plan,
    minNetProfit: input.minNetProfit,
    maxQuoteAgeMs: input.maxQuoteAgeMs,
    preflightLeg: input.preflightLeg,
  });

  if (!preflight.ready) {
    return { released: false, reason: preflight.reason, legs: preflight.legs };
  }

  await input.release(input.plan);
  return { released: true, legs: preflight.legs };
}
