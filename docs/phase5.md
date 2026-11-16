# Phase 5: release hardening

## Delivered locally

- API startup verifies replica-set/sharded topology and performs a read-only transaction before accepting requests. Production startup refuses missing schema indexes rather than silently building them under traffic.
- Database release tooling checks configuration, topology and index drift without writing by default. Explicit index creation is additive; no index is automatically dropped.
- SIGINT/SIGTERM stops the quiz timer, drains HTTP requests, waits for the current sweep and disconnects MongoDB. Shutdown has a 30-second deadline; a timeout exits unsuccessfully so the host can report it.
- API responses have server-generated X-Request-ID values. Unhandled request failures log only the event and ID. Parsing and CORS errors are also marked no-store. Error bodies do not expose database details.
- SMTP has bounded connection/greeting/socket timeouts. Production non-implicit-TLS SMTP requires STARTTLS.
- Web builds emit _headers (CSP, framing/privacy headers and asset caching) and _redirects (SPA fallback). Hosts must support those files or configure equivalent rules themselves. The CSP permits the configured API origin; inline styles remain allowed for charts.
- Management screens are lazy-loaded and the web resolves a single Zod copy. Quiz and analytics chunks remain lazy.
- GitHub Actions configuration installs from the lockfile, runs type checks/tests/builds and uploads separate build directories. The workflow is added locally; a remote Actions run has not been observed.

## Database rollout

Run commands from the repository root with API environment variables supplied by the host:

```powershell
npm ci
npm run release:check -w @tuition/api
```

The check reports missing and extra indexes by collection, without printing the URI or credentials. It fails on missing indexes or unavailable/incompatible databases. Extra indexes are reported for review and retained. For a new database, a missing-index result is expected. Review index changes, take a backup, and apply them during a maintenance window:

```powershell
npm run indexes:apply -w @tuition/api
npm run release:check -w @tuition/api
```

Index creation can fail if historical data violates a unique constraint or an existing index has incompatible options. Resolve the data/index conflict explicitly; the tool does not delete data or drop indexes. Local read-only checking uses `npm run release:check:local -w @tuition/api` to load apps/api/.env. Do not point tests or disposable fixtures at the real database.

Build/deploy web and API independently using docs/operations.md. Authentication counters now use shared MongoDB storage; see [shared throttling](shared-throttling.md) for index rollout and consistent proxy configuration. Multi-instance load and failover checks are still required. Do not use the CI example API URL in a real web deployment.

## Launch gates requiring the target environment

| Gate | Required evidence |
|---|---|
| Database | Replica-set check and index check pass on the target; authenticated private access |
| Login | Bootstrap a real administrator; verify login, refresh and logout across the actual HTTPS domains |
| Email | Invitation and reset delivery with the chosen SMTP provider, expiration and single-use links |
| Browser | Chrome/Firefox/Safari/mobile flow: quiz save, resume, expiry, parent switch, export; keyboard and screen-reader review |
| Static host | SPA deep links work; response headers match generated policy; CSP permits API calls and charts |
| Load | Representative cohort/attempt volume; measure p95 API/report latency, lock contention and memory against agreed limits |
| Monitoring | Alert on health failures, 5xx request IDs, expiry-sweep failures, shutdown timeouts and failed email delivery |
| Recovery | Restore an encrypted backup into a separate database; verify counts, indexes and sample results; invalidate restored sessions |
| Governance | Approve retention, parent verification, RPO/RTO and restore ownership; never assume academic data can be purged |

For a recovery drill, use an isolated restore destination and credentials; never restore over the live database. Run the release check against the restored copy, compare anonymized record counts and known sample results, and confirm users cannot reuse restored sessions. Record measured recovery time and backup age. No backup was created or restored during local development.

Durable email queuing, large-history query optimization and a full cross-browser/accessibility audit remain open. No production deployment, real account creation, actual SMTP delivery or hosted-domain verification is claimed by this phase.
