import type { CoordinatedExecutionPlan } from './coordinated-plan';
import { preflightCoordinatedExecution, type CoordinatedPreflightResult, type LegPreflightResult } from './coordinated-preflight';
import type { AuthoritativePreflightProvider } from './authoritative-preflight';

export interface CoordinatedRuntimePreflightInput {
  plan: CoordinatedExecutionPlan;
  provider: AuthoritativePreflightProvider;
  minNetProfit: number;
  maxQuoteAgeMs: number;
  now?: number;
}

/** Runtime bridge: both legs are checked from authoritative venue providers before release. */
export async function runCoordinatedRuntimePreflight(
  input: CoordinatedRuntimePreflightInput,
): Promise<CoordinatedPreflightResult> {
  const results: LegPreflightResult[] = [];
  return preflightCoordinatedExecution({
    plan: input.plan,
    minNetProfit: input.minNetProfit,
    maxQuoteAgeMs: input.maxQuoteAgeMs,
    now: input.now,
    preflightLeg: async (leg) => {
      const result = await input.provider.preflight(leg);
      results.push(result);
      return result;
    },
  });
}
