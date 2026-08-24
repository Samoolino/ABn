# Database Architecture

ABn uses standalone PostgreSQL plus Redis. Supabase is not an integration or runtime dependency.

## Responsibilities

- PostgreSQL: authoritative durable state for users, venues, markets, quotes, opportunities, orders, fills, capital allocations, realized PnL, reconciliation, risk events, health and audit logs.
- Redis: transient quote/cache state, distributed locks, deduplication, queues, rate-limit coordination and worker heartbeats.
- Auth.js: application authentication/session layer for email/password, Google and Apple.
- Vault/HSM/KMS: secret and signing boundary.

Redis is never the source of truth for balances, orders, fills, PnL or reconciliation.

```text
CEX/DEX feeds -> Redis -> scanner/opportunity engine
                         |
                         v
                    PostgreSQL
                         |
                         v
              reconciliation/audit
```

## Migrations

Run `packages/database/migrations/*.sql` against `DATABASE_URL`. The migration is plain PostgreSQL and does not reference `auth.users`, Supabase RLS, or Supabase APIs.

## Authentication

Auth.js stores application users in PostgreSQL. Passwords are bcrypt hashes; OAuth identities are normalized into the users table. Provider credentials remain in the runtime secret manager.

## Capital

The capital engine can use funded signer-backed inventory when a configured signer reference is available. The application never stores a raw private key. The default production test budget is capped at $2.55 working capital plus a $0.45 reserve, with a $3 target-equity threshold. Actual usable capital is the lesser of configured limits and verified funded balance.
