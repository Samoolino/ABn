---
name: abn-production-audit
description: Audit ABn's production readiness, execution safety, capital gates, CEX recovery, reconciliation, CI, and Vercel state. Never enable funded LIVE trading from this skill.
version: 1.0.0
metadata:
  hermes:
    tags: [abn, arbitrage, production, audit, execution, reconciliation, safety]
    category: engineering
---

# ABn Production Audit

## When to use

Use this skill when working inside the `Samoolino/ABn` repository and the task concerns production readiness, execution safety, CEX/DEX arbitrage, funded-capital controls, recovery, reconciliation, CI, or deployment state.

## Safety boundary

- Treat `STOPPED`, `DRY_RUN`, `ARMED`, `LIVE`, and `EMERGENCY_STOP` as explicit state-machine states.
- Never expose, print, commit, or request a raw private key, seed phrase, exchange secret, or Telegram token.
- `TRADING_SIGNER_REF` is a protected signer reference, not a private key.
- Never activate funded LIVE trading merely because capital exists.
- Never infer profitability from gross spread alone.
- A trade requires positive modeled net profit after fees, gas, slippage, bridge/settlement costs and safety reserve, plus freshness, liquidity, risk, capital and reconciliation gates.
- If any hard safety condition is unknown or fails, remain fail-closed.

## Audit procedure

1. Inspect `README.md`, `docs/ARCHITECTURE.md`, `docs/CAPITAL_MODEL.md`, `docs/SECURITY.md`, `.github/workflows/ci.yml`, and the execution/capital/risk packages.
2. Identify the exact `main` HEAD and any open execution PRs.
3. Inspect the latest CI run associated with the relevant commit; do not infer CI success from Vercel success.
4. Inspect Vercel deployment state separately.
5. Verify capital-source consistency from opportunity creation through execution and reconciliation.
6. Verify partial-fill behavior: cancel residual orders, re-read actual fills, hedge only residual exposure, reconcile, then classify the final state.
7. Verify deterministic tests cover both-fill, one-sided-fill, both-partial, zero-fill, hedge failure, reconciliation failure and timeout cases.
8. Report blockers explicitly and do not mark funded LIVE ready when behavioral validation is incomplete.

## Dynamic capital rule

Execution sizing is opportunity-driven. Do not use a fixed trade amount as the trigger. Determine executable size from the intersection of verified funded capital, venue balances, order-book liquidity, order limits/precision, costs, safety reserve and risk limits.

## Required terminal states

- `COMPLETED`: intended exposure matched and reconciliation succeeded.
- `HEDGE_OR_EXIT`: residual exposure existed, controlled hedge/exit succeeded, and reconciliation succeeded.
- `FAILED`: safety, hedge, reconciliation or execution conditions failed.
- `TIMEOUT`: execution deadline elapsed without a safely completed outcome.

## Output

Produce a concise audit containing:

- source HEAD and PR HEAD;
- CI status and failing stage, if any;
- Vercel status;
- implementation status by subsystem;
- execution/recovery test coverage;
- capital-source consistency;
- explicit blockers;
- next safe implementation gate.
