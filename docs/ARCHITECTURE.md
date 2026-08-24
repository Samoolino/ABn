# Architecture

## Runtime boundaries

The Next.js app is a control-plane UI. The worker is the execution-plane process and must run independently of Vercel. PostgreSQL stores application metadata, authenticated users, operational records, accounting and audit events. Redis provides transient market/cache state, locks, queues and worker coordination. Provider secrets and signing material belong in Vault/HSM/KMS/protected-keystore infrastructure.

## Core flow

`market adapters → normalized quotes → opportunity engine → profit assertion → risk gate → funded-capital gate → execution plan → venue legs → reconciliation → capital release → audit`

Cross-network opportunities require pre-funded destination inventory unless an explicit bridge model proves the opportunity remains executable after bridge cost and latency.

## Adapter contracts

CEX and DEX adapters expose normalized interfaces. Venue-specific symbols, precision, fees, authentication, rate limits and order semantics remain inside each adapter. Token identity on-chain is `(chain_id, address)` rather than symbol.

## Safety state machine

`STOPPED → DRY_RUN → ARMED → LIVE` is explicit and operator-authorized. `LIVE → EMERGENCY_STOP` is available to the risk system. No API route can directly place an order.

## Capital model

A configured starting budget may be as small as the equivalent of $3. The controlled profile keeps $0.45 reserved and caps working capital at $2.55. The engine still verifies actual funded balance before every execution; it does not imply that $3 is sufficient to overcome real exchange minimums, fees, gas or settlement constraints. Such an opportunity must therefore be rejected when it cannot satisfy every gate.

## Authentication

Auth.js provides email/password, Google and Apple authentication. PostgreSQL is the user store. There is no Supabase dependency in the target architecture.

## Persistence

Use correlation IDs for every opportunity/trade. Idempotency keys prevent duplicate execution. Reconciliation is authoritative over optimistic order state.