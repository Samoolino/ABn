import type { ExecutionLeg } from './coordinated-plan';
import type { VenueReadinessProvider } from './runtime-readiness';

export interface HummingbotBalanceSource {
  getBalances(): Promise<Record<string, unknown>>;
}

export function createHummingbotCapitalProvider(input: {
  source: HummingbotBalanceSource;
  quote: (leg: ExecutionLeg) => Promise<{ timestampMs: number; netProfitAfterCosts: number }>;
}): VenueReadinessProvider {
  return {
    async capital(leg) {
      const balances = await input.source.getBalances();
      const asset = leg.symbol.split(/[-/]/)[leg.side === 'BUY' ? 1 : 0]?.toUpperCase();
      const raw = asset ? balances[asset] : undefined;
      const available = typeof raw === 'number' ? raw : Number((raw as Record<string, unknown>)?.available ?? (raw as Record<string, unknown>)?.free);
      if (!Number.isFinite(available)) throw new Error('HUMMINGBOT_BALANCE_UNAVAILABLE');
      return { available, required: leg.quantity };
    },
    quote: input.quote,
  };
}
