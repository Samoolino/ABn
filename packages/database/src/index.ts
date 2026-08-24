import pg from 'pg';

const { Pool } = pg;

export function createDatabasePool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) return null;
  return new Pool({ connectionString, max: Number(process.env.DB_POOL_MAX ?? 10), idleTimeoutMillis: 30_000 });
}
