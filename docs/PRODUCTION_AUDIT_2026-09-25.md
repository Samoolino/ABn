# ABn Production & Execution Audit — 2026-09-25

## Scope

Audit of the current repository architecture, execution requirements, capital model, recovery/reconciliation controls, CI and deployment state. This document does not authorize funded LIVE execution.

## Current architecture

ABn separates a Next.js control-plane frontend from a persistent worker execution plane. PostgreSQL is the durable source of truth, Redis is transient coordination, and signing material is intended to remain behind Vault/HSM/KMS/protected-keystore infrastructure.

## Implemented controls

- Runtime state machine: `STOPPED → DRY_RUN → ARMED → LIVE`, with `EMERGENCY_STOP` for hard safety failures.
- Protected signer reference via `TRADING_SIGNER_REF`; raw private keys are excluded from repository, database, frontend, logs and messaging.
- Opportunity-driven capital sizing rather than a fixed `$3` execution trigger.
- Net-profit gate incorporating purchase cost, fees, gas, slippage, bridge/settlement costs and safety reserve.
- Funded-capital source type `FUNDED_INVENTORY` in execution gating.
- Correlation/idempotency concepts and reconciliation as authoritative over optimistic order state.
- CEX partial-fill recovery implementation on the feature branch: cancel remaining orders, re-read actual fills, hedge residual directional exposure, reconcile, and classify `COMPLETED`, `HEDGE_OR_EXIT`, `FAILED` or `TIMEOUT`.
- Deterministic recovery test suite exists on the feature branch.

## Current blockers

### 1. Latest recovery CI is failing in tests

The latest PR validation reached install, typecheck and build successfully but the `pnpm test` stage failed. The test failure must be resolved before merging the recovery branch.

### 2. Main CI does not currently execute tests

`.github/workflows/ci.yml` on `main` installs dependencies, runs typecheck and build, but does not run `pnpm test`. The feature branch adds the test stage. This means the stronger validation remains branch-specific until merged.

### 3. Hermes is an engineering/audit agent, not a trading authorization layer

Hermes must remain bounded to repository analysis, testing, operational diagnostics and controlled development workflows. It must not bypass ABn's execution gates or activate funded LIVE trading.

### 4. Funded CEX bridge remains a production execution dependency

The execution architecture expects verified `FUNDED_INVENTORY`, while the CEX funded-wallet bridge must be independently implemented and verified before genuine funded CEX execution is considered complete.

## Stage assessment

`SOURCE / ARCHITECTURE`: substantially implemented

`SAFETY / CAPITAL GATES`: substantially implemented

`CEX EXECUTION`: implemented but recovery/reconciliation is still under validation

`BEHAVIORAL TESTING`: incomplete while the latest recovery CI test stage is failing

`DRY_RUN`: next operational validation gate

`FUNDED LIVE`: not ready / fail-closed

## Required next sequence

1. Fix the failing recovery tests.
2. Re-run complete CI including tests.
3. Run controlled DRY_RUN scenarios for all recovery branches.
4. Verify reconciliation and accounting records against actual simulated fills.
5. Verify funded-capital source consistency end-to-end.
6. Review and merge the recovery change only after those gates pass.
7. Keep funded LIVE independently authorized and fail-closed until runtime production controls are verified.
