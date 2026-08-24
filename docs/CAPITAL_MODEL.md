# Capital Model — Funded Wallet + Opportunity-Driven Sizing

## Production rule

Capital is supplied by a pre-funded wallet/account whose signing authority is referenced by `TRADING_SIGNER_REF` and resolved through the configured secure signer. The application repository must never contain the raw private key.

The worker does **not** start trading because a configured amount such as `$3`, `$100`, or `$1,000` exists.

Instead:

```text
FUNDED CAPITAL DISCOVERY
        ↓
VERIFY AVAILABLE BALANCE
        ↓
DISCOVER EXECUTABLE OPPORTUNITY
        ↓
CALCULATE REQUIRED NOTIONAL
        ↓
CHECK CAPITAL + RESERVE + RISK + LIQUIDITY
        ↓
SIZE TRADE DYNAMICALLY
        ↓
PROFIT ASSERTION
        ↓
EXECUTE ONLY IF NET PROFIT PASSES ALL GATES
```

## Dynamic opportunity sizing

For each opportunity, the execution planner determines the maximum executable size from the intersection of:

- verified available funded capital
- venue balances/inventory
- order-book or DEX liquidity
- minimum/maximum venue order sizes
- token precision
- gas affordability
- expected slippage
- trading fees
- settlement/bridge costs
- configured safety reserve
- maximum allocation percentage
- position and daily-loss limits
- maximum open trades

Therefore a profitable opportunity may be executed at `$0.50`, `$3`, `$25`, `$500`, or another amount **if and only if** the actual venue/network constraints and risk controls support it.

There is no hard-coded `$3` execution requirement.

## $3 reference

A small amount may be used as a controlled live-test budget, but it is not the production opportunity trigger and must never be interpreted as guaranteed available capital.

## Profit gate

The required condition is:

```text
modeled gross proceeds
- purchase cost
- buy fee
- sell fee
- gas
- slippage
- bridge cost
- settlement cost
- safety reserve
> 0
```

and all other risk, balance, freshness, liquidity and execution gates must pass.

The system must use the **maximum executable size that remains profitable and within risk limits**, not simply the largest available balance and not a fixed configured trade amount.

## Private key handling

The funded wallet private key is a signing secret. It must be injected through a secure signer boundary such as Vault, HSM, KMS, hardware wallet or protected keystore. `TRADING_SIGNER_REF` identifies the signer; it is not the private key itself.

Never put a raw private key in:

- Git
- `.env.example`
- PostgreSQL rows
- Redis
- browser code
- dashboard payloads
- Telegram messages
- application logs

## Safety

Funded capital does not imply that a trade is profitable. The system must continue to enforce:

> DO NOT TRADE UNLESS MODELED NET PROFIT EXCEEDS ALL COSTS AND SAFETY RESERVE.

If no opportunity meets the complete gate, the correct action is `SKIP`, regardless of how much capital is available.
