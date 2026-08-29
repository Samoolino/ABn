import crypto from 'node:crypto';
import { createDatabasePool } from '@abn/database';
import { createRedisClient } from '@abn/redis';
import { fundedCapitalPolicy } from '@abn/capital-engine';
import { signerRefConfigured, loadProtectedSignerImplementation } from '@abn/signer';
import type { FundedSigner } from '@abn/signer';
import { createCEXAdapterFromEnv, createCEXPairExecutionConnector, executePair, validateCoordinatedOpportunity } from '@abn/execution';
import type { CEXAdapter } from '@abn/venue-adapters';
import type { Opportunity } from '@abn/types';

const requestedMode = process.env.TRADING_MODE || process.env.RUNTIME_MODE || 'STOPPED';
const interval = Number(process.env.HEARTBEAT_MS || 5000);
const db = createDatabasePool();
const redis = createRedisClient();
const policy = fundedCapitalPolicy();
const safetyReserve = Number(process.env.SAFETY_RESERVE_USD || policy.minReserveUsd);
const executionEnabled = process.env.EXECUTION_ENABLED === 'true';
const maxUnhedgedMs = Number(process.env.MAX_UNHEDGED_TIME_MS || '1500');
const requiredCapitalSource = process.env.CAPITAL_SOURCE || 'FUNDED_INVENTORY';
const signerNetwork = process.env.SIGNER_BALANCE_NETWORK || 'ethereum';
const capitalAsset = process.env.CAPITAL_ASSET || 'USDC';
const capitalAssetUsdRate = Number(process.env.CAPITAL_ASSET_USD_RATE || '1');

let mode = requestedMode;
let controlStatus = 'STOPPED';
let executing = false;
let fundedSigner: FundedSigner | null = null;
let signerVerification: { address: string; balance: number; usdEquivalent: number } | null = null;

function signerReady() { return signerRefConfigured(); }
function isCexVenue(venue: string) {
  return ['mexc','gate','binance','kraken','okx','bybit','coinbase','kucoin','bitfinex','lbank'].includes(venue.toLowerCase());
}

function splitSymbol(symbol: string): { base: string; quote: string } {
  const normalized = symbol.trim().toUpperCase().replace('-', '/');
  const parts = normalized.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error(`SYMBOL_UNSUPPORTED_FOR_BALANCE_GATE:${symbol}`);
  return { base: parts[0], quote: parts[1] };
}

