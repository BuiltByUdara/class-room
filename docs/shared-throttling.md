# Shared authentication throttling

This release continues Phase 5 by replacing process-local authentication counters with MongoDB-backed counters. API processes using the same database now share budgets; restarting an API does not reset them. No Redis service or Docker configuration is required.

## Behavior

The existing budgets remain: 60 requests to /api/auth, 10 login attempts, 5 password-link requests and 10 password-reset submissions per client in 15 minutes. Endpoint-specific requests also consume the general authentication budget. Successes and failures both count. Express-rate-limit supplies client IP/IPv6 grouping; verified proxy trust configuration is still required.

Each client/scope gets a fixed-duration window beginning with its first request. One atomic update uses the MongoDB server clock to increment or reset an expired window. Counters are acknowledged with majority write concern. Concurrent initial insert races retry once against the unique key. Different endpoint budgets use distinct scopes.

RateLimitCounters stores a SHA-256 digest of scope/client key, hit count and expiry; it does not store raw IP addresses, emails, passwords or tokens. Hashing is pseudonymization, not a guarantee of anonymity. Expired records have a TTL index, but request-time expiry works independently of delayed TTL cleanup.

The middleware fails closed: database errors produce 503 RATE_LIMIT_UNAVAILABLE, without exposing the database error or allowing login to bypass the limit. Limit exhaustion returns 429 with Retry-After and standard rate-limit headers. Health checks are outside authentication throttles. The backing database must be monitored for latency and availability.

## Rollout

Deploy the new RateLimitCounters TTL index with the existing release tools before starting the production API:

```powershell
npm run indexes:apply -w @tuition/api
npm run release:check -w @tuition/api
```

These commands use host-provided API environment variables. Production startup refuses missing declared indexes. No existing counters are migrated from memory; the first deployment starts fresh shared windows. Avoid mixed old/new API versions during rollout because old processes still use their own counters. All participating instances must use the same database and consistent proxy/budget configuration.

Do not delete counters on application startup or during ordinary releases. Recovery procedures should retain counters unless an explicit operational reset is intended. There is no public counter-reset endpoint.

## Verification and remaining work

Tests exercise forty concurrent increments across separate stores, expired records before TTL deletion, client/scope isolation, decrement/reset behavior, HTTP enforcement across two apps plus a recreated app, and fail-closed database errors. This is local isolated-database evidence, not a production capacity benchmark or a failover drill.

Shared authentication throttling removes one multi-instance blocker. It does not establish full horizontal scalability: still benchmark the administration lock, history aggregation, mail delivery and expiry processing under realistic load. Durable email queuing, live-domain/SMTP checks, cross-browser accessibility and backup recovery remain release gates. No real account, production deployment or external email was created by this change.
