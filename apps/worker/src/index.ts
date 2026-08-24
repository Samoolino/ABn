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
if (requestedMode === 'LIVE' && !signerRefConfigured()) {
  mode = 'DRY_RUN';
  console.error(JSON.stringify({ event: 'live_blocked', reason: 'SIGNER_NOT_CONFIGURED', status: 'NOT_CONFIGURED' }));
}

console.log(JSON.stringify({
  event: 'worker_start', mode, requestedMode, heartbeatMs: interval,
  persistence: db ? 'POSTGRES_CONFIGURED' : 'NOT_CONFIGURED',
  coordination: redis ? 'REDIS_CONFIGURED' : 'NOT_CONFIGURED',
  signer: signerRefConfigured() ? 'PROTECTED_REF_CONFIGURED' : 'NOT_CONFIGURED',
  capitalPolicy: policy,
}));

async function heartbeat() {
  const now = new Date().toISOString();
  if (db) {
    await db.query(
      `insert into system_health(component,status,heartbeat_at,details) values($1,$2,now(),$3::jsonb)
       on conflict(component) do update set status=excluded.status,heartbeat_at=excluded.heartbeat_at,details=excluded.details`,
      ['worker', mode === 'LIVE' ? 'LIVE' : 'RUNNING', JSON.stringify({ mode, requestedMode })],
    );
  }
  if (redis) await redis.set('abn:worker:heartbeat', now, 'PX', Math.max(interval * 3, 15000));
  console.log(JSON.stringify({ event: 'worker_heartbeat', mode, timestamp: now }));
}

void heartbeat().catch((error) => console.error(JSON.stringify({ event: 'heartbeat_error', error: String(error) })));
setInterval(() => void heartbeat().catch((error) => console.error(JSON.stringify({ event: 'heartbeat_error', error: String(error) }))), interval);
