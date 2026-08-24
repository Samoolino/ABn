# Authentication

ABn no longer integrates with Supabase. Authentication is handled by Auth.js with PostgreSQL as the application data store.

Supported flows:

- Email/password credentials stored as bcrypt password hashes in PostgreSQL.
- Google OAuth.
- Apple OAuth.
- JWT session cookies.

Flow:

`/auth → Auth.js → provider/credentials → authenticated session → /dashboard`

Required environment variables:

- `DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_URL`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- `APPLE_CLIENT_ID` / `APPLE_CLIENT_SECRET`
- `APPLE_ISSUER`

Production providers must use the deployed application's Auth.js callback URL. Do not hardcode production hosts in application code.

A missing provider configuration is reported as `NOT_CONFIGURED`; it is not treated as a successful authentication setup.
