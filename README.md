# Howieszn

Commissioner-first fantasy football, with React web and Expo/React Native clients sharing a TypeScript rules engine. Local development uses SQLite; the protected hosted preview uses PostgreSQL. Both use fictional NFL fixtures and a fixed commissioner identity, Alex. There is no live sports feed or production manager authentication.

## Run locally

Use Node **24.22.1** (`.nvmrc`) and npm.

```sh
npm ci
npm run dev
```

The web client listens on loopback port **5173**; the HTTP/WebSocket API listens on loopback port **4000**. The web development server proxies API requests and subscriptions. Stop both with Ctrl+C. `PORT` changes the API port; `HOWIESZN_API_TARGET` can override the web proxy target.

SQLite state, command receipts, and public activity persist in `.local/howieszn.sqlite`. Restarting retains the draft and results. To explore a fresh fixture without replacing existing work, stop the server and run with a different database path:

```sh
HOWIESZN_DB_PATH=/tmp/howieszn-another-preview.sqlite npm run dev
```

The API is a single-league local preview. Its actor is fixed on the server; changing a request body cannot impersonate a different manager. Keep this development API within the intended local development network.

## Native app

```sh
npm run dev:native
```

Expo starts Metro for the React Native app. The app's **Server** control changes its development API address; `apps/native/.env.example` documents the public endpoint variable. A physical phone needs an address that reaches the API machine, rather than the phone's own loopback address. `HOST` controls the API bind address when a reachable development interface is needed. Native clients use the same SQLite commands and WebSocket snapshots as web.

The native launcher stores Expo's local settings under `.local/expo-settings` without changing `HOME`. Local exports need no Expo account. iOS/Android bundles have been exported; physical-device and simulator interaction testing remains pending. These exports are JavaScript bundles, not signed installable/store releases.

## Protected hosted preview

Live preview: [howieszn-preview.onrender.com](https://howieszn-preview.onrender.com). The user verified sign-in, Connected status, two-tab updates, and saved state after reload. Access requires the preview credentials stored in Render.

The [hosted preview guide](docs/deployment/hosted-preview.md) describes a Render Node application with managed PostgreSQL and a generated preview password. [render.yaml](render.yaml) is the deployment recipe. `npm run preview` serves the built website, API, and WebSockets together and requires `DATABASE_URL` plus its password/origin settings before startup. The host supplies the database connection privately; it never belongs in the client bundle. Creating these files does not deploy or create billable resources.

## Try the working journey

1. In **Set Up**, save the league name, scoring, position overrides, and a 24–48-hour correction window. NFL team-win scoring starts disabled and is available to every natural position.
2. Start the **Draft room**, inspect the sixteen-team board, manage Alex's per-team queues, and confirm a player for the displayed team. Local replay controls can autopick or fill the other fixture teams.
3. In **My teams**, manage SFLEX/WR/RB/TE/DEF-K/FLEX and empty slots. Eligibility, duplicates, ownership, and game locks are checked by the server.
4. Use **Local replay controls** to play the sample round. **Matchups** explains points and pending facts; settling a replay requires a recorded reason.
5. Review the post-win roster receipt, then settle the remaining fixtures and advance. The expanded roster survives refresh and reconnect. Historical receipts remain intact after later elimination.

The local default has four managers controlling four teams each. The domain supports 2/4/8/16-manager fixtures; the UI does not yet expose a complete manager-count/invitation wizard. Shared-bench capture is implemented and tested in the domain, but ongoing manager-owned draft/assignment is outside this first client slice.

## Validation

```sh
npm run typecheck
npm test
npm run build
npm run export:native
```

The automated suite has **64 checks** across domain rules, transport, both database adapters, HTTP/WebSockets, native receipt reconstruction, and protected hosted startup. Database integration cases explicitly skip without `TEST_DATABASE_URL`. Set that variable to a disposable PostgreSQL 18 database and run `npm run test:postgres` for the complete suite; this command fails if the variable is missing. Tests create and remove their own isolated schemas. Never point the test suite at a live league database.

Browser scenarios also exercised desktop/mobile layouts, cross-tab updates, stale forms, corrections, lost acknowledgements, and the preview gate over HTTPS/WSS backed by real PostgreSQL. See the [implementation report](docs/product/13-build-status-and-decisions.md) for evidence and limitations.

## Structure and product work

| Path | Responsibility |
| --- | --- |
| `apps/web` | React/Vite commissioner, desktop draft, roster, matchup, and review screens |
| `apps/native` | Expo/React Native daily-use client |
| `apps/server` | Local SQLite and hosted PostgreSQL persistence, validated commands, and WebSocket recovery |
| `packages/domain` | Pure draft, eligibility, scoring, capture, and correction rules |
| `packages/client` | Shared typed transport, revision handling, and uncertain-command recovery |
| `packages/tokens` | Shared visual foundations; components remain platform-specific |
| `docs/product` | Brief, rules, UX walkthroughs, migration coverage, decisions, and build status |
| `docs/prototypes` | Earlier independent HTML design studies, separate from persisted app state |

Start with the [product index](docs/product/README.md), [technical plan](docs/product/11-technical-plan.md), and [current build status](docs/product/13-build-status-and-decisions.md). The larger scoring catalog, imports, social features, engagement currency, power-ups, invitations, auth, operational draft timers, production hosting, and live provider integration remain future work.

Provider selection is deliberately open. The [evaluation matrix](docs/product/14-sports-data-evaluation.md) records blocked official-page access and the evidence needed to compare coverage, rights, and pricing.
