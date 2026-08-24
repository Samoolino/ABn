# Security

- Default runtime is `STOPPED`/`DRY_RUN`.
- No private key, seed phrase, exchange secret or Telegram token belongs in Git, frontend bundles, PostgreSQL plaintext or Telegram messages.
- CEX withdrawal permission must remain disabled unless a separately reviewed workflow requires it.
- Production signing uses `TRADING_SIGNER_REF` resolved through Vault/HSM/KMS/protected-keystore infrastructure.
- PostgreSQL is the durable source of truth; Redis is transient coordination only.
- Auth.js sessions and OAuth credentials are server-side; OAuth secrets are never sent to browser code.
- Operator commands are allow-listed by Telegram user ID and audited.
- Every execution has a correlation ID and idempotency key.
- Emergency-stop is fail-closed on stale data, abnormal loss, venue outage, balance mismatch or reconciliation failure.
- Live mode is blocked when a protected signer is not configured or funded capital cannot be independently verified.

This platform is not risk-free and makes no guarantee of profit.