import { NextResponse } from 'next/server';
import { auth } from '../../../auth';
import { listConfigs, storeSecret } from '../../../lib/secure-config';

const allowedKinds = new Set(['cex_api_key','cex_api_secret','cex_passphrase','dex_rpc','hummingbot_api_key','hummingbot_url','signer_ref']);

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
  if (!allowedKinds.has(body.kind)) return NextResponse.json({ error: 'UNSUPPORTED_SECRET_KIND' }, { status: 400 });
  if (body.kind === 'wallet_private_key') return NextResponse.json({ error: 'RAW_PRIVATE_KEYS_NOT_ACCEPTED_USE_SIGNER_REF' }, { status: 400 });
  if (body.secret.length > 16_384) return NextResponse.json({ error: 'SECRET_TOO_LARGE' }, { status: 400 });
  await storeSecret(session.user.email, body.kind, body.name, body.secret, body.metadata ?? {});
  return NextResponse.json({ ok: true, status: 'STORED_ENCRYPTED', kind: body.kind, name: body.name });
}
