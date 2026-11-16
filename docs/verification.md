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
