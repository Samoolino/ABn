import { NextResponse } from 'next/server';
import { auth } from '../../../auth';
import { listConfigs, storeSecret } from '../../../lib/secure-config';

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  return NextResponse.json({ configs: await listConfigs(session.user.email) });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const body = await request.json() as { kind?: string; name?: string; secret?: string; metadata?: Record<string, unknown> };
  if (!body.kind || !body.name || !body.secret) return NextResponse.json({ error: 'kind, name and secret are required' }, { status: 400 });
  if (body.kind === 'wallet_private_key') {
    if (!/^0x[0-9a-fA-F]{64}$/.test(body.secret)) return NextResponse.json({ error: 'INVALID_PRIVATE_KEY_FORMAT' }, { status: 400 });
  }
  await storeSecret(session.user.email, body.kind, body.name, body.secret, body.metadata ?? {});
  return NextResponse.json({ ok: true, status: 'STORED_ENCRYPTED', kind: body.kind, name: body.name });
}
