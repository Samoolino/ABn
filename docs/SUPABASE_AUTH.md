# Supabase Auth

Required flows: email/password, Google OAuth and Apple OAuth.

Browser flow:

`/auth → Supabase provider → /auth/callback → authenticated session → /dashboard`

Configure provider redirect URLs from environment variables rather than hardcoding production hosts. `SUPABASE_SERVICE_ROLE_KEY` is server/worker-only. `/auth` must be a real Next.js route and direct navigation must return a page rather than a Vercel 404.

Provider state is reported as `NOT_CONFIGURED` until the corresponding Supabase provider credentials and redirect configuration are verified.
