create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  kind text not null check (kind in ('CEX','DEX')),
  enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.networks (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  chain_id bigint not null unique,
  rpc_ref text,
  created_at timestamptz not null default now()
);

create table if not exists public.tokens (
  id uuid primary key default gen_random_uuid(),
  network_id uuid references public.networks(id),
  symbol text not null,
  name text,
  contract_address text,
  decimals integer not null check (decimals between 0 and 36),
  coingecko_id text,
  is_stable boolean not null default false,
  is_wrapped boolean not null default false,
  unique(network_id, contract_address),
  created_at timestamptz not null default now()
);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  correlation_id uuid not null default gen_random_uuid(),
  symbol text not null,
  buy_venue text not null,
  sell_venue text not null,
  buy_network text,
  sell_network text,
  quantity numeric not null,
  buy_vwap numeric not null,
  sell_vwap numeric not null,
  gross_profit numeric not null default 0,
  trading_fees numeric not null default 0,
  gas_cost numeric not null default 0,
  slippage_cost numeric not null default 0,
  bridge_cost numeric not null default 0,
  settlement_cost numeric not null default 0,
  safety_reserve numeric not null default 0,
  net_profit numeric not null default 0,
  net_profit_pct numeric not null default 0,
  confidence numeric,
  status text not null default 'DISCOVERED',
  quote_timestamp timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.risk_events (
  id uuid primary key default gen_random_uuid(),
  correlation_id uuid,
  severity text not null,
  event_type text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id),
  action text not null,
  correlation_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.venues enable row level security;
alter table public.networks enable row level security;
alter table public.tokens enable row level security;
alter table public.opportunities enable row level security;
alter table public.risk_events enable row level security;
alter table public.audit_logs enable row level security;

create policy "users read own profile" on public.profiles for select using (auth.uid() = id);
create policy "authenticated users read venues" on public.venues for select to authenticated using (true);
create policy "authenticated users read networks" on public.networks for select to authenticated using (true);
create policy "authenticated users read tokens" on public.tokens for select to authenticated using (true);
create policy "authenticated users read opportunities" on public.opportunities for select to authenticated using (true);
create policy "authenticated users read risk events" on public.risk_events for select to authenticated using (true);
create policy "authenticated users read audit logs" on public.audit_logs for select to authenticated using (true);

insert into public.networks(name, chain_id) values
 ('Ethereum', 1), ('Arbitrum', 42161), ('Base', 8453), ('Polygon', 137), ('BSC', 56)
on conflict (chain_id) do nothing;

insert into public.venues(code, kind) values
 ('mexc','CEX'),('gate','CEX'),('binance','CEX'),('kraken','CEX'),('okx','CEX'),('bybit','CEX'),('coinbase','CEX'),('kucoin','CEX'),('bitfinex','CEX'),('lbank','CEX'),
 ('uniswap','DEX'),('pancakeswap','DEX'),('sushiswap','DEX')
on conflict (code) do nothing;
