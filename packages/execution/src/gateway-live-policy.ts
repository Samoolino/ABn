export type GatewayLivePolicyInput = {
  enabled: boolean;
  quotePrice: number;
  executablePrice: number;
  expectedNetProfit: number;
  safetyBuffer: number;
  quoteExpiresAt?: number;
  nowMs?: number;
};

/** Fail-closed policy for DEX Gateway LIVE execution. */
export function assertGatewayLiveEligible(input: GatewayLivePolicyInput): void {
  const now = input.nowMs ?? Date.now();
  if (!input.enabled) throw new Error("DEX_GATEWAY_LIVE_DISABLED");
  if (!Number.isFinite(input.quotePrice) || input.quotePrice <= 0) throw new Error("DEX_GATEWAY_INVALID_QUOTE");
  if (!Number.isFinite(input.executablePrice) || input.executablePrice <= 0) throw new Error("DEX_GATEWAY_INVALID_EXECUTABLE_PRICE");
  if (input.quoteExpiresAt !== undefined && input.quoteExpiresAt <= now) throw new Error("DEX_GATEWAY_QUOTE_EXPIRED");
  if (input.executablePrice <= input.quotePrice) throw new Error("DEX_GATEWAY_NO_EXECUTABLE_SPREAD");
  if (!Number.isFinite(input.expectedNetProfit) || input.expectedNetProfit <= input.safetyBuffer) {
    throw new Error("DEX_GATEWAY_NET_PROFIT_BELOW_SAFETY_BUFFER");
  }
}
