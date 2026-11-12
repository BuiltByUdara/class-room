# Phase 2 — people and class management

## Objective and working features

Move from authentication-only screens to actual administration and enrollment. Administrators can invite users, search/filter/page through members, edit names/roles/status, deactivate accounts, and maintain student numbers, grades and school names. Passwords remain exclusively in the invitation/reset flow. Email addresses are immutable in this phase.

Admins link parents and students. Parents switch among linked children, view profiles and active classes, and see only their children's enrollment rows and assigned batches. Teachers can create their own classes, manage their batches and view enrolled students. Admins can assign/reassign teachers and enroll new students. Teachers can move existing students between batches or remove them, but cannot browse or enroll unrelated students.

Classes and batches can be edited and archived. Occupied batches must be emptied before archival. Enrollments are soft-removed and can be restored without creating duplicate records. Dashboards query real scoped class, student, batch, user and child counts. Managers' class totals include archived classes; learners see active classes only. Quiz metrics are not fabricated.

## Files and connections

- `packages/contracts/src/index.ts`: shared DTOs and Zod request schemas.
- `apps/api/src/modules/classes/routes.ts`: authenticated HTTP controllers for users, profiles, links, classes, batches, enrollments and summary counts.
- `apps/api/src/modules/classes/service.ts`: ownership/enrollment/relationship scope and safe academic DTOs.
- `apps/api/src/modules/users/service.ts`: safe member DTOs, role references, activation and last-admin rules.
- `apps/api/src/lib/transaction.ts`: serialized replica-set transactions, current actor checks, and audit events.
- `apps/api/src/db/models.ts`: management lock and lookup indexes; existing domain schemas reused.
- `apps/api/src/app.ts`, `server.ts`: router wiring and startup index initialization.
- `apps/web/src/features/management.tsx`: management pages, shared forms, member selection, tables, pagination, confirmations and child switching.
- `apps/web/src/pages/app.tsx`, `styles.css`: role navigation, dashboard routing and responsive table/form layouts.
- `apps/api/tests/management.test.ts`: database-backed role, isolation, validation and race tests.
- `apps/api/tests/ui-fixture.ts`: disposable browser QA server, never using the application's database.

Frontend React Query requests flow through the configured API origin. Controllers validate with the shared schemas, services scope access, and transactional writes persist both the mutation and audit event. Successful forms invalidate queries so counts and lists refresh. Account access changes revoke sessions and increment credentialVersion.

## Database prerequisite without Docker

Use a managed MongoDB replica set/cluster with transactions, or configure native MongoDB as a replica set. Back up existing data before changing a database deployment. For a **new local development database**, create a dedicated empty directory and start an installed MongoDB binary:

```powershell
mongod --replSet rs0 --bind_ip 127.0.0.1 --port 27017 --dbpath C:\path\to\your\new\mongo-data
```

In another terminal, with the MongoDB shell installed:

```powershell
mongosh --host localhost --port 27017 --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"localhost:27017"}]})'
```

Run initiation once for that new database. Wait for PRIMARY before starting the app. Configure `MONGODB_URI=mongodb://localhost:27017/tuition?replicaSet=rs0`. A pre-existing service on that port must be configured by its owner; do not start a second process against its data directory. Hosting deployments should use private authenticated databases and TLS as described in operations.md.

## Install, run and verify

From the repository root:

```powershell
npm ci
npm run dev:api
```

In another terminal: `npm run dev:web`. Use the existing `.env` configuration; do not overwrite credentials. Initial admin creation remains `npm run bootstrap` after setting the documented bootstrap environment values. No real account was created during Phase 2 testing.

`npm run verify` runs TypeScript, all API tests and production builds. Tests launch an isolated single-node replica set themselves; no Docker or application database is used. Browser QA uses separate localhost ports 4001/5174, random disposable credentials and temporary records, as documented in verification.md.

## Design choices and limits

Schedules are free-text descriptions plus validated IANA timezone; recurrence automation is not implemented. A student has one active batch per class. Referenced accounts cannot change role, preserving academic relationships; create a separate account for another role. The last active administrator cannot be deactivated/demoted even under concurrent requests. UI confirmation dialogs precede deactivation, unlinking and enrollment removal.

Next is Phase 3: quiz builder, scheduling, eligible student attempts, authoritative timers and automatic grading. SMTP delivery and real deployment credentials remain environment-dependent.
