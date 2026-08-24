import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    runtime: process.env.TRADING_MODE === 'LIVE' && process.env.TRADING_SIGNER_REF ? 'LIVE' : 'DRY_RUN',
    worker: process.env.WORKER_STATUS ?? 'NOT_CONFIGURED',
    hummingbot: process.env.HUMMINGBOT_BASE_URL ? 'CONFIGURED' : 'NOT_CONFIGURED',
    signer: process.env.TRADING_SIGNER_REF ? 'CONFIGURED' : 'NOT_CONFIGURED',
    capital: null,
    opportunities: 0,
    realizedPnl: null,
    lastHeartbeat: process.env.WORKER_HEARTBEAT ?? null,
  });
}
