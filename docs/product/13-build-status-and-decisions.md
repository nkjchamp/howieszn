# Local foundation: implementation and next decisions

Status: working fixture product with React web, Expo/React Native, shared TypeScript rules, local SQLite, and a protected hosted PostgreSQL backend. The user deployed the [Render preview](https://howieszn-preview.onrender.com) and confirmed sign-in, Connected status, two-tab updates, and persistence after browser reload on November 11, 2026. This is user-reported live verification; automated live checks were blocked by the workspace's network policy. The [deployment guide](../deployment/hosted-preview.md) separates those results from the real PostgreSQL 18 local rehearsal. No production launch or environment publication is part of this work.

Run instructions are in the [repository README](../../README.md). The [technical plan](11-technical-plan.md) describes architectural boundaries; this report distinguishes executable behavior from future product scope.

The subsequent [draft hierarchy revision](15-draft-room-hierarchy.md) reorganizes the React workspace while preserving the draft command contract. It passed focused browser checks and web build/type checks locally. It requires a manual Render application deployment before live visual review; the user-verified results above refer to the preceding hosted revision.

## What works

| Journey | Current behavior | Boundary |
| --- | --- | --- |
| Configure | Persist league name, fifteen scoring statistics, fractional yardage, Base/position overrides, and a 24–48-hour correction setting | Team-owned fixture; full seven-step commissioner wizard remains a design study. Settings lock once drafting begins; live change governance is not decided |
| Draft | Sixteen team seats, six snake rounds, per-team private queues, explicit player/team confirmation, eligible autopick, pause/resume | Single fixed commissioner identity. Replay controls stand in for other managers. No production timer worker or manager-owned pool assignment |
| Manage teams | Six starting slots, legal flex matching, natural positions, empty slots, bench, and per-game locks | Native and web use the same rules. Rich cross-team shared-pool assignment is pending |
| Follow scoring | Replayed facts update scores through WebSocket snapshots; score explanations reconcile, including rounding | Fifteen normalized statistics, fictional participation/outcome facts, no live vendor integration |
| Advance and absorb | Explicit reasoned fixture settlement, atomic capture, historical lineup/score snapshots, immutable roster receipt, and four-round replay | Final unresolved ties need an explicit local replay winner/reason. That does not select a production tie fallback |
| Recover | Durable command receipts on both database adapters, revision checks, private queue filtering, restart recovery, reconnect snapshots, and uncertain-delivery confirmation | No production manager authentication, push service, horizontal fanout, or operational outbox delivery |

Capture depends on bench allocation, independently of ownership. Team-specific benches transfer with the whole defeated roster. Shared manager benches transfer only defeated starters; unstarted reserves remain with the manager. Core regressions cover both scopes, same-manager outcomes, and conservation of all ninety-six drafted assets. Historical receipt views use settlement snapshots rather than a team's changing current roster.

## Stat-correction contract and UX

Automatic winner/transfer changes require **both** gates:

1. Receipt is strictly before the configured deadline, calculated from the final NFL game's recorded round-completion timestamp. The supported range is 24–48 hours; 48 hours is a working local default.
2. The next NFL round has not begun: receipt is strictly before its first kickoff, and no game status establishes that play already started.

At either boundary or later, preserve the published winner, score snapshot, roster ownership, and later results. Missing authoritative completion/kickoff evidence also prevents an automatic reversal. Corrected facts remain available separately from the published result.

Web and native present a persistent in-app commissioner alert, the published versus proposed winner/scores, the reason automatic application stopped, and the deadline/next-round status. An early applied correction identifies changed advancement and asks managers to review affected next-round lineups. Reversal removes foreign lineup selections; it does not invent replacement starters or backfill historical decisions.

The local late-review action is **Keep published result**, with a required commissioner reason and durable audit record. Arbitrary late overrides, appeal/voting powers, push/email delivery, and an inbox with acknowledgement tracking remain separate work. A pending late correction prevents further replay advancement until reviewed; it does not freeze unrelated ongoing lineup edits. A new authoritative fact that restores the published result clears the obsolete pending proposal.

## Validation evidence

The following local checks passed during this implementation:

| Check | Result and scope |
| --- | --- |
| Workspace TypeScript checks | All six packages/apps pass |
| Domain tests | 23: draft/legal matching, position win bonuses, decimal reconciliation, locks, captures, early/late/boundary corrections, missing facts, schedule merge, and complete playoff replay |
| Shared client tests | 5: response validation, uncertain acknowledgements, exact command identity, malformed WebSocket frames, and response-body timeout |
| Server tests | 30: local and protected HTTP/WS behavior, async lifecycle, ten PostgreSQL adapter checks, and real PostgreSQL HTTP/WS integration. Covers migrations, concurrent writers, durable retries, rollback, privacy, and restart recovery |
| Native receipt tests | 3: later-loss history, shared-bench destination, and changed-winner guard |
| Hosted launcher tests | 3: invalid configuration cannot fall back to SQLite, database failures do not print credentials, and the PostgreSQL launcher preserves protected accepted state through restart |
| Web build | Production bundle generated successfully |
| Native exports | Android and iOS Metro/Hermes bundles generated successfully; no physical-device/simulator interaction test or signed distribution build |
| Actual browser/API scenarios | Desktop and 390px mobile-web layouts, immutable pick targets, cross-tab updates without refresh, stale form preservation/conflicts, correction comparisons, and shared/historical capture receipts |
| Lost acknowledgement | Browser intercepted a POST after server commit and WebSocket advancement, then dropped its HTTP response. Recovery reused the original command ID and revision; exactly one pick existed. Repeated for the mobile pick dialog with inputs preserved |
| Protected PostgreSQL HTTPS/WSS rehearsal | Chromium behind a local TLS terminator authenticated the site and WSS with cached Basic credentials. Two tabs synchronized; custom scoring, all 96 picks, and capture survived refresh and backend restart; the 390px layout fit with no JavaScript errors. This is not a live hosting deployment |

An independent engineering review reproduced and verified fixes for unrelated shared-reserve preservation on reversal, preloaded schedule duplication, obsolete correction warnings, uncertain-action identity, and historical capture receipts. This is local implementation evidence; it establishes no provider latency, production load capacity, accessibility conformance, or customer usability result.

Representative screenshots of the actual app are in [local validation](../validation/local-foundation/README.md). Earlier HTML prototypes remain separate design studies; their state does not flow into this app.

The complete suite comprises 64 checks when `TEST_DATABASE_URL` points to a disposable PostgreSQL 18 instance. `npm run test:postgres` requires that setting; ordinary `npm test` explicitly skips database integration cases if it is absent. PostgreSQL-backed [hosted rehearsal screenshots](../deployment/hosted-preview.md) are separate from a live hosting claim.

## Decisions and external gates

| Gate | What is still needed | Work that can continue |
| --- | --- | --- |
| Data provider and economics | Compare current official coverage, rights, delivery, corrections, and pricing before choosing. Public vendor destinations were denied by the environment proxy | Continue normalized fixture/replay contracts and coverage matrix in [14](14-sports-data-evaluation.md) |
| Live competition rules | Final tie fallback, survival measurement time, position participation rules for NFL win points, and late-review remedies | Use explicit fixture eligibility and reasoned replay decisions without claiming live defaults |
| Commissioner governance | Who can change strategic rules during competition, approvals, effective boundaries, appeals, and member notice | Preserve pre-draft rule editing and visible attributed local actions |
| Existing-league conversion | Authorized Yahoo/Sleeper/ESPN/niche samples and real pilot leagues' history acceptance sheets | Continue staged-import UX and [coverage investigation](04-history-migration.md); no importer exists yet |
| Real multiuser/mobile release | Authentication/membership, durable private subscriptions, operational timers, notification delivery, measured recovery targets, physical-device UX, and distribution configuration | Continue client task testing and shared component patterns |

The next useful product review is a full commissioner-to-draft-to-next-round rehearsal with this local build, followed by real commissioner usability sessions and authorized migration samples. Provider selection and a live pilot require their own evidence; a successful fixture replay does not establish readiness for a real season.
