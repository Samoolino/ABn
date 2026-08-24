# Security

- Default runtime is `STOPPED`/`DRY_RUN`.
- No private key, seed phrase, exchange secret, Supabase service role key or Telegram token belongs in Git, frontend bundles, database plaintext or Telegram messages.
- CEX withdrawal permission must remain disabled unless a separately reviewed workflow requires it.
- Production signing uses `TRADING_SIGNER_REF` resolved through Vault/HSM/hardware-backed infrastructure.
- Supabase RLS protects user-scoped data; service-role access is worker/server-only.
- Operator commands are allow-listed by Telegram user ID and audited.
- Every execution has a correlation ID and idempotency key.
- Emergency-stop is fail-closed on stale data, abnormal loss, venue outage, balance mismatch or reconciliation failure.

This platform is not risk-free and makes no guarantee of profit.
