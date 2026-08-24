# Database Architecture

## PostgreSQL is optional as a product choice, but a durable relational database is strongly recommended

ABn can completely eliminate Supabase. Supabase is a managed platform, not a database requirement.

Recommended standalone production stack:

- PostgreSQL: authoritative persistent state, accounting, trades, reconciliations, audit logs, users/configuration.
- Redis: ephemeral acceleration layer for quote caches, locks, deduplication, queues, rate limits and worker coordination.
- Application authentication: an independent OIDC/OAuth provider or self-hosted auth service when Supabase Auth is removed.
- Secret manager: Vault/HSM/KMS for credentials and signing material.

Redis must never be the source of truth for balances, orders, fills, PnL or reconciliation.

## Can PostgreSQL work alongside Redis?

Yes. This is the preferred architecture for a high-throughput worker:

```text
CEX/DEX feeds -> Redis -> scanner/opportunity engine
                         |
                         v
                    PostgreSQL
                         |
                         v
              reconciliation/audit
```

PostgreSQL stores durable facts. Redis stores transient state and coordination data.

## Can PostgreSQL completely replace Supabase?

Yes. Supabase can be removed entirely if ABn supplies equivalents for:

- PostgreSQL connectivity and migrations
- authentication/session management
- Google OAuth
- Apple OAuth
- email/password authentication
- authorization/RLS policies
- secure server APIs
- operational backups/monitoring

For the initial release, retaining Supabase Auth while using PostgreSQL as the durable model is simpler. A future `AUTH_PROVIDER=standalone` implementation can remove Supabase without changing the trading core.

## Capital

Capital is opportunity-accessible liquidity, not a mandatory fixed starting amount. Each opportunity must independently prove accessible liquidity, execution cost, repayment/settlement and positive net profit.
