# Independent web and API deployment

## Layout and build context

`apps/web` is a static React/Vite app. `apps/api` is a standalone Express server. Both import `packages/contracts` during compilation. Deploy each from the repository root; do not upload only an app source directory or run a workspace-free install inside it. Each service can build and deploy without building or running the other.

Use `npm ci` including development dependencies in the build stage. Web: `npm run build:web`, publish `apps/web/dist`. API: `npm run build:api`, start `npm run start:api`. The API bundle contains shared contracts but still needs its installed runtime npm dependencies. Keep the installed workspace alongside the bundle on a Node host. Do not treat `dist/server.js` as a dependency-free executable.

## Web environment and routes

Set `VITE_API_URL` before building, e.g. `https://api.example.com`. This is the API origin, without `/api` or any path. Builds reject a missing/invalid origin. Rebuild when changing it. Configure the static host to serve `/index.html` for client routes such as `/login`, `/set-password`, and `/invite`. Assets must be served normally. There is no Vite API proxy.

Apply static-host security headers and a CSP permitting connections to the configured API origin. Never put database, SMTP, or bootstrap secrets into frontend environment variables.

## API environment

| Variable | Deployment value |
|---|---|
| NODE_ENV | production |
| HOST | 0.0.0.0 (default; local example uses 127.0.0.1) |
| PORT | supplied by hosting platform, otherwise 4000 |
| APP_ORIGIN | exact HTTPS web origin, no trailing slash |
| MONGODB_URI | authenticated private MongoDB connection URI |
| COOKIE_SAME_SITE | strict for same-site HTTPS subdomains; none for unrelated sites |
| TRUST_PROXY_HOPS | 0 by default; set only to the verified fixed proxy-hop count |
| SESSION_HOURS | 12 by default |
| SMTP_HOST / SMTP_PORT / SMTP_SECURE | provider settings; true for implicit TLS, usually port 465 |
| SMTP_USER / SMTP_PASSWORD / MAIL_FROM | provider credentials and verified sender |

`npm run start:api` uses host-injected environment variables and does not require an environment file. Health endpoint: `/api/health` returns 200 when MongoDB is connected and 503 otherwise. Provision native/managed MongoDB independently; no Docker configuration remains. Phase 2 management writes require a MongoDB replica set or managed cluster with transaction support; a standalone mongod is insufficient.

For initial admin creation, temporarily set `BOOTSTRAP_NAME`, `BOOTSTRAP_EMAIL`, `BOOTSTRAP_PASSWORD` in the hosted API environment and run `npm run bootstrap:hosted -w @tuition/api` from the repository root. This requires build tooling (`tsx`) installed. Remove those three values afterward. Local bootstrap continues to use `npm run bootstrap` and `apps/api/.env`.

## Cookies, CORS, and proxy settings

Recommended topology: `https://app.example.com` and `https://api.example.com` on separate services. These origins differ, but share a site. The frontend sends `credentials: include`. The API permits exactly `APP_ORIGIN` with credentialed CORS and validates preflights. Write requests still require that Origin and `X-Requested-With: tuition-web`; CORS does not replace CSRF validation. Production session cookies remain host-only, Secure and HttpOnly; never set a wildcard cookie domain.

For entirely unrelated frontend/API domains, use `COOKIE_SAME_SITE=none`. Secure cookies require HTTPS; configuration rejects this mode outside production. Some browsers block third-party cookies regardless of CORS. Use same-site custom subdomains if login fails due to cookie blocking. See [MDN CORS and third-party cookie policies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS).

Keep `TRUST_PROXY_HOPS=0` unless the hosting ingress is known. Behind exactly one enforced proxy, 1 may be appropriate; direct access to the API must then be blocked by network policy. Variable-length or bypassable paths require a deployment-specific trust function, not an arbitrary hop count. Wrong proxy trust can allow rate-limit bypass or group users under one IP. Use a shared rate-limit store before horizontally scaling.

## Verification and release

Run `npm run verify` after configuring the local web environment. Integration tests cover authentication plus allowed/denied origins, preflights, cross-origin session use, logout, and Secure SameSite=None configuration. These API tests do not emulate browser cookie policies. Before deployment, test actual login, refresh, logout, password emails and SPA deep links from the intended browser and domains.

Use provider-managed secrets, restrict database network access, monitor errors without logging credentials, and add durable email queuing before a public launch. Phases 1 and 2 are implemented; quizzes and academic reporting remain later phases.

## Backup and recovery

Use encrypted managed MongoDB snapshots and point-in-time recovery where available, least-privilege backup credentials, and off-account retention. Agree on RPO/RTO with the teacher; daily snapshots and 30-day retention are a starting proposal. Test restoration to a separate database before launch and quarterly. Invalidate sessions after recovery and verify indexes and access boundaries. Native database persistence alone is not a backup.

