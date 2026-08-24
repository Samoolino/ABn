# Controlled live test

Live mode is not enabled by repository creation. Before any live activation:

1. Start PostgreSQL and Redis.
2. Apply `packages/database/migrations/001_core.sql` to `DATABASE_URL`.
3. Configure CEX/DEx credentials and RPC endpoints through the runtime secret manager.
4. Configure `TRADING_SIGNER_REF` to a protected Vault/HSM/KMS/keystore reference. Never paste a raw private key into Git, the dashboard or Telegram.
5. Verify signer address and funded balance independently. The worker must report the verified amount; configured limits do not manufacture capital.
6. Run the complete scanner in `DRY_RUN`.
7. Confirm order-book/VWAP, fee, gas, slippage and reserve calculations.
8. Start with one highly liquid market and one network.
9. Use the smallest venue-supported trade size. A $3-equivalent account is a target configuration, not a promise that venues permit that size after fees/gas/minimums.
10. Verify both legs and reconciliation before enabling capital rotation.
11. Test emergency stop and recovery.
12. Only then authorize `ARMED → LIVE`.

## Local infrastructure

```bash
export POSTGRES_PASSWORD='change-me'
docker compose up -d postgres redis
export DATABASE_URL='postgresql://abn:change-me@localhost:5432/abn'
psql "$DATABASE_URL" -f packages/database/migrations/001_core.sql
pnpm install
pnpm typecheck && pnpm test && pnpm build
```

## Dry run

```bash
TRADING_MODE=DRY_RUN pnpm --filter @abn/worker dev
```

## Controlled live gate

```bash
TRADING_MODE=LIVE pnpm --filter @abn/worker dev
```

If `TRADING_SIGNER_REF` is missing or not a protected reference, the worker automatically downgrades a requested `LIVE` mode to `DRY_RUN` and reports `SIGNER_NOT_CONFIGURED`. Missing exchange/RPC credentials must be reported as `NOT_CONFIGURED`, never simulated as connected.

The repository cannot claim a live trade, profit, authentication success or provider connectivity until those external credentials and runtime services are actually configured and verified.