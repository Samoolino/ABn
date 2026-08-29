import type { ExecutionLeg } from './coordinated-plan';
import type { LegPreflightResult } from './coordinated-preflight';

export interface AuthoritativePreflightProvider {
  preflight(leg: ExecutionLeg): Promise<LegPreflightResult>;
}

export function createAuthoritativePreflightProvider(input: {
  preflightCex: (leg: ExecutionLeg) => Promise<LegPreflightResult>;
  preflightDex: (leg: ExecutionLeg) => Promise<LegPreflightResult>;
}): AuthoritativePreflightProvider {
  return {
    async preflight(leg) {
      const result = leg.kind === 'CEX'
        ? await input.preflightCex(leg)
        : await input.preflightDex(leg);

      if (!result || result.ready !== true) {
        return { ready: false, reason: result?.reason ?? 'AUTHORITATIVE_PREFLIGHT_FAILED' };
      }

      if (!Number.isFinite(result.availableCapital) || Number(result.availableCapital) < 0) {
        return { ...result, ready: false, reason: 'AUTHORITATIVE_CAPITAL_INVALID' };
      }

      if (!Number.isFinite(result.requiredCapital) || Number(result.requiredCapital) <= 0) {
        return { ...result, ready: false, reason: 'AUTHORITATIVE_REQUIRED_CAPITAL_INVALID' };
      }

      if (!Number.isFinite(result.quoteTimestampMs)) {
        return { ...result, ready: false, reason: 'AUTHORITATIVE_QUOTE_TIMESTAMP_REQUIRED' };
      }

      if (!Number.isFinite(result.netProfitAfterCosts)) {
        return { ...result, ready: false, reason: 'AUTHORITATIVE_NET_PROFIT_REQUIRED' };
      }

      return result;
    },
  };
}
