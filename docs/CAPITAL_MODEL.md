# Capital Model

## Principle

The platform does **not** require a fixed starting-capital amount. `Capital` means any legitimately accessible liquidity that can fund the complete opportunity lifecycle and return according to the modeled execution plan.

Examples include:

- pre-funded CEX balances
- pre-funded DEX wallet inventory
- flash liquidity where the transaction atomically repays it
- approved borrowing/credit facilities
- other explicitly configured liquidity sources

Accessibility alone is insufficient. The capital source must be available for the execution window, compatible with the venue/network, and its repayment or return must be modeled before an opportunity becomes executable.

## Capital gate

For each candidate:

`required notional + all execution costs + safety reserve < modeled return/proceeds`

and:

`expected net profit >= MIN_PROFIT`

The engine also checks liquidity, balance/credit availability, venue health, quote freshness, gas, slippage, limits and reconciliation requirements.

## No fixed $3 requirement

A small amount such as approximately $3 equivalent may be used for a controlled live test, but it is **not** a protocol definition of capital. The scanner should discover opportunities based on accessible liquidity and trade-size constraints.

## Capital sources

Each source has:

- source type
- asset
- network
- available notional
- required notional
- access conditions
- expected duration
- repayment/return condition
- fees
- safety reserve
- expected net profit

The worker must never infer access merely from a displayed balance or price. It must verify the source before execution.

## Risk statement

Accessible capital does not make an arbitrage trade risk-free. Execution, liquidity, counterparty, smart-contract, bridge, latency and reconciliation risks remain. The platform therefore retains the hard policy: **DO NOT TRADE UNLESS MODELED NET PROFIT EXCEEDS ALL COSTS AND SAFETY RESERVE.**
