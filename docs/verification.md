# Quiz images verification - 16 November 2026

TypeScript checks and all 91 tests across nine files passed. New tests cover Drive link conversion, resource keys, unsafe-link rejection, text-only compatibility and image persistence through quiz editing, duplication, snapshot/resume and submission. Both production builds passed with the existing main-bundle size and Zod annotation advisories.

Browser QA loaded the user-supplied Drive image, saved a disposable quiz and reopened the editor. The image remained loaded (natural size 1080 x 1616). The preview screenshot is screenshots/quiz-drive-image.jpg. The fixture used isolated MongoDB; no production quiz or Drive upload/sharing setting was changed. Local preview processes were stopped after verification.

---

# Shared throttling verification - 16 November 2026

The complete verification run passed both TypeScript checks, 76 tests across eight files and both production builds. After adding majority write acknowledgement to counter updates, the API typecheck, all five focused counter tests and the API build passed again. Tests used disposable MongoDB databases only.

Verified atomic 40-request concurrency, shared budgets across independent app instances and a recreated app, expiration without TTL cleanup, scope/client isolation and safe 503 failures. Live multi-host deployment, primary failover and production capacity were not tested. Existing web bundle/Zod advisories remain unchanged. Production rollout requires the new RateLimitCounters TTL index; see shared-throttling.md.

---

# Phase 5 local verification - 16 November 2026

Final `npm run verify` passed: both TypeScript checks, 71 tests across seven files, and independent API/web production builds. The release-check CLI ran successfully against an isolated replica set and preserved the user count. The management suite also exercised an actual transactional readiness read. New tests cover unsupported topology, request IDs, cache policy on malformed/CORS errors, and secret-free failure logging.

The main web chunk decreased from 588.87 kB in Phase 4 to 503.90 kB (about 14%). Deduplicating Zod also reduced the lazy management chunk to 16.71 kB. The main chunk still triggers the 500 kB advisory; upstream Zod annotation warnings remain. Generated deployment artifacts include _headers and _redirects.

No browser visual changes were made; the earlier Phase 4 browser evidence remains historical, not a new cross-browser audit. CI was configured but not run remotely. SMTP TLS, deployed CSP, production startup/shutdown under host orchestration, realistic load and backup restoration still require target-environment verification. No production account or database was modified. See phase5.md for launch gates.

---

# Phase 4 verification — 16 November 2026

`npm run verify` passed: API/web TypeScript checks, all 67 tests across six files, and both production builds. Tests use isolated MongoDB, never the application database. The Phase 3 baseline of 48 tests also passed before this change.

Browser QA used disposable parent/child fixtures on ports 4001/5174: switched between two children, confirmed empty states, verified published-only average 62.5%, pending result masking, completion 3/4, topic charts, and downloaded the CSV successfully. The downloaded report matched the dashboard. At a 390-pixel viewport the page width was also 390 pixels. Screenshots are in screenshots/phase4-parent-dashboard.jpg and screenshots/phase4-parent-mobile.jpg.

Build warnings: upstream Zod annotations and a main web chunk above 500 kB; both builds succeeded. Recharts installation reported zero audit vulnerabilities. Production MongoDB setup, SMTP, real user login credentials, hosted browser cookie behavior, load testing and deployment remain unverified. No persistent account was created or production service deployed.

---

# Phase 1 verification — 12 November 2026

## Separate-deployment update

After removing Compose and switching to independently hosted web/API services, `npm run verify` passed: API/web type checks, 18 integration tests, and both production builds. Added checks cover credentialed preflights, rejected origins/headers, allowed-origin login/session/logout, Secure SameSite=None cookies, and invalid configuration. Local web build used `VITE_API_URL=http://localhost:4000`. Native/managed production database setup, SMTP delivery, and browser cookie behavior on deployed domains remain unverified. No production deployment or administrator creation was performed in this update.

## Original foundation verification

Environment: Windows, Node 20.20.2, npm 10.8.2.

| Check | Result |
|---|---|
| `npm run typecheck` | Passed for API and web |
| `npm test` | 14 passed; real isolated MongoDB via mongodb-memory-server |
| `npm run build` | API ESM bundle and frontend production assets built successfully |
| Dependency audit during final install | 0 vulnerabilities reported |
| Build dependency resolution | `npm ls esbuild --depth=2` passed |

The final `npm run verify` exited with code 0. Vite emitted two non-fatal warnings about upstream Zod comment annotations and removed those comments during bundling.

The test mail adapter captures links instead of connecting to SMTP. Live SMTP delivery and browser interaction have not been verified. Docker CLI is installed, but the Docker engine was not running, so no persistent local MongoDB/Mailpit services were launched. No administrator or sample academic records were seeded. An ignored local `apps/api/.env` was copied from the example; administrator credentials remain unset.

Windows sandbox filesystem restrictions blocked Node dependency resolution; installation and verification were run with approved elevated tool execution. No application privileges were loosened to accommodate the test environment.
