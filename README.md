# Free Cloud Arbitrage — Production Multi-Venue Arbitrage Platform

Production-oriented multi-venue crypto arbitrage platform. **Default state is STOPPED/DRY_RUN.** The system must never trade unless modeled net profit exceeds all costs and the configured safety reserve.

## Current production architecture

- `apps/web`: Next.js dashboard and Auth.js authentication/API surface
- `apps/worker`: persistent scanner/risk/execution/reconciliation worker
- `packages/*`: shared types, risk, opportunity, capital, adapters, execution and signer contracts
- PostgreSQL: authoritative application database and accounting store
- Redis: transient market/coordination layer, locks, deduplication and queues
- Vault/HSM/KMS: signer and secret boundary
- Vercel: frontend only; never the persistent trading loop

**Supabase has been removed from the target production integration.** Authentication is now Auth.js with PostgreSQL.

## Supported venues

CEX: MEXC, Gate, Binance, Kraken, OKX, Bybit, Coinbase, KuCoin, Bitfinex, LBank.

DEX: Uniswap, PancakeSwap, SushiSwap, with adapter interfaces for additional routers.

Networks: Ethereum, Arbitrum, Base, Polygon, BSC.

## Funded-capital execution

The capital engine can use verified funded inventory behind a signer reference. A raw private key must never be committed, logged, sent through Telegram, or stored in PostgreSQL. Use a `vault://`, `hsm://`, KMS or protected keystore reference through `TRADING_SIGNER_REF`.

For the controlled $3-equivalent test profile, the default example limits are:

- target equity: `$3.00`
- maximum working capital: `$2.55`
- minimum reserve: `$0.45`
- maximum single trade: `$2.55`
- maximum open trades: `1`

The actual capital available to execution is always the lesser of configured limits and the signer/venue balance verified at runtime. If verified funded capital is unavailable, the worker reports `NOT_CONFIGURED`/`INSUFFICIENT_FUNDED_CAPITAL` and does not trade.

## Safety

This project does **not** claim arbitrage is risk-free. `PROFIT_FLOOR_MODE` enforces:

`gross proceeds - purchase cost - fees - gas - slippage - bridge - settlement - fixed costs - safety reserve >= MIN_PROFIT`

Live execution is opt-in and independently gated by runtime state, credentials, verified funded capital, balances, quote freshness, liquidity, risk limits and reconciliation.

## Development

Requirements: Node.js 22+, pnpm 9+, PostgreSQL 17+, Redis 8+, and optionally Docker.

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Start infrastructure locally with:

```bash
export POSTGRES_PASSWORD='change-me'
docker compose up -d postgres redis
```

Apply `packages/database/migrations/001_core.sql` to `DATABASE_URL` before starting authenticated application flows.

Copy `.env.example` to a local environment file. Never commit secrets.

## Runtime modes

`STOPPED` → `DRY_RUN` → authorized `ARMED` → authorized `LIVE`.

`LIVE` can transition to `EMERGENCY_STOP` on hard safety failures. The worker is designed for Docker/systemd deployment and is not dependent on Vercel uptime.

See `docs/ARCHITECTURE.md`, `docs/DATABASE_ARCHITECTURE.md`, `docs/AUTH.md`, `docs/SECURITY.md`, `docs/LIVE_TEST.md` and `docs/CAPITAL_MODEL.md` before configuring live providers.
