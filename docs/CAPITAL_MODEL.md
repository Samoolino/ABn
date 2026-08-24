# Opportunity-accessible capital

ABn does not require a fixed starting capital amount. `CAPITAL_MODEL=ACCESSIBLE_OPPORTUNITY` means the scanner asks: **what liquidity can be validly committed for this specific opportunity, for this specific duration, under independently verified repayment terms?**

Eligible sources: funded inventory; pre-funded cross-network inventory; explicitly configured temporary liquidity; verified atomic flash liquidity; and composite capacity.

A displayed balance is not automatically capital. A provider must confirm availability for the requested size. The engine models principal, provider fees, gas, slippage, settlement/bridge cost, collateral, latency and safety reserve.

An opportunity is executable only when accessible capital covers the required transaction and all modeled costs while expected net profit remains above the safety reserve. If liquidity cannot be independently verified, the opportunity is rejected rather than assumed funded.

This model does not make arbitrage risk-free and does not guarantee repayment or profit.
