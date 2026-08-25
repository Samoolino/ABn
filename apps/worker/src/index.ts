import { createDatabasePool } from '@abn/database';
import { createRedisClient } from '@abn/redis';
import { fundedCapitalPolicy } from '@abn/capital-engine';
import { signerRefConfigured } from '@abn/signer';
import { createCEXAdapterFromEnv, createCEXPairExecutionConnector, executePair } from '@abn/execution';
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

let mode = requestedMode;
let controlStatus = 'STOPPED';
let executing = false;

function signerReady() { return signerRefConfigured(); }
function isCexVenue(venue: string) {
  return ['mexc','gate','binance','kraken','okx','bybit','coinbase','kucoin','bitfinex','lbank'].includes(venue.toLowerCase());
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

  if (!isCexVenue(opportunity.buyVenue) || !isCexVenue(opportunity.sellVenue)) {
    mode = 'ARMED_EXECUTION_READY';
    console.log(JSON.stringify({event:'live_blocked', reason:'DEX_EXECUTOR_NOT_CONFIGURED', opportunityId:opportunity.id}));
    return;
  }

  const capital = await db.query(`select coalesce(sum(available),0) as available from capital_accounts where status='ACTIVE' and source=$1`, [requiredCapitalSource]);
  const available = Number(capital.rows[0]?.available || 0);
  const requiredWithReserve = opportunity.capitalRequired + safetyReserve;
  if (!Number.isFinite(available) || available < requiredWithReserve) {
    mode = 'ARMED';
    await db.query(`insert into opportunity_events(opportunity_id,event,details) values($1,'CAPITAL_GATE_REJECTED',$2::jsonb)`, [opportunity.id, JSON.stringify({available, required:opportunity.capitalRequired, reserve:safetyReserve, requiredWithReserve})]);
    return;
  }

  executing = true;
  mode = 'EXECUTING';
  const correlationId = crypto.randomUUID();
  await db.query(`update opportunities set status='EXECUTING' where id=$1 and status in ('EXECUTABLE','EXECUTABLE_NOW')`, [opportunity.id]);
  await db.query(`insert into audit_logs(action,details) values($1,$2::jsonb)`, ['TRADE_EXECUTION_STARTED', JSON.stringify({correlationId,opportunityId:opportunity.id,buyVenue:opportunity.buyVenue,sellVenue:opportunity.sellVenue,capitalRequired:opportunity.capitalRequired,reserve:safetyReserve})]);

  try {
    const buyAdapter = createCEXAdapterFromEnv(opportunity.buyVenue);
    const sellAdapter = createCEXAdapterFromEnv(opportunity.sellVenue);
    await Promise.all([buyAdapter.connect(), sellAdapter.connect()]);
    const connector = createCEXPairExecutionConnector(buyAdapter, sellAdapter);
    const result = await executePair(opportunity, {
      correlationId,
      opportunityId: opportunity.id,
      buy: {symbol:opportunity.symbol, amount:opportunity.quantity, type:'market'},
      sell: {symbol:opportunity.symbol, amount:opportunity.quantity, type:'market'},
      capital: {available, source:opportunity.capitalSource, commitmentMs:Math.max(1000,maxUnhedgedMs), repayable:false, repaymentAmount:0, collateralRequired:0},
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

console.log(JSON.stringify({event:'worker_start',mode,requestedMode,heartbeatMs:interval,persistence:db?'POSTGRES_CONFIGURED':'NOT_CONFIGURED',coordination:redis?'REDIS_CONFIGURED':'NOT_CONFIGURED',signer:signerReady()?'PROTECTED_REF_CONFIGURED':'NOT_CONFIGURED',capitalPolicy:policy,safetyReserveUsd:safetyReserve,executionEnabled,capitalSource:requiredCapitalSource}));

async function heartbeat() {
  const now = new Date().toISOString();
  try { await refreshControlAndOpportunity(); }
  catch (error) { mode='EMERGENCY_STOP'; console.error(JSON.stringify({event:'execution_gate_error',error:String(error)})); }
  if (db) await db.query(`insert into system_health(component,status,heartbeat_at,details) values($1,$2,now(),$3::jsonb) on conflict(component) do update set status=excluded.status,heartbeat_at=excluded.heartbeat_at,details=excluded.details`, ['worker',mode,JSON.stringify({mode,requestedMode,controlStatus,signer:signerReady()?'READY':'NOT_CONFIGURED',executionEnabled,capitalSource:requiredCapitalSource})]);
  if (redis) await redis.set('abn:worker:heartbeat',now,'PX',Math.max(interval*3,15000));
  console.log(JSON.stringify({event:'worker_heartbeat',mode,controlStatus,timestamp:now}));
}

void heartbeat().catch(error=>console.error(JSON.stringify({event:'heartbeat_error',error:String(error)})));
setInterval(() => void heartbeat().catch(error=>console.error(JSON.stringify({event:'heartbeat_error',error:String(error)}))), interval);
