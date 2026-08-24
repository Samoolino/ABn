# Free Cloud Arbitrage — Production Multi-Venue Arbitrage Platform

Production-oriented multi-venue crypto arbitrage platform. **Default state is STOPPED/DRY_RUN.** The system must never trade unless modeled net profit exceeds all costs and the configured safety reserve.

## Architecture

- `apps/web`: Next.js dashboard and authenticated API surface
- `apps/worker`: persistent scanner/risk/execution/reconciliation worker
- `packages/*`: shared types, risk, opportunity, capital, adapters and signer contracts
- Supabase: authentication, PostgreSQL, RLS and audit data
- Vercel: frontend only; never the persistent trading loop
- Vault/HSM: signer and secret boundary

## Supported venues

CEX: MEXC, Gate, Binance, Kraken, OKX, Bybit, Coinbase, KuCoin, Bitfinex, LBank.

DEX: Uniswap, PancakeSwap, SushiSwap, with adapter interfaces for additional routers.

Networks: Ethereum, Arbitrum, Base, Polygon, BSC.

## Safety

This project does **not** claim arbitrage is risk-free. `PROFIT_FLOOR_MODE` enforces:

`gross proceeds - purchase cost - fees - gas - slippage - bridge - settlement - fixed costs - safety reserve >= MIN_PROFIT`

Live execution is opt-in and independently gated by runtime state, credentials, balances, freshness, liquidity, risk and reconciliation.

## Development

Requirements: Node.js 22+, pnpm 9+, PostgreSQL/Supabase, and optionally Docker.

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Copy `.env.example` to a local environment file. Never commit secrets.

## Runtime modes

`STOPPED` → `DRY_RUN` → authorized `ARMED` → authorized `LIVE`.

`LIVE` can transition to `EMERGENCY_STOP` on hard safety failures. The worker is designed for Docker/systemd deployment and is not dependent on Vercel uptime.

See `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/LIVE_TEST.md` and `docs/SUPABASE_AUTH.md` before configuring live providers.
