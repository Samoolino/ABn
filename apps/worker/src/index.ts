import { createDatabasePool } from '@abn/database';
import { createRedisClient } from '@abn/redis';
import { fundedCapitalPolicy } from '@abn/capital-engine';
import { signerRefConfigured } from '@abn/signer';

const requestedMode = process.env.TRADING_MODE || process.env.RUNTIME_MODE || 'STOPPED';
const interval = Number(process.env.HEARTBEAT_MS || 5000);
const db = createDatabasePool();
const redis = createRedisClient();
const policy = fundedCapitalPolicy();

let mode = requestedMode;
let controlStatus = 'STOPPED';

function signerReady() {
  return signerRefConfigured();
}

async function refreshControlAndOpportunity() {
  if (!db) return;

  const control = await db.query(
    `select status, details from system_health where component='trading_control' limit 1`,
  );
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
    `select id, symbol, net_profit, capital_required, expires_at
       from opportunities
      where status in ('EXECUTABLE', 'EXECUTABLE_NOW')
        and expires_at > now()
        and net_profit > safety_reserve
      order by net_profit / greatest(capital_required, 0.00000001) desc, net_profit desc
      limit 1`,
  ).catch(() => ({ rows: [] as Array<{ id:string; symbol:string; net_profit:string; capital_required:string; expires_at:string }> }));

  const opportunity = candidate.rows[0];
  if (!opportunity) {
    mode = 'ARMED';
    return;
  }

  // Execution remains behind the adapter/signer gate. Do not claim a trade was sent
  // until a real CEX/DEX execution connector is configured and reconciled.
  mode = 'ARMED_EXECUTION_READY';
  await db.query(
    `insert into opportunity_events(opportunity_id,event,details)
     values($1,'EXECUTION_GATE_READY',$2::jsonb)`,
    [opportunity.id, JSON.stringify({ symbol: opportunity.symbol, netProfit: opportunity.net_profit, capitalRequired: opportunity.capital_required })],
  );
}

if (requestedMode === 'LIVE' && !signerReady()) {
  mode = 'DRY_RUN';
  console.error(JSON.stringify({ event: 'live_blocked', reason: 'SIGNER_NOT_CONFIGURED', status: 'NOT_CONFIGURED' }));
}

console.log(JSON.stringify({
  event: 'worker_start', mode, requestedMode, heartbeatMs: interval,
  persistence: db ? 'POSTGRES_CONFIGURED' : 'NOT_CONFIGURED',
  coordination: redis ? 'REDIS_CONFIGURED' : 'NOT_CONFIGURED',
  signer: signerReady() ? 'PROTECTED_REF_CONFIGURED' : 'NOT_CONFIGURED',
  capitalPolicy: policy,
}));

async function heartbeat() {
  const now = new Date().toISOString();
  try {
    await refreshControlAndOpportunity();
  } catch (error) {
    mode = 'EMERGENCY_STOP';
    console.error(JSON.stringify({ event: 'execution_gate_error', error: String(error) }));
  }
  if (db) {
    await db.query(
      `insert into system_health(component,status,heartbeat_at,details) values($1,$2,now(),$3::jsonb)
       on conflict(component) do update set status=excluded.status,heartbeat_at=excluded.heartbeat_at,details=excluded.details`,
      ['worker', mode, JSON.stringify({ mode, requestedMode, controlStatus, signer: signerReady() ? 'READY' : 'NOT_CONFIGURED' })],
    );
  }
  if (redis) await redis.set('abn:worker:heartbeat', now, 'PX', Math.max(interval * 3, 15000));
  console.log(JSON.stringify({ event: 'worker_heartbeat', mode, controlStatus, timestamp: now }));
}

void heartbeat().catch((error) => console.error(JSON.stringify({ event: 'heartbeat_error', error: String(error) })));
setInterval(() => void heartbeat().catch((error) => console.error(JSON.stringify({ event: 'heartbeat_error', error: String(error) }))), interval);
