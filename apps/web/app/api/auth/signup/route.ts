import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Pool } = pg;

export async function POST(request: Request) {
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const password = String(form.get('password') ?? '');
  if (!email || password.length < 12) return NextResponse.redirect(new URL('/auth?error=invalid_signup', request.url));
  if (!process.env.DATABASE_URL) return NextResponse.redirect(new URL('/auth?error=not_configured', request.url));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  try {
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'insert into users(email,password_hash) values($1,$2) on conflict(email) do nothing returning id',
      [email, hash],
    );
    if (!result.rowCount) return NextResponse.redirect(new URL('/auth?error=account_exists', request.url));
    await pool.query('insert into profiles(id,display_name) values($1,$2) on conflict(id) do nothing', [result.rows[0].id, email.split('@')[0]]);
    return NextResponse.redirect(new URL('/auth?created=1', request.url));
  } finally {
    await pool.end();
  }
}
