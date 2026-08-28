import { describe, expect, it } from "vitest";
import { assertGatewayLiveEligible } from "./gateway-live-policy";

describe("assertGatewayLiveEligible", () => {
  it("fails closed when Gateway LIVE is disabled", () => {
    expect(() => assertGatewayLiveEligible({ enabled: false, quotePrice: 100, executablePrice: 101, expectedNetProfit: 2, safetyBuffer: 1 })).toThrow("DEX_GATEWAY_LIVE_DISABLED");
  });

  it("rejects an expired quote", () => {
    expect(() => assertGatewayLiveEligible({ enabled: true, quotePrice: 100, executablePrice: 101, expectedNetProfit: 2, safetyBuffer: 1, quoteExpiresAt: 1000, nowMs: 1001 })).toThrow("DEX_GATEWAY_QUOTE_EXPIRED");
  });

  it("rejects a spread that does not cover the safety buffer", () => {
    expect(() => assertGatewayLiveEligible({ enabled: true, quotePrice: 100, executablePrice: 101, expectedNetProfit: 1, safetyBuffer: 1 })).toThrow("DEX_GATEWAY_NET_PROFIT_BELOW_SAFETY_BUFFER");
  });

  it("accepts a fresh positive-net-profit opportunity", () => {
    expect(() => assertGatewayLiveEligible({ enabled: true, quotePrice: 100, executablePrice: 101, expectedNetProfit: 3, safetyBuffer: 1, quoteExpiresAt: 2000, nowMs: 1000 })).not.toThrow();
  });
});
