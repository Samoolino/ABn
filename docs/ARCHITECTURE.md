# Architecture

## Runtime boundaries

The Next.js app is a control-plane UI. The worker is the execution-plane process and must run independently of Vercel. Supabase stores application metadata, authenticated users, RLS-protected operational records and audit events. Provider secrets and signing material belong in Vault/HSM/managed secret infrastructure.

## Core flow

`market adapters → normalized quotes → opportunity engine → profit assertion → risk gate → capital gate → execution plan → venue legs → reconciliation → capital release → audit`

Cross-network opportunities require pre-funded destination inventory unless an explicit bridge model proves the opportunity remains executable after bridge cost and latency.

## Adapter contracts

CEX and DEX adapters expose normalized interfaces. Venue-specific symbols, precision, fees, authentication, rate limits and order semantics remain inside each adapter. Token identity on-chain is `(chain_id, address)` rather than symbol.

## Safety state machine

`STOPPED → DRY_RUN → ARMED → LIVE` is explicit and operator-authorized. `LIVE → EMERGENCY_STOP` is available to the risk system. No API route can directly place an order.

## Capital model

A configured starting amount may be as small as the equivalent of $3. The engine still enforces reserve and allocation limits; it does not imply that $3 is sufficient to overcome real exchange minimums, fees, gas or withdrawal constraints. Such an opportunity must therefore be rejected when it cannot satisfy all gates.

## Persistence

Use correlation IDs for every opportunity/trade. Idempotency keys prevent duplicate execution. Reconciliation is authoritative over optimistic order state.
