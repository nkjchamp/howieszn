# Technical plan and first implementation boundary

Working implementation plan. React Native mobile and React web are confirmed, and the local foundation is implemented. The user subsequently selected Render with managed PostgreSQL for a protected hosted preview. Its adapter and deployment recipe are implemented and tested locally; account connection and live provisioning remain pending. Validation results belong in the implementation report. Nothing here establishes production launch, native-store distribution, purchased infrastructure, or live provider access.

Read with the [rules model](02-league-rules-model.md), [playoff format](07-playoff-absorption.md), [draft walkthrough](09-draft-room-walkthrough.md), and [decision register](06-decisions.md).

## Selected local structure and production direction

Use a TypeScript modular monolith with two clients. The local manifests select React 19.3, Vite 8.3.8 with its React plugin 6.3.0, Expo 58.0.24, and React Native 0.88.1. These are reversible engineering selections, not a vendor or hosting commitment. Vite keeps the authenticated web client straightforward; public content/server rendering could justify Next.js later. A production background worker remains part of the operational design.

| Boundary | Responsibility |
| --- | --- |
| `apps/native` | Native navigation, touch interactions, notifications, foreground recovery |
| `apps/web` | Commissioner setup, desktop drafting, dense game-day workspaces |
| `apps/server` | Local HTTP/WebSocket commands, subscriptions, persistence, fixture/replay ingestion; production authentication remains pending |
| `packages/domain` | Pure rules, roster eligibility, draft transitions, scoring explanations, settlement validation, and shared domain types |
| `packages/client` | Typed command/snapshot/recovery client shared by web and native |
| `packages/tokens` | Semantic visual tokens and shared vocabulary, with platform-specific components |

Domain functions receive explicit inputs, rule versions, and authoritative facts; they do not read browser state, wall clocks, secrets, or network APIs. Shared business behavior does not require identical screens. Existing HTML prototypes remain interaction references.

## Commands and durable state

The local adapter uses Node 24's SQLite support for league snapshots, command receipts, and a durable public event log, committed in one transaction. The hosted adapter uses PostgreSQL JSONB snapshots and async storage calls, preserving the same command contract. Both retain history and explicit settings through non-destructive migrations. A real PostgreSQL 18 instance validated hosted persistence, concurrent commands, retries, and rollback. A managed cloud database has not yet been provisioned.

PostgreSQL is the selected durable cloud store. Its commands acquire a league row lock, check existing receipts before stale revisions, and atomically write the next snapshot, receipt, and event. A schema-scoped advisory lock serializes migrations and seed creation across processes. Operational outbox delivery and shared fanout remain future work; current WebSocket broadcasts are process-local, so the preview runs one API instance. Redis may later support presence/fanout and must not be the only record of an accepted pick or ownership transfer.

Every mutation carries a command ID, expected version, and typed payload with its target. The local server selects a fixed fixture identity; production must derive the actor from authentication. Validate permissions/rules and record one outcome. Retries return the accepted receipt without another mutation; a reused ID with a different payload is rejected. A stale version returns a conflict and current state reference.

The local transaction commits state, receipt, and public event before broadcasting. Responses identify the committed revision. Reconnect can recover from durable revisions rather than relying on a previous broadcast. The production outbox must provide reliable delivery/retry across process failure. Consumers deduplicate; a timeout never proves a pick failed.

## Draft and realtime contract

The local domain enforces turn, team destination, player availability, and roster fit. Operational timing must also be server-authoritative. A pick references its displayed turn/destination; it cannot redirect when that context changes. Roster inspection and queue editing have separate targets. Validate complete SFLEX/FLEX matching rather than greedy placement.

Production timer expiry and manager picks must compete through that transaction boundary. A worker resumes deadlines after restart; pause/resume stores authoritative remaining time. Clients display a deadline/clock offset and never award picks from their own timer. A local manual-autopick control does not prove this timer service exists.

Use authenticated HTTP commands and WebSocket subscriptions for updates. Snapshots include entity versions, server time, and subscription cursors. Events include stream ID, sequence, entity version, and payload. Reconnect requests events after the last applied cursor; expired history requires a fresh snapshot. Apply duplicates once and detect gaps. Separate public league streams from manager-private queue streams so subscriptions cannot expose another manager's queue.

Native apps may be suspended. On foreground, reconcile pending command receipts and obtain current versions before enabling consequential actions. Push notifications link to the underlying object and cannot authorize an expired action. Offline research and clearly marked queue drafts can continue; picks and locked roster changes require server confirmation.

