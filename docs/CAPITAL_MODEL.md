# Funded-capital model

ABn can trade only against capital that is independently verified as available for the specific opportunity. The preferred source for the controlled live test is `FUNDED_INVENTORY` backed by a protected signer reference.

## $3-equivalent controlled profile

- `TARGET_EQUITY_USD=3`
- `CAPITAL_MAX_WORKING_USD=2.55`
- `CAPITAL_MIN_RESERVE_USD=0.45`
- `MAX_TRADE_SIZE_USD=2.55`
- `MAX_OPEN_TRADES=1`

The engine never assumes the configured amount exists. It queries the signer/venue balance and uses the lesser of verified balance and configured working-capital limits. If the signer is not configured or funded capital cannot be verified, live execution is blocked.

## Execution gate

A candidate must satisfy all of the following:

1. verified funded balance covers trade notional plus reserve;
2. quote is fresh and liquidity supports the requested size;
3. modeled gross proceeds cover purchase cost, trading fees, gas, slippage, bridge/settlement costs and safety reserve;
4. expected net profit exceeds the configured minimum;
5. risk limits and runtime authorization pass;
6. both legs have a reconciliation plan.

A profitable displayed spread is not sufficient.

## Target attainment

When verified equity reaches `TARGET_EQUITY_USD`, new trades stop. Open positions are reconciled and a `SWEEP_REQUEST` is created for operator approval. The sweep signer independently verifies destination, asset, amount and network.

This model does not make arbitrage risk-free and does not guarantee profit.