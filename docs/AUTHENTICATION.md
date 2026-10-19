# Password recovery and Google sign-in

Existing email/password sessions and registration remain available. No new auth framework or runtime dependency is required.

## Configure

Set these in `infra/.env` for Compose, or `apps/web-ecommerce/.env` for a local server:

```dotenv
SHOP_PUBLIC_URL=http://localhost:6050
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

Create a **Web application** OAuth client in Google Cloud / Google Auth Platform. Add the exact redirect URI
`http://localhost:6050/api/auth/google/callback` (production: your HTTPS shop origin followed by `/api/auth/google/callback`).
Configure the consent screen and test users while the Google app is in testing. Both Google credentials are server-only.
The Google button appears when both are configured; restart/rebuild the web service after editing them.

Follow Google's [OpenID Connect server flow](https://developers.google.com/identity/openid-connect/openid-connect).
This implementation checks state, PKCE, nonce, signature, issuer, audience, authorized party, expiration and verified email.
No Google access or refresh tokens are stored. An existing account can be linked by verified Gmail / Workspace email;
Google is not authoritative for a third-party mailbox, so an existing such account must use its password.
New Google customers receive the USER role and can complete their contact details at checkout / in their profile.
They can use email recovery to set a password (also needed for password step-up). Locked accounts cannot sign in.

## Email recovery

Configure the existing `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`. For local testing use Compose
`--profile mail` with `SMTP_HOST=mailpit`, `SMTP_PORT=1025`; read mail at `http://localhost:8025`.
Recovery links are not written to application logs, including in development.

`/vi/auth/forgot-password` and `/en/auth/forgot-password` send a generic response whether or not an active account exists.
A link expires after 15 minutes and works once; resending after the 60-second cooldown invalidates the previous link.
Only a SHA-256 digest is stored in the existing verification table. The random 256-bit credential travels in the URL
fragment and is removed from browser history after reading; reset pages are noindex and send no referrer.
Successful recovery invalidates all older web sessions through `user.sessionVersion` and requires a fresh login.
Email delivery failures are logged without account/token details; the generic response remains unchanged.

The server applies request limits to recovery requests and Google initiation, using the same per-process approach as
the existing login limiter. Email resend cooldowns also use a database lock across processes. With multiple replicas,
enforce the request limits at the reverse proxy as well.

The additive migration runs on normal server startup; existing accounts/sessions remain valid until password recovery.

## Verify

`yarn type-check`, `yarn test`; the Postgres suite `tests/db/auth-recovery.test.ts` requires a dedicated `*_test`
database via `TEST_DB_*` and recreates its user/verification tables. It tests migration idempotence, concurrent reset
and resend, expiry, session revocation, Google signed claims and account linking without calling real Google APIs.
`e2e/auth-recovery-ui.spec.ts` tests the UI with mocked APIs against an isolated Next preview.
