# Protected hosted preview

The selected architecture is one Render Node application serving React, HTTP commands, and WebSockets, with a managed PostgreSQL database. The user approved this approach to keep setup straightforward and preserve a path to background workers and real leagues. Local development retains SQLite. Both adapters share the same rules, command/revision contracts, and clients.

This is a protected review environment with fictional data and a shared Alex identity. It does not implement personal manager accounts, league membership, live sports ingestion, or production worker coordination.

## Live preview and verification

Preview URL: [https://howieszn-preview.onrender.com](https://howieszn-preview.onrender.com)

The user deployed revision `97e2c10` through Render and confirmed the following live browser checks on November 11, 2026:

- Preview sign-in succeeds.
- The application shows Connected.
- Saving a league-name change updates a second tab without refreshing.
- The saved name remains after reloading.

This is user-reported live verification. The assistant's direct request to `/healthz` was blocked by the workspace proxy at CONNECT with HTTP 403, so no automated live health response or authenticated live browser test is claimed. Backend restart, scoring, and capture were tested in the local PostgreSQL/HTTPS/WSS rehearsal described below; a live backend restart has not been verified.

## Resources and cost boundary

[render.yaml](../../render.yaml) declares two resources in the same Oregon region:

| Resource | Prepared configuration |
| --- | --- |
| Application | Native Node 24.22.1, Starter plan, one instance |
| Database | PostgreSQL 18, `basic-256mb`, 5 GB storage, private application access |

These are billable-plan identifiers, not price quotes. The user created the application and database through Render; exact charges and retention/backup settings remain unavailable to the assistant. Review current dashboard charges before changing resources. No hosting account or purchase was made by the assistant.

The application has no persistent local disk requirement. Its database connection comes from Render's private `fromDatabase.connectionString` binding. `ipAllowList: []` disables external database connections while allowing Render's internal connection. Keep the application and database in the same region.

## Account and deployment steps

1. Create a Render account at [the official registration page](https://dashboard.render.com/register), using GitHub sign-in if available.
2. Authorize access to `nkjchamp/howieszn` once the prepared branch is available. The deployment branch is `preview/protected-hosting`.
3. Import the repository as a Blueprint using its root `render.yaml`, selecting that branch. Current dashboard labels may differ; the resource preview should show one Node application and one PostgreSQL database.
4. Review the displayed application/database charges and configuration before creating resources. Deploy the Blueprint when acceptable.
5. After deployment, open the application's HTTPS URL. The preview username is `preview`; the password is generated in the application environment settings. Obtain it there and keep it private. Do not paste it or a database URL into chat.
6. Confirm that the page shows Connected. Share the public application URL and any sanitized error text if assistance is needed.

The Render account/GitHub connection is a user step: no hosting credentials or deployment-control tool are connected to this chat. The Blueprint disables automatic application redeployment; intentionally deploy reviewed revisions. The PostgreSQL adapter performs non-destructive schema initialization before the application starts listening.

## Startup contract

Build with `npm ci --include=dev && npm run build`. Development tools are required during the build even though `NODE_ENV=production`. Start with `npm run preview`.

| Setting | Source / requirement |
| --- | --- |
| `DATABASE_URL` | Managed PostgreSQL private connection; required, with no SQLite fallback |
| `PREVIEW_USERNAME` | Defaults to `preview` |
| `PREVIEW_PASSWORD` | Host-generated secret, at least 32 UTF-8 bytes |
| Allowed origin | Render's `RENDER_EXTERNAL_URL`; an exact `PREVIEW_ORIGIN` can override it |
| `HOWIESZN_DB_SCHEMA` | Defaults to `howieszn`; tests use their own namespaces |
| `PORT` / `HOST` | Host-provided port, bind address `0.0.0.0` |
| `/healthz` | Minimal unauthenticated liveness response with no league data |

The preview gate, exact origin, and built web directory are validated before connecting to PostgreSQL or running migrations. Invalid database URLs and database initialization errors produce safe messages without logging credentials. Browser credentials protect HTML, assets, API requests, and the WebSocket handshake. Every reviewer still acts as the same demo commissioner.

Public allowed origins must use HTTPS and contain only scheme, hostname, and optional port, without a path or trailing slash. Loopback HTTP is supported for local testing. A custom domain requires updating the configured origin before using commands or WebSockets through that domain.

## Persistence and future scaling

PostgreSQL stores JSONB league snapshots, command receipts, revision events, and schema migrations. Every command locks the league row and atomically commits its accepted state, receipt, and event. Repeated command IDs resolve before stale-revision rejection; a failed transaction rolls back all related writes. Restarting preserves accepted state and original command identity.

The cloud preview starts with a fresh fictional league. It does not copy or delete the existing local SQLite database. If actual SQLite records later need transferring, migrate snapshots, revisions, receipts, and events together through a reviewed paused-write cutover.

Keep the preview application at one instance. PostgreSQL protects writes from independent stores, but current WebSocket broadcasts are process-local. Multiple API instances or a scoring worker will require shared delivery/fanout over the durable events, with reconnect recovery. Authentication, worker scheduling, and source ingestion remain separate product work.

## Validation and live acceptance

The complete suite runs with `TEST_DATABASE_URL` set to a disposable PostgreSQL 18 database and `npm run test:postgres`. Missing configuration fails rather than silently skipping database coverage. Normal `npm test` explicitly skips the integration cases when that variable is absent. All test schemas are independently named and removed by their owner.

Local integration checks used a real PostgreSQL 18 database. They cover simultaneous initialization, concurrent commands from separate stores, duplicate retries, no-op receipts, rollback after a late SQL failure, non-destructive migrations, private queue views, and persistent restart behavior. HTTP/WebSocket tests cover the async storage boundary and protected access. The actual hosted launcher is checked for configuration failures, credential-safe errors, and state retention after restart.

Chromium also exercised the PostgreSQL-backed application behind a local HTTPS terminator with real WSS connections. Two tabs synchronized without refresh. Custom position scoring, all ninety-six picks, final scores, and capture survived refresh and backend restart; the 390px view had no overflow or JavaScript errors. Temporary credentials, certificates, servers, and QA schemas were cleaned afterward. [Desktop capture](../validation/hosted-preview/postgres-capture.png), [after restart](../validation/hosted-preview/postgres-after-restart.png), and [mobile](../validation/hosted-preview/postgres-mobile.png) show that local rehearsal, not a live Render deployment.

Before calling the live preview ready, verify its HTTPS login prompt, Connected status, two-tab updates, mobile layout, and persistence after one live restart or redeploy. A successful local rehearsal does not validate the actual hosting account, database binding, TLS routing, or current charges.

## Configuration evidence

Official `render.com`/`vercel.com` pages were denied by the environment proxy, so current prices and exact signup/payment screens remain unverified. The following official public examples were successfully read through GitHub:

- [Native Node service](https://github.com/render-examples/express-hello-world/blob/main/render.yaml): service and build/start keys.
- [PostgreSQL connection binding](https://github.com/render-examples/django/blob/main/render.yaml): `fromDatabase` with `property: connectionString`.
- [PostgreSQL plan and private access](https://github.com/render-examples/wikijs/blob/master/render.yaml): `basic-256mb`, storage size, and `ipAllowList: []`.
- [PostgreSQL 18 configuration](https://github.com/render-examples/sim-on-render/blob/main/render.yaml): the selected database plan, major version 18, and connection binding.
- [External application URL](https://github.com/render-examples/9router-render-template/blob/main/render.yaml): `RENDER_EXTERNAL_URL`.

These sources verify the recipe's component shapes. Availability and charges still need dashboard validation before deployment.
