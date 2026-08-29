import type { CoordinatedExecutionPlan, ExecutionLeg } from './coordinated-plan';
import type { LegPreflightResult } from './coordinated-preflight';

export interface VenueReadinessProvider {
  capital: (leg: ExecutionLeg) => Promise<{ available: number; required: number }>;
  quote: (leg: ExecutionLeg) => Promise<{ timestampMs: number; netProfitAfterCosts: number }>;
  wallet?: (leg: ExecutionLeg) => Promise<boolean>;
  allowance?: (leg: ExecutionLeg) => Promise<boolean>;
}

export interface RuntimeReadinessProviders {
  cex: VenueReadinessProvider;
  dex: VenueReadinessProvider;
}

/**
 * Converts authoritative venue checks into the common coordinated-preflight
 * contract. Missing DEX wallet/allowance providers fail closed rather than
 * assuming readiness.
 */
export async function preflightLegFromProviders(
  leg: ExecutionLeg,
  providers: RuntimeReadinessProviders,
): Promise<LegPreflightResult> {
  const provider = leg.kind === 'DEX' ? providers.dex : providers.cex;
  try {
    const capital = await provider.capital(leg);
    const quote = await provider.quote(leg);
    const result: LegPreflightResult = {
      ready: true,
      availableCapital: capital.available,
      requiredCapital: capital.required,
      quoteTimestampMs: quote.timestampMs,
      netProfitAfterCosts: quote.netProfitAfterCosts,
    };

    if (!Number.isFinite(capital.available) || !Number.isFinite(capital.required) || capital.available < capital.required) {
      return { ...result, ready: false, reason: 'VENUE_CAPITAL_UNAVAILABLE' };
    }
    if (!Number.isFinite(quote.timestampMs) || !Number.isFinite(quote.netProfitAfterCosts)) {
      return { ...result, ready: false, reason: 'VENUE_QUOTE_INVALID' };
    }

    if (leg.kind === 'DEX') {
      if (!provider.wallet || !provider.allowance) {
        return { ...result, ready: false, reason: 'DEX_RUNTIME_PROVIDERS_INCOMPLETE' };
      }
      result.walletReady = await provider.wallet(leg);
      result.allowanceReady = await provider.allowance(leg);
      if (!result.walletReady) return { ...result, ready: false, reason: 'DEX_WALLET_NOT_READY' };
      if (!result.allowanceReady) return { ...result, ready: false, reason: 'DEX_ALLOWANCE_NOT_READY' };
    }

    return result;
  } catch (error) {
    return { ready: false, reason: error instanceof Error ? error.message : 'VENUE_PREFLIGHT_FAILED' };
  }
}

export function createProviderBackedPreflight(
  providers: RuntimeReadinessProviders,
): (leg: ExecutionLeg) => Promise<LegPreflightResult> {
  return (leg) => preflightLegFromProviders(leg, providers);
}

export function assertTwoLegPlan(plan: CoordinatedExecutionPlan): void {
  if (!plan || plan.legs.length !== 2) throw new Error('COORDINATED_TWO_LEGS_REQUIRED');
}