## Rules, sports facts, and scoring

Define a provider adapter for stable identities, schedules/status, stat revisions, participation facts, and NFL outcomes. A replay adapter emits the same normalized contract from fixtures. Sportradar is a candidate; coverage, transport, latency, historical rights, and redistribution costs remain unverified.

Retain source revision/provenance and ingestion time. Deduplicate deliveries and distinguish cumulative snapshots from stat deltas. Corrections supersede facts without erasing the audit trail. Unknown or delayed facts remain unknown; they are not zero.

A scoring calculation references a published ruleset, applicable position rules, player identity, game facts, lineup snapshot, and calculation revision. Natural position determines QB/RB/WR/TE/K/DEF scoring; SFLEX/FLEX remain lineup slots. Untouched rules inherit Base; the current prototype's position override snapshots that rule's value and enabled state. Reset restores inheritance. Explicit reception premiums stack once.

Use decimal or scaled-integer arithmetic with a defined rounding boundary. Generate totals and explanations together. NFL team-win eligibility for different positions, measurement times, rounding policies, and settlement remain product decisions. Unsupported configured rules produce an actionable configuration error; an optional unresolved module need not block the default team-owned development slice.

## Lineups, settlement, and absorption

Represent ownership, reserve allocation, round eligibility, and starting slots separately. Commands check ownership, slot eligibility, player uniqueness, game locks, and ruleset applicability atomically. The default manager-owned round-assignment deadline is distinct from subsequent within-team lineup changes. Store lock facts and lineup revisions for replay.

Settlement validates result/ruleset revisions, tiebreak evidence, transfer scope, and dependencies. Capture is now selected independently of roster ownership: a team-specific bench transfers with the defeated team's whole roster; a shared manager bench transfers only that team's round starters. Non-starting shared reserves remain with their manager. In one transaction, advance the winner, transfer eligible assets, record provenance, and emit state. Retry cannot duplicate assets; partial transfers are never visible.

The selected correction direction permits automatic affected-result/transfer updates only inside the configured 24–48-hour cutoff **and before next-round kickoff**. The local fixture uses 48 hours as its working default. Beyond either boundary, preserve the published outcome and route the correction to commissioner review. Keep publication snapshots separate from newly corrected facts. Track the affected dependency chain; never silently rewrite later usage of captured players. Exact cutoff timestamps and review powers require a documented contract. The final tiebreak fallback remains open.

## Supporting modules and data protection

Authentication and authorization are server-side. Treat manager identity, league membership, ownership tenure, and commissioner powers separately. A local fixture identity is not production authentication. Validate subscription membership, invitation acceptance, uploads, and role changes. Keep credentials in environment bindings; never save secret values in fixtures or setup instructions.

Schema changes use explicit migrations and reproducible fixture seeds. Imported history remains staged until reviewed, with source identifiers, mappings, completeness, and batch receipts. Reimport updates records idempotently and retains revisions. Published official seasons do not recalculate under today's scoring rules.

Chat, engagement awards, and currency have independent permissions and ledgers. An award references its activity/rule version; retries cannot grant another credit. Currency spending and inventory resolution must be transactional before power-ups affect scores. Moderation and reversal rules require separate product decisions.

## Delivery and validation

The implemented team-owned slice covers configuration → deterministic draft → lineup lock → replayed scoring → explained result → reviewed absorption → next-round roster. Both SQLite and PostgreSQL persistence, concurrent clients, protected HTTPS/WSS, and restart recovery have been exercised locally. Follow the [hosted deployment guide](../deployment/hosted-preview.md) for Render account handoff and live acceptance. Keep unresolved policies explicit, validate native devices, and integrate authorized sports-data and migration sources before a real pilot.

Meaningful checks include golden scoring examples; overlapping-slot roster matching; duplicate/stale commands; simultaneous picks; expiry/pause races; process restart recovery; private subscription access; correction replay; and atomic absorption retries. Browser/device tests must exercise complete tasks. Set measurable freshness, recovery, and draft timing budgets before live acceptance; no performance result is claimed.

External prerequisites are provider access/licensing, authorized migration samples, pilot commissioners/rules, production identity configuration, and native distribution accounts. Provider/pricing comparison is required before selection; see [sports-data evaluation](14-sports-data-evaluation.md). Independent domain/replay work proceeds with labeled fixtures. A successful replay, local WebSocket, or native build does not establish a live-sports-ready platform.
