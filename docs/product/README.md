# Product foundation

Working product foundation. These documents guide product decisions, design exploration, and the user-authorized local implementation. Target: ready before the 2027 NFL season, with an optional January 2027 NFL playoffs pilot if ready. Exact release dates and delivery estimates remain unset; quality gates govern release. See the [repository README](../../README.md) to run the working local app.

The first audience is established friends leagues with unusual rules. Native mobile is the daily experience. Desktop web is a first-class experience for commissioner league setup, draft day for every member, and game-day power use. Its draft client must be designed specifically for desktop. League history is a migration requirement.

| Artifact | Purpose |
| --- | --- |
| [01 — Product brief](01-product-brief.md) | Audience, product promise, platform responsibilities, and success |
| [02 — League and rules model](02-league-rules-model.md) | Vocabulary, composition, lifecycle, and worked rule examples |
| [03 — Core experiences](03-core-experiences.md) | Three journeys, low-fidelity layouts, and failure states |
| [04 — History migration](04-history-migration.md) | Coverage investigation, paper import prototype, and per-league acceptance |
| [05 — Pilot backlog](05-pilot-backlog.md) | Ordered discovery work, proposed implementation scope, and acceptance criteria |
| [06 — Decisions and questions](06-decisions.md) | Confirmed requirements, recommendations, uncertainties, and next decisions |
| [07 — Playoff roster absorption](07-playoff-absorption.md) | Selected template defaults, commissioner options, and unresolved bracket/ownership boundaries |
| [08 — Commissioner setup walkthrough](08-commissioner-setup-walkthrough.md) | Seven setup screens, sample league, interactive design prototype, and review tasks |
| [09 — Draft-room walkthrough](09-draft-room-walkthrough.md) | Lobby, desktop draft room, mobile participation, pick confirmation, and simulated recovery |
| [10 — Lifecycle and exceptions](10-lifecycle-and-exceptions.md) | Happy/unhappy paths, capture boundaries, correction gates, and unresolved live policies |
| [11 — Technical plan](11-technical-plan.md) | Shared domain, React/React Native clients, commands, persistence, and production boundaries |
| [12 — Lineups and absorption](12-lineups-and-absorption.md) | Game-day design study and its relationship to current rules |
| [13 — Build status and decisions](13-build-status-and-decisions.md) | Implemented behavior, validation evidence, limitations, and next gates |
| [14 — Sports-data evaluation](14-sports-data-evaluation.md) | Provider evidence, pricing/rights comparison requirements, and blocked official-page access |

Start with the brief, then review the worked QB rule and import prototype. Those make the product's hardest decisions concrete. Review the backlog after those decisions; it is not a promise to build every listed capability.

## Status language

- **Confirmed:** explicitly requested or selected by the user.
- **Proposed:** a recommendation for discussion; not an approved policy or scope commitment.
- **Open:** a decision still needed.
- **Unverified:** a factual capability or assumption that needs evidence.

The import prototype uses fictional data; no importer has been implemented. The local application has automated domain/HTTP/WebSocket tests, fixture scoring/replay, browser scenario checks, and iOS/Android bundle exports; [13](13-build-status-and-decisions.md) records exact scope. No customer interviews, usability sessions, live provider integration, migration execution, production performance test, or physical-native-device interaction test has been conducted. WTII's actual rules have not been supplied. The linked Reddit discussion was inaccessible during the earlier planning session; no ideas here are attributed to it.

## Working practice

Keep rules, experience designs, and acceptance criteria aligned when a decision changes. Record substantive decisions in [06](06-decisions.md), including why and what evidence supported them. Preserve open questions rather than silently converting them into defaults. Completed planning work is distinct from validated product behavior.

The working app lives in `apps/` and `packages/`; these documents do not publish it or change environment configuration. The earlier [commissioner setup](../prototypes/commissioner-setup/index.html), [draft room](../prototypes/draft-room/index.html), and [game-day](../prototypes/game-day/index.html) prototypes are independent interactive design studies with no backend, persistent save, or live publication. Their fixture configurations are separate and are not imported into the application. Where their historical behavior differs from a later decision, the current rules and implementation report take precedence.
