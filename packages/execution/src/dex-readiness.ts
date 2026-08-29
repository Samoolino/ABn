import type { ExecutionLeg } from './coordinated-plan';
import type { VenueReadinessProvider } from './runtime-readiness';

export interface DexOnChainSource {
  getBalance(input: { network: string; asset: string }): Promise<number>;
  getAllowance(input: { network: string; asset: string; owner: string; spender: string }): Promise<number>;
}

function assetForLeg(leg: ExecutionLeg): string {
  const [base, quote] = leg.symbol.split(/[-/]/).map((v) => v.trim().toUpperCase());
  const asset = leg.side === 'BUY' ? quote : base;
  if (!asset) throw new Error('DEX_ASSET_PARSE_FAILED');
  return asset;
}

export function createDexReadinessProvider(input: {
  source: DexOnChainSource;
  quote: (leg: ExecutionLeg) => Promise<{ timestampMs: number; netProfitAfterCosts: number }>;
  ownerForLeg: (leg: ExecutionLeg) => string;
  spenderForLeg: (leg: ExecutionLeg) => string;
  requiredCapital?: (leg: ExecutionLeg) => number;
}): VenueReadinessProvider {
  return {
    async capital(leg) {
      if (!leg.network) throw new Error('DEX_NETWORK_REQUIRED');
      const asset = assetForLeg(leg);
      const required = input.requiredCapital ? input.requiredCapital(leg) : leg.quantity;
      const available = await input.source.getBalance({ network: leg.network, asset });
      if (!Number.isFinite(available)) throw new Error('DEX_BALANCE_UNAVAILABLE');
      return { available, required };
    },
    quote: input.quote,
    async wallet(leg) {
      if (!leg.network) return false;
      const owner = input.ownerForLeg(leg);
      return typeof owner === 'string' && owner.length > 0;
    },
    async allowance(leg) {
      if (!leg.network) return false;
      const asset = assetForLeg(leg);
      const owner = input.ownerForLeg(leg);
      const spender = input.spenderForLeg(leg);
      if (!owner || !spender) return false;
      const required = input.requiredCapital ? input.requiredCapital(leg) : leg.quantity;
      const allowance = await input.source.getAllowance({ network: leg.network, asset, owner, spender });
      return Number.isFinite(allowance) && allowance >= required;
    },
  };
}
