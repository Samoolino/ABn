create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text,
  name text,
  image text,
  email_verified timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key references users(id) on delete cascade,
  display_name text,
  role text not null default 'operator',
  created_at timestamptz not null default now()
);

create table if not exists venues (
  id uuid primary key default gen_random_uuid(), code text unique not null,
  kind text not null check(kind in ('CEX','DEX')), enabled boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists venue_credentials (
  id uuid primary key default gen_random_uuid(), venue_id uuid not null references venues(id) on delete cascade,
  secret_ref text not null, withdrawal_enabled boolean not null default false,
  created_at timestamptz not null default now(), unique(venue_id, secret_ref)
);
create table if not exists networks (
  id uuid primary key default gen_random_uuid(), name text unique not null, chain_id bigint unique,
  rpc_ref text, native_token text, explorer text, enabled boolean not null default false
);
create table if not exists tokens (
  id uuid primary key default gen_random_uuid(), chain_id bigint, address text, symbol text not null,
  name text, decimals integer not null, coingecko_id text, is_stable boolean not null default false,
  is_wrapped boolean not null default false, unique(chain_id,address)
);
create table if not exists markets (
  id uuid primary key default gen_random_uuid(), venue text not null, symbol text not null,
  chain_id bigint, base_token text, quote_token text, enabled boolean not null default true,
  unique(venue,symbol,chain_id)
);
create table if not exists market_quotes (
  id uuid primary key default gen_random_uuid(), market_id uuid references markets(id),
  bid numeric, ask numeric, bid_vwap numeric, ask_vwap numeric, liquidity numeric,
  fee_bps numeric, gas_cost numeric, observed_at timestamptz not null default now()
);
create table if not exists opportunities (
  id uuid primary key default gen_random_uuid(), symbol text not null, buy_venue text not null,
  sell_venue text not null, buy_network text, sell_network text, quantity numeric not null,
  buy_price numeric, sell_price numeric, buy_vwap numeric, sell_vwap numeric,
  gross_profit numeric not null, trading_fees numeric not null, gas_cost numeric not null,
  slippage_cost numeric not null, bridge_cost numeric not null default 0, settlement_cost numeric not null default 0,
  safety_reserve numeric not null, net_profit numeric not null, net_profit_pct numeric not null,
  capital_required numeric not null, capital_source text not null, confidence numeric not null,
  status text not null, quote_timestamp timestamptz not null, expires_at timestamptz not null,
  correlation_id uuid, created_at timestamptz not null default now()
);
create table if not exists opportunity_events (
  id uuid primary key default gen_random_uuid(), opportunity_id uuid not null references opportunities(id),
  event text not null, details jsonb not null default '{}', created_at timestamptz not null default now()
);
create table if not exists orders (
  id uuid primary key default gen_random_uuid(), opportunity_id uuid references opportunities(id),
  venue text not null, symbol text not null, side text not null, external_id text, status text not null,
  requested_quantity numeric, filled_quantity numeric default 0, average_price numeric, fee numeric,
  correlation_id uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists order_legs (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references orders(id) on delete cascade,
  leg_index integer not null, requested_quantity numeric, filled_quantity numeric default 0,
  average_price numeric, fee numeric, status text not null, unique(order_id,leg_index)
);
create table if not exists dex_transactions (
  id uuid primary key default gen_random_uuid(), opportunity_id uuid references opportunities(id),
  network text not null, tx_hash text unique, status text not null, gas_used numeric, gas_cost numeric,
  created_at timestamptz not null default now(), confirmed_at timestamptz
);
create table if not exists trade_reconciliations (
  id uuid primary key default gen_random_uuid(), opportunity_id uuid not null references opportunities(id),
  correlation_id uuid not null, expected_pnl numeric, realized_pnl numeric, variance numeric,
  status text not null, details jsonb not null default '{}', created_at timestamptz not null default now()
);
create table if not exists capital_accounts (
  id uuid primary key default gen_random_uuid(), name text unique not null, source text not null,
  asset text, network text, available numeric not null default 0, reserved numeric not null default 0,
  target_equity numeric, updated_at timestamptz not null default now()
);
create table if not exists capital_allocations (
  id uuid primary key default gen_random_uuid(), capital_account_id uuid not null references capital_accounts(id),
  opportunity_id uuid references opportunities(id), amount numeric not null, status text not null,
  created_at timestamptz not null default now(), released_at timestamptz
);
create table if not exists capital_events (
  id uuid primary key default gen_random_uuid(), capital_account_id uuid references capital_accounts(id),
  event text not null, amount numeric, asset text, metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
create table if not exists sweep_requests (
  id uuid primary key default gen_random_uuid(), source text not null, destination text not null,
  asset text not null, amount numeric not null, network text not null, reason text not null,
  status text not null default 'PENDING_APPROVAL', created_at timestamptz not null default now()
);
create table if not exists risk_events (
  id uuid primary key default gen_random_uuid(), level text not null, reason text not null,
  correlation_id uuid, created_at timestamptz not null default now()
);
create table if not exists system_health (
  id uuid primary key default gen_random_uuid(), component text unique not null, status text not null,
  heartbeat_at timestamptz not null default now(), details jsonb not null default '{}'
);
create table if not exists telegram_operators (
  id uuid primary key default gen_random_uuid(), telegram_user_id text unique not null,
  enabled boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(), actor_id uuid references users(id), action text not null,
  correlation_id uuid, metadata jsonb not null default '{}', created_at timestamptz not null default now()
);

create index if not exists opportunities_exec_idx on opportunities(status,net_profit desc,expires_at);
create index if not exists orders_corr_idx on orders(correlation_id);
create index if not exists market_quotes_time_idx on market_quotes(observed_at desc);
create index if not exists audit_logs_time_idx on audit_logs(created_at desc);
