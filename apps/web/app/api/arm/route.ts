import { NextResponse } from 'next/server';
import { auth } from '../../../auth';
import { Pool } from 'pg';

export async function POST() {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  if (process.env.TRADING_MODE !== 'LIVE') return NextResponse.json({ status: 'ARM_BLOCKED', reason: 'TRADING_MODE_NOT_LIVE' }, { status: 409 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ status: 'ARM_BLOCKED', reason: 'DATABASE_NOT_CONFIGURED' }, { status: 503 });
  const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    await db.query(
      `insert into system_health(component,status,heartbeat_at,details) values('trading_control','ARMED',now(),$1::jsonb)
       on conflict(component) do update set status='ARMED',heartbeat_at=now(),details=excluded.details`,
      [JSON.stringify({ requestedBy: session.user.email, requestedMode: 'LIVE' })],
    );
    return NextResponse.json({ status: 'ARMED', requestedMode: 'LIVE', note: 'Worker must independently validate signer, funded capital, opportunity, profitability and risk gates.' });
  } finally { await db.end(); }
}
