import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Apple from 'next-auth/providers/apple';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Pool } = pg;
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, max: 5 }) : null;

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: 'jwt' },
  providers: [
    Google({ clientId: process.env.GOOGLE_CLIENT_ID ?? '', clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '' }),
    Apple({ clientId: process.env.APPLE_CLIENT_ID ?? '', clientSecret: process.env.APPLE_CLIENT_SECRET ?? '' }),
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        if (!pool || typeof credentials?.email !== 'string' || typeof credentials?.password !== 'string') return null;
        const result = await pool.query('select id,email,name,image,password_hash from users where lower(email)=lower($1) limit 1', [credentials.email]);
        const user = result.rows[0];
        if (!user?.password_hash || !(await bcrypt.compare(credentials.password, user.password_hash))) return null;
        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!pool || !user.email) return false;
      await pool.query(
        `insert into users(email,name,image,email_verified) values($1,$2,$3,now())
         on conflict(email) do update set name=coalesce(excluded.name,users.name), image=coalesce(excluded.image,users.image), email_verified=coalesce(users.email_verified,now())`,
        [user.email, user.name ?? null, user.image ?? null],
      );
      return true;
    },
  },
  pages: { signIn: '/auth' },
});
