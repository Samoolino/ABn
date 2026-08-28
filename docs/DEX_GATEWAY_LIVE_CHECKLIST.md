# DEX Gateway LIVE checklist

A DEX opportunity is not LIVE-eligible from a displayed spread alone.

Required before transaction submission:

1. Gateway health is reachable and authenticated.
2. Quote is fresh and has not expired.
3. Route is executable for the requested amount.
4. Liquidity/depth and price impact are within configured bounds.
5. Gas is estimated and included in economics.
6. Wallet balance and token allowance are sufficient.
7. If a CEX leg exists, its live executable VWAP is also validated.
8. Fees, gas, slippage, bridge/settlement costs and the safety buffer are included.
9. Expected net profit remains strictly above the safety buffer immediately before submission.
10. Transaction submission has a correlation ID.
11. Transaction confirmation is required before settlement is recorded.
12. Actual received amounts are reconciled against expected amounts.
13. Any timeout, failed transaction, stale quote, insufficient balance or negative economics fails closed.

`LIVE` does not mean risk-free. The invariant is that the engine must not intentionally submit an opportunity whose currently verified executable economics are at or below the configured safety threshold.
