# ABn DRY_RUN Release Gate

## Purpose

Validate the complete arbitrage execution path with live market data and real venue inventory reads while preventing live order submission or funded-capital movement.

## Required mode

```text
TRADING_MODE=DRY_RUN
EXECUTION_ENABLED=false
```

`DRY_RUN` must never submit a live order, withdraw funds, transfer inventory, or expose a private key.

## Required validation sequence

1. Detect a currently executable opportunity from live market data.
2. Verify the opportunity is unexpired and modeled net profit remains positive after fees, gas, slippage, settlement costs, and safety reserve.
3. Verify the authoritative capital source identity.
4. Read protected-signer capital where configured without exporting private-key material.
5. Read venue inventory required for the modeled buy and sell legs.
6. Derive executable sizing from available capital, venue inventory, liquidity, risk limits, and safety reserve; do not rely on a fixed initiation amount.
7. Construct the coordinated execution plan without submitting orders.
8. Simulate partial-fill outcomes and verify bounded hedge/recovery behavior.
9. Verify reconciliation records for intended quantity, observed fills, residual exposure, hedge quantity, fees, and realized/simulated P&L.
10. Persist an auditable DRY_RUN result.

## Pass criteria

The release gate passes only when all required checks are true:

```text
opportunity profitable        = true
opportunity unexpired         = true
capital source consistent     = true
capital sufficient            = true
venue inventory sufficient    = true
execution sizing bounded      = true
no live order submitted       = true
recovery scenarios pass       = true
reconciliation complete       = true
audit record persisted        = true
```

## Fail-closed conditions

Any failure below blocks progression:

- signer unavailable or capital unverifiable;
- capital source mismatch;
- insufficient funded capital or venue inventory;
- stale quote or expired opportunity;
- modeled net profit less than or equal to zero after all costs and reserve;
- reconciliation failure;
- residual exposure that cannot be bounded or flattened;
- any attempted live order while `TRADING_MODE=DRY_RUN`.

## Release progression

```text
STOPPED
  -> CI GREEN
  -> PR REVIEW
  -> DRY_RUN
  -> DRY_RUN RECONCILIATION PASS
  -> EXPLICIT LIVE AUTHORIZATION
  -> FUNDED LIVE
```

Passing DRY_RUN does not automatically authorize funded LIVE execution. Funded LIVE requires explicit authorization after the release evidence is reviewed.