function balanceOf(balances: Record<string, number>, asset: string): number {
  const target = asset.toUpperCase();
  const key = Object.keys(balances).find(k => k.toUpperCase() === target);
  const value = key ? Number(balances[key]) : 0;
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

async function verifyCexInventory(
  buyAdapter: CEXAdapter,
  sellAdapter: CEXAdapter,
  opportunity: Opportunity,
): Promise<{ buyQuoteBalance: number; sellBaseBalance: number; source: string }> {
  const { base, quote } = splitSymbol(opportunity.symbol);
  const [buyBalances, sellBalances] = await Promise.all([buyAdapter.balances(), sellAdapter.balances()]);
  const buyQuoteBalance = balanceOf(buyBalances, quote);
  const sellBaseBalance = balanceOf(sellBalances, base);
  const requiredQuote = Number(opportunity.capitalRequired);
  const requiredBase = Number(opportunity.quantity);

  if (!Number.isFinite(requiredQuote) || requiredQuote <= 0) throw new Error('CEX_BUY_CAPITAL_REQUIRED_INVALID');
  if (!Number.isFinite(requiredBase) || requiredBase <= 0) throw new Error('CEX_SELL_QUANTITY_INVALID');
  if (buyQuoteBalance < requiredQuote + safetyReserve) {
    throw new Error(`INSUFFICIENT_CEX_BUY_QUOTE:${buyAdapter.name}:${quote}:${buyQuoteBalance}:required=${requiredQuote}:reserve=${safetyReserve}`);
  }
  if (sellBaseBalance < requiredBase) {
    throw new Error(`INSUFFICIENT_CEX_SELL_BASE:${sellAdapter.name}:${base}:${sellBaseBalance}:required=${requiredBase}`);
  }

  return { buyQuoteBalance, sellBaseBalance, source: 'CEX_ACCOUNT_BALANCES' };
}

async function resolveAndVerifySigner(requiredUsd: number) {
  if (!signerReady()) throw new Error('SIGNER_NOT_CONFIGURED');
  if (!Number.isFinite(capitalAssetUsdRate) || capitalAssetUsdRate <= 0) throw new Error('CAPITAL_ASSET_USD_RATE_INVALID');
  const implementation = await loadProtectedSignerImplementation();
  const ref = process.env.TRADING_SIGNER_REF!;
  const kind = ref.split('://', 1)[0];
  fundedSigner = await implementation(ref, kind.toUpperCase() as FundedSigner['kind']);
  const address = await fundedSigner.address(signerNetwork);
  if (!address) throw new Error('SIGNER_ADDRESS_UNAVAILABLE');
  const balance = await fundedSigner.balance(signerNetwork, capitalAsset);
  const usdEquivalent = balance * capitalAssetUsdRate;
  if (!Number.isFinite(balance) || balance < 0 || !Number.isFinite(usdEquivalent)) throw new Error('SIGNER_BALANCE_UNAVAILABLE');
  if (usdEquivalent < requiredUsd + safetyReserve) {
    throw new Error(`INSUFFICIENT_FUNDED_WALLET:usd=${usdEquivalent}:required=${requiredUsd}:reserve=${safetyReserve}`);
  }
  signerVerification = { address, balance, usdEquivalent };
  return signerVerification;
}

function mapOpportunity(row: Record<string, unknown>): Opportunity {
  return {
    id: String(row.id),
    symbol: String(row.symbol),
    buyVenue: String(row.buy_venue),
    sellVenue: String(row.sell_venue),
    buyNetwork: row.buy_network ? String(row.buy_network) : undefined,
    sellNetwork: row.sell_network ? String(row.sell_network) : undefined,
    quantity: Number(row.quantity),
    grossProfit: Number(row.gross_profit || 0),
    tradingFees: Number(row.trading_fees || 0),
    gasCost: Number(row.gas_cost || 0),
    slippageCost: Number(row.slippage_cost || 0),
    bridgeCost: Number(row.bridge_cost || 0),
    settlementCost: Number(row.settlement_cost || 0),
    safetyReserve: Number(row.safety_reserve || safetyReserve),
    expectedNetProfit: Number(row.expected_net_profit ?? row.net_profit ?? 0),
    netProfitPct: Number(row.net_profit_pct || 0),
    capitalRequired: Number(row.capital_required),
    capitalSource: (String(row.capital_source || requiredCapitalSource) as Opportunity['capitalSource']),
    status: String(row.status) as Opportunity['status'],
    quoteTimestamp: Number(row.quote_timestamp || 0),
    expiresAt: new Date(String(row.expires_at)).getTime(),
    confidence: Number(row.confidence || 0),
  };
}

async function refreshControlAndOpportunity() {
  if (!db || executing) return;

  const control = await db.query(`select status, details from system_health where component='trading_control' limit 1`);
  const requestedControl = control.rows[0]?.status || 'STOPPED';
  controlStatus = requestedControl;

  if (requestedMode !== 'LIVE' || requestedControl !== 'ARMED') {
    mode = requestedMode === 'DRY_RUN' ? 'DRY_RUN' : 'STOPPED';
    return;
  }

  if (!signerReady()) {
    mode = 'DRY_RUN';
    console.error(JSON.stringify({ event: 'live_blocked', reason: 'SIGNER_NOT_CONFIGURED', status: 'NOT_CONFIGURED' }));
    return;
  }

  const candidate = await db.query(
    `select id, symbol, buy_venue, sell_venue, quantity, gross_profit, trading_fees,
            gas_cost, slippage_cost, bridge_cost, settlement_cost, safety_reserve,
            net_profit_pct, net_profit, expected_net_profit, capital_required,
            capital_source, quote_timestamp, expires_at, confidence, status,
            buy_network, sell_network
       from opportunities
      where status in ('EXECUTABLE', 'EXECUTABLE_NOW')
        and expires_at > now()
        and expected_net_profit >= $1
      order by expected_net_profit / greatest(capital_required, 0.00000001) desc,
               expected_net_profit desc
      limit 1`,
    [safetyReserve],
  );

  const row = candidate.rows[0] as Record<string, unknown> | undefined;
  if (!row) {
    mode = 'ARMED';
    return;
  }

  const opportunity = mapOpportunity(row);

  if (opportunity.capitalSource !== requiredCapitalSource) {
    mode = 'ARMED';
    await db.query(`insert into opportunity_events(opportunity_id,event,details) values($1,'CAPITAL_SOURCE_REJECTED',$2::jsonb)`, [
      opportunity.id,
      JSON.stringify({required: requiredCapitalSource, actual: opportunity.capitalSource}),
    ]);
    return;
  }

  if (!Number.isFinite(opportunity.capitalRequired) || opportunity.capitalRequired <= 0 || opportunity.capitalRequired > policy.maxWorkingUsd) {
    mode = 'ARMED';
    await db.query(`insert into opportunity_events(opportunity_id,event,details) values($1,'CAPITAL_POLICY_REJECTED',$2::jsonb)`, [
      opportunity.id,
      JSON.stringify({required: opportunity.capitalRequired, maxWorkingUsd: policy.maxWorkingUsd}),
    ]);
    return;
  }

  await db.query(`insert into opportunity_events(opportunity_id,event,details) values($1,'EXECUTION_GATE_READY',$2::jsonb)`, [
    opportunity.id,
    JSON.stringify({symbol:opportunity.symbol, netProfit:opportunity.expectedNetProfit, capitalRequired:opportunity.capitalRequired, reserve:safetyReserve}),
  ]);

  if (!executionEnabled) {
    mode = 'ARMED_EXECUTION_READY';
    return;
  }

  try {
    signerVerification = await resolveAndVerifySigner(opportunity.capitalRequired);
  } catch (error) {
    mode = 'ARMED';
    await db.query(`insert into opportunity_events(opportunity_id,event,details) values($1,'FUNDED_SIGNER_REJECTED',$2::jsonb)`, [
      opportunity.id,
      JSON.stringify({error:String(error), network:signerNetwork, asset:capitalAsset}),
    ]);
    return;
  }

  if (!isCexVenue(opportunity.buyVenue) || !isCexVenue(opportunity.sellVenue)) {
    const correlationId = crypto.randomUUID();
    const validation = validateCoordinatedOpportunity(opportunity, { correlationId, maxUnhedgedMs, minNetProfit: safetyReserve, isCexVenue });
    mode = 'ARMED_EXECUTION_READY';
    await db.query(`insert into opportunity_events(opportunity_id,event,details) values($1,$2,$3::jsonb)`, [opportunity.id, validation.accepted ? 'COORDINATED_PLAN_VALIDATED' : 'COORDINATED_PLAN_REJECTED', JSON.stringify({correlationId,reason:validation.reason,plan:validation.plan,executionReleased:false})]);
    console.log(JSON.stringify({event:validation.accepted?'coordinated_plan_ready':'coordinated_plan_rejected',correlationId,opportunityId:opportunity.id,reason:validation.reason,executionReleased:false}));
    return;
  }

  let buyAdapter: CEXAdapter;
  let sellAdapter: CEXAdapter;
  try {
    buyAdapter = createCEXAdapterFromEnv(opportunity.buyVenue);
    sellAdapter = createCEXAdapterFromEnv(opportunity.sellVenue);
    await Promise.all([buyAdapter.connect(), sellAdapter.connect()]);
    const inventory = await verifyCexInventory(buyAdapter, sellAdapter, opportunity);
    await db.query(`insert into opportunity_events(opportunity_id,event,details) values($1,'AUTHORITATIVE_CAPITAL_VERIFIED',$2::jsonb)`, [
      opportunity.id,
      JSON.stringify({source:inventory.source,buyVenue:buyAdapter.name,sellVenue:sellAdapter.name,buyQuoteBalance:inventory.buyQuoteBalance,sellBaseBalance:inventory.sellBaseBalance,requiredCapital:opportunity.capitalRequired,requiredQuantity:opportunity.quantity}),
    ]);
  } catch (error) {
    mode = 'ARMED';
    await db.query(`insert into opportunity_events(opportunity_id,event,details) values($1,'AUTHORITATIVE_CAPITAL_REJECTED',$2::jsonb)`, [
      opportunity.id,
      JSON.stringify({error:String(error),buyVenue:opportunity.buyVenue,sellVenue:opportunity.sellVenue}),
    ]);
    return;
  }

  executing = true;
  mode = 'EXECUTING';
  const correlationId = crypto.randomUUID();
  await db.query(`update opportunities set status='EXECUTING' where id=$1 and status in ('EXECUTABLE','EXECUTABLE_NOW')`, [opportunity.id]);
  await db.query(`insert into audit_logs(action,details) values($1,$2::jsonb)`, ['TRADE_EXECUTION_STARTED', JSON.stringify({correlationId,opportunityId:opportunity.id,buyVenue:opportunity.buyVenue,sellVenue:opportunity.sellVenue,capitalRequired:opportunity.capitalRequired,reserve:safetyReserve,signerAddress:signerVerification?.address,capitalSource:'CEX_ACCOUNT_BALANCES'})]);

  try {
    const connector = createCEXPairExecutionConnector(buyAdapter, sellAdapter);
    const result = await executePair(opportunity, {
      correlationId,
      opportunityId: opportunity.id,
      buy: {symbol:opportunity.symbol, amount:opportunity.quantity, type:'market'},
      sell: {symbol:opportunity.symbol, amount:opportunity.quantity, type:'market'},
      capital: {available:opportunity.capitalRequired, source:opportunity.capitalSource, commitmentMs:Math.max(1000,maxUnhedgedMs), repayable:false, repaymentAmount:0, collateralRequired:0},
    }, connector, maxUnhedgedMs);

    const finalStatus = result.status === 'COMPLETED' ? 'COMPLETED' : result.status === 'HEDGE_OR_EXIT' ? 'PARTIAL' : 'FAILED';
    await db.query(`update opportunities set status=$2 where id=$1`, [opportunity.id, finalStatus]);
    await db.query(`insert into audit_logs(action,details) values($1,$2::jsonb)`, ['TRADE_EXECUTION_RESULT', JSON.stringify({correlationId,opportunityId:opportunity.id,result})]);
    mode = finalStatus === 'COMPLETED' ? 'ARMED' : 'EMERGENCY_STOP';
  } catch (error) {
    mode = 'EMERGENCY_STOP';
    await db.query(`update opportunities set status='FAILED' where id=$1`, [opportunity.id]);
    await db.query(`insert into audit_logs(action,details) values($1,$2::jsonb)`, ['TRADE_EXECUTION_FAILED', JSON.stringify({correlationId,opportunityId:opportunity.id,error:String(error)})]);
    console.error(JSON.stringify({event:'execution_error',correlationId,opportunityId:opportunity.id,error:String(error)}));
  } finally {
    executing = false;
  }
}

if (requestedMode === 'LIVE' && !signerReady()) {
  mode = 'DRY_RUN';
  console.error(JSON.stringify({ event: 'live_blocked', reason: 'SIGNER_NOT_CONFIGURED', status: 'NOT_CONFIGURED' }));
}

console.log(JSON.stringify({event:'worker_start',mode,requestedMode,heartbeatMs:interval,persistence:db?'POSTGRES_CONFIGURED':'NOT_CONFIGURED',coordination:redis?'REDIS_CONFIGURED':'NOT_CONFIGURED',signer:signerReady()?'PROTECTED_REF_CONFIGURED':'NOT_CONFIGURED',capitalPolicy:policy,safetyReserveUsd:safetyReserve,executionEnabled,capitalSource:requiredCapitalSource,signerNetwork,capitalAsset}));

async function heartbeat() {
  const now = new Date().toISOString();
  try { await refreshControlAndOpportunity(); }
  catch (error) { mode='EMERGENCY_STOP'; console.error(JSON.stringify({event:'execution_gate_error',error:String(error)})); }
  if (db) await db.query(`insert into system_health(component,status,heartbeat_at,details) values($1,$2,now(),$3::jsonb) on conflict(component) do update set status=excluded.status,heartbeat_at=excluded.heartbeat_at,details=excluded.details`, ['worker',mode,JSON.stringify({mode,requestedMode,controlStatus,signer:signerVerification?'VERIFIED':signerReady()?'CONFIGURED':'NOT_CONFIGURED',executionEnabled,capitalSource:requiredCapitalSource,signerNetwork,capitalAsset})]);
  if (redis) await redis.set('abn:worker:heartbeat',now,'PX',Math.max(interval*3,15000));
  console.log(JSON.stringify({event:'worker_heartbeat',mode,controlStatus,timestamp:now}));
}

void heartbeat().catch(error=>console.error(JSON.stringify({event:'heartbeat_error',error:String(error)})));
setInterval(() => void heartbeat().catch(error=>console.error(JSON.stringify({event:'heartbeat_error',error:String(error)}))), interval);
