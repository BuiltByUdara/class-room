# Classroom — Private Tuition Management

React web app and Express API deploy independently. Docker is not required. They share TypeScript/Zod contracts in this npm workspace; keep the full repository available during each build.

## Local setup

Prerequisites: Node 20.19+ (supported Node LTS recommended for deployment), npm, a MongoDB replica set or managed cluster with transaction support, and an SMTP provider for invitations/password resets. Phase 2 writes cannot use a standalone MongoDB server.

```powershell
npm ci
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env
```

Skip a copy if the destination already contains your configuration. Set `MONGODB_URI` and SMTP settings in `apps/api/.env`. A native single-node replica set named rs0 can use `mongodb://127.0.0.1:27017/tuition?replicaSet=rs0`; a hosted service uses its supplied connection URI. No persistent database server is installed or started by this repository. See the Phase 2 guide for native setup.

Set `BOOTSTRAP_NAME`, `BOOTSTRAP_EMAIL`, and a unique `BOOTSTRAP_PASSWORD` in the API environment, then run `npm run bootstrap` once and remove those values. No account has been seeded automatically.

Start each service in its own terminal:

```powershell
npm run dev:api
```

```powershell
npm run dev:web
```

Open http://localhost:5173. The web app calls http://localhost:4000 directly. `APP_ORIGIN` on the API must match the web origin exactly. `VITE_API_URL` on the web is the API origin without `/api`. Use localhost consistently, not a mixture of localhost and 127.0.0.1. The optional `npm run dev` starts both processes.

## Independent deployment

Create two hosting services from the same repository, both using the repository root as their build directory:

| Service | Install | Build | Start/output |
|---|---|---|---|
| Web (static hosting) | `npm ci` | `npm run build:web` | Publish `apps/web/dist`; SPA fallback to `/index.html` |
| API (Node hosting) | `npm ci` | `npm run build:api` | `npm run start:api` |

Web build environment: `VITE_API_URL=https://api.example.com`.

API runtime environment: `NODE_ENV=production`, `APP_ORIGIN=https://app.example.com`, `HOST=0.0.0.0`, platform-assigned `PORT`, `MONGODB_URI`, SMTP settings, `COOKIE_SAME_SITE=strict`. Configure proxy trust only to match the hosting network. The API start command reads environment variables supplied by the host and needs no `.env` file. For a locally built API, `npm run start:local -w @tuition/api` loads the local API `.env`.

Use HTTPS subdomains of the same domain for reliable cookies across separate hosts. Unrelated domains require `COOKIE_SAME_SITE=none`, but browser third-party-cookie restrictions can still block login. See the deployment guide for details. No credentials belong in `VITE_*` variables, which are public build output.

## Verification and scope

```powershell
npm run verify
```

Copy/configure the web `.env` before building; production builds require `VITE_API_URL`. Tests use an isolated MongoDB process and never touch the application database. The first test run may download its MongoDB binary.

Phases 1–2 include authentication, invitations, member management and profiles, parent–student relationships, classes, batches, enrollment, and dashboards using actual counts. Quizzes and academic analytics remain future phases.

- [Architecture and roadmap](docs/architecture.md)
- [Database relationships](docs/database.md)
- [API contracts](docs/api.md)
- [Deployment guide](docs/operations.md)
- [Verification record](docs/verification.md)
- [Phase 2 implementation and setup](docs/phase2.md)
