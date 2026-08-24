import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, max: 5 }) : null;

function key() {
  const raw = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!raw) throw new Error('CREDENTIAL_ENCRYPTION_KEY_NOT_CONFIGURED');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('CREDENTIAL_ENCRYPTION_KEY_MUST_BE_32_BYTES_BASE64');
  return buf;
}

export function encryptSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return JSON.stringify({ v: 1, alg: 'AES-256-GCM', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: ciphertext.toString('base64') });
}

export async function storeSecret(ownerId: string, kind: string, name: string, secret: string, metadata: Record<string, unknown>) {
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');
  const encrypted = encryptSecret(secret);
  await pool.query(`create table if not exists abn_secure_configs (id uuid primary key default gen_random_uuid(), owner_id text not null, kind text not null, name text not null, encrypted_value text not null, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(owner_id,kind,name))`);
  await pool.query(`insert into abn_secure_configs(owner_id,kind,name,encrypted_value,metadata) values($1,$2,$3,$4,$5::jsonb) on conflict(owner_id,kind,name) do update set encrypted_value=excluded.encrypted_value,metadata=excluded.metadata,updated_at=now()`, [ownerId, kind, name, encrypted, JSON.stringify(metadata)]);
}

export async function listConfigs(ownerId: string) {
  if (!pool) return [];
  await pool.query(`create table if not exists abn_secure_configs (id uuid primary key default gen_random_uuid(), owner_id text not null, kind text not null, name text not null, encrypted_value text not null, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(owner_id,kind,name))`);
  const result = await pool.query(`select id,kind,name,metadata,created_at,updated_at from abn_secure_configs where owner_id=$1 order by updated_at desc`, [ownerId]);
  return result.rows;
}
