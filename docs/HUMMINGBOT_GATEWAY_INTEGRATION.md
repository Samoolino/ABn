# Hummingbot Gateway integration boundary

ABn uses Hummingbot for CEX execution and Hummingbot Gateway as the DEX execution boundary.

The Gateway client is deliberately typed and isolated from CEX execution. LIVE DEX execution must be enabled explicitly and must pass the worker's capital, freshness, liquidity, cost and positive-net-profit gates.

Gateway request/response schemas must be contract-tested against the deployed Gateway before enabling LIVE DEX routes. Until that test and an end-to-end transaction/receipt reconciliation test pass, DEX routes remain blocked in LIVE mode.
