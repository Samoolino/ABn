import { NextResponse } from 'next/server';
import { auth } from '../../auth';
import { listConfigs } from '../../lib/secure-config';

export async function POST() {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const configs = await listConfigs(session.user.email);
  const hasSigner = configs.some((c: any) => c.kind === 'signer_ref') || Boolean(process.env.TRADING_SIGNER_REF);
  const venues = new Set(configs.filter((c: any) => c.kind === 'cex_api_key').map((c: any) => String(c.metadata?.venue ?? c.name)));
  const checks = [
    { name: 'TRADING_MODE', status: process.env.TRADING_MODE === 'DRY_RUN' ? 'PASS' : 'FAIL', detail: 'DRY_RUN is mandatory for this release gate.' },
    { name: 'EXECUTION_ENABLED', status: process.env.EXECUTION_ENABLED === 'false' ? 'PASS' : 'FAIL', detail: 'Live execution must be disabled during DRY_RUN.' },
    { name: 'PROTECTED_SIGNER_REFERENCE', status: hasSigner ? 'PASS' : 'NOT_CONFIGURED', detail: 'A signer reference is required; raw private keys are never accepted here.' },
    { name: 'VENUE_CREDENTIAL_CONFIGURATION', status: venues.size > 0 ? 'PASS' : 'NOT_CONFIGURED', detail: venues.size > 0 ? `${venues.size} venue credential profile(s) configured.` : 'Configure at least one venue credential profile for connector verification.' },
    { name: 'LIVE_ORDER_SUBMISSION', status: 'PASS', detail: 'This endpoint does not submit orders, transfer funds, or enable LIVE mode.' },
  ] as const;
  const ok = checks.every(c => c.status === 'PASS');
  return NextResponse.json({ ok, mode: process.env.TRADING_MODE ?? 'DRY_RUN', liveOrderSubmissionAllowed: false, checks, nextGate: ok ? 'CONNECT_ENGINE_DRY_RUN' : 'COMPLETE_CONFIGURATION' });
}
