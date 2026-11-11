# Decisions, assumptions, and open questions

Working draft v0.1. Confirmed means explicitly requested by the user; proposed means a recommendation still subject to review. This register should change as evidence arrives.

## Confirmed product requirements

| ID | Requirement | Basis |
| --- | --- | --- |
| C1 | Commissioner-first fantasy platform, starting with football | Initial product request |
| C2 | Established friends leagues with fun/unusual rules are the initial audience | User's audience selection |
| C3 | League history migration is essential to conversion; investigate Yahoo, Sleeper, ESPN, and niche sources | User's migration requirement |
| C4 | Native mobile app using React Native plus React web | Explicit platform direction |
| C5 | Mobile gets most daily activity; desktop is essential for commissioner league setup, draft day for all members, and game-day power use | Explicit usage direction and desktop clarification |
| C6 | Live scoring without hard refresh; full drafting on mobile and desktop, with a draft client optimized specifically for desktop | Initial product request and desktop clarification |
| C7 | Custom scoring and optional currency/shop/power-ups belong to the vision | Initial examples; exact semantics and release scope not selected |
| C8 | Product taste and UX are central; aim to be ready before the next NFL season, with an optional upcoming January playoffs pilot; do not rush an unready release | Latest timing clarification supersedes the earlier no-deadline selection; working calendar interpretation is January 2027 and the 2027 season |
| C9 | Current work includes a working local product foundation alongside ongoing rules and UX work | User selected this deliverable and authorized routine implementation judgment; supersedes planning-only scope |
| C10 | Support social expression and engagement through league chat or peer-to-peer forum-style discussion, with Sleeper as a reference | User's clarification of the friends-league scenario |
| C11 | Commissioners may make engagement a substantial source of league points for power-up access; optional per league | User's engagement-based earning direction |
| C12 | Postseason absorption template defaults to team-owned rosters and per-team drafting; commissioners can configure shared-pool alternatives, including pool draft then assignment into team ownership | Latest explicit defaults; see [07](07-playoff-absorption.md) |
| C13 | Team-owned reserves default to the team's specific bench; manager-owned reserves default to the manager's shared bench; both are commissioner-configurable. Use a Team Defense-or-Kicker slot, allow empty slots, and allow same-manager bracket opponents | Reserve clarification; capture is resolved in C24, detailed cross-team movement remains open |
| C14 | Commissioners can enable, disable, and change supported mechanics and fantasy scoring to shape strategy | User's configuration requirement; timing/approval policy not yet selected |
| C15 | Sixteen bracket teams across four NFL rounds, split equally among 2, 4, 8, or 16 managers | Latest explicit bracket clarification supersedes the earlier eight-manager cap |
| C16 | In manager-owned mode, team rosters are set before the round's first NFL game by default; within-team starter/bench changes remain available subject to game locks; commissioner can allow later cross-team moves for unstarted players | Latest movement and assignment clarification; shared-reserve eligibility and override details still open |
| C17 | Default first tiebreaker is **Starting Players still in NFL Playoffs**; commissioner-selectable alternatives include cumulative team or manager fantasy points | Starter-only scope and first criterion selected; measurement time and later fallback remain open; correction direction selected in C25 |
| C18 | Use a design system as the product develops, consistently applying design principles and reusable foundations/components/patterns; implementation need not happen immediately | User's design-system requirement and supplied references; no system selected |
| C19 | Call bracket participants teams; distinguish managers from the teams they control; use team-owned and per-team terminology | User's terminology change |
| C20 | Setup order: Set Up, Rosters & Draft, Managers, Timing, Scoring & Ties, See a round, Review. League Name belongs in Set Up; Managers focuses on count and future invitations | Latest setup walkthrough feedback; prototype does not send invitations |
| C21 | Scoring editor groups Passing, Rushing, Receiving, Kicking, Team Defense, Team results, Misc, and Custom with enable toggles, preset/custom values, yardage ratios, advanced bonuses, fractional/negative points, and positional reception premiums | User's Yahoo references and scoring requirements, with Team results added by the later position-scoring clarification; rates and source-data coverage remain unverified |
| C22 | Use SFLEX for the superflex lineup slot; View full new roster shows all original and inherited players at natural positions | Latest walkthrough feedback; QB/WR/DEF/K identify assets separately from lineup slots |
| C23 | NFL team-win points belong in custom position scoring and must be configurable for all supported positions, including QB/RB/WR/TE/K/DEF, rather than a standalone QB league bonus | User clarification; Base inheritance/whole-rule overrides are the prototype design, initial off/+5 values are illustrative, and participation/data semantics remain open |
| C24 | Capture follows bench allocation independently of ownership: a team-specific bench transfers with the whole defeated roster; a shared manager bench transfers only the defeated starters | User's explicit answer; non-starting shared reserves remain with their manager |
| C25 | Automatic result-changing corrections may reverse the affected transfer only within a configured 24–48-hour period after the previous NFL round completes and before the next NFL round starts. Otherwise preserve published outcomes and ownership, clearly warn, and notify the commissioner for an attributed decision | Latest clarification supersedes earlier automatic recomputation of already-played rounds; see [10](10-lifecycle-and-exceptions.md) |
| C26 | Evaluate data providers and pricing before selecting a provider | User's explicit answer; no existing Sportradar contract assumed |
| C27 | Prepare a protected hosted preview reachable from the user's browser | User selected hosted preview after this chat's cloud viewer proved inaccessible; no current hosting account, prior Vercel experience. Hosting charges and account access remain external prerequisites |
| C28 | Use Render with managed PostgreSQL for the first lasting cloud environment, initially serving React and the API together | User approved the architecture after comparing setup effort and future needs. The local SQLite workflow remains available; hosting account connection and displayed charges are user steps |

## Proposed decisions

| ID | Recommendation | Rationale / evidence still needed |
| --- | --- | --- |
| P1 | Target complete redraft + custom scoring + history for the regular-season release; investigate a separate bounded postseason pilot | Validate against actual leagues; January's format and smaller scope must be selected independently |
| P2 | Treat formats as composable modules with explicit compatibility | Supports mixed league rules; prove using real unusual leagues |
| P3 | Share business models, command client, and semantic design tokens; tailor native/web interactions | Local React/React Native implementation and fixture checks now exist; physical-device and live acceptance remain pending |
| P4 | Use versioned rules, readable constitution, and visible interventions | Explainability and accountability; governance policy open |
| P5 | Use noncash league-local currency separate from FAAB | Legible first experiment; earning, cost, expiry, and transfer rules open |
| P6 | Explore predeclared inactive-player insurance before midgame replacement or opponent debuffs | Smaller timing/eligibility surface; data and fairness unverified |
| P7 | Preserve imported official outcomes and label partial archives | Retains continuity without inventing facts; source tests pending |
| P8 | Use Expo/React Native for iOS/Android, React/Vite web, shared TypeScript domain, and one Node backend | Engineering selections in [11](11-technical-plan.md); SQLite and PostgreSQL adapters are implemented, with production outbox/fanout still future work |
| P9 | Reward bounded meaningful participation, with caps and an explainable ledger, rather than unlimited message volume | Encourage engagement without spam incentives; exact policy and balance need validation |
| P10 | In the team-owned draft concept, use sixteen team seats, six snake rounds, per-team queues, and queue-first eligible autopick | Proposed draft interaction design in [09](09-draft-room-walkthrough.md); draft order, timeout policy, and roster/pass rules need commissioner validation |
| P11 | Use 48 hours as the local correction-window default, editable from 24 to 48 before drafting | Working default within C25's selected range; window starts at the final NFL game's completion and closes strictly at the earlier of its deadline or next-round kickoff |

## Open decisions, ordered by impact

| ID | Question | Next evidence / owner |
| --- | --- | --- |
| O1 | What exact WTII rules and exceptions must we represent? | Commissioner supplies rulebook/examples; PM maps gaps |
| O2 | Which real leagues are our reference/pilot partners, and what history is non-negotiable for each? | PM recruits; commissioner completes migration acceptance sheet |
| O3 | What facts, live delivery, corrections, historical access, and rights can the data provider supply? | Engineering/provider investigation; no credentials requested yet |
| O4 | What can each source platform actually export or expose, for which years and fields? | Authorized sample-based migration investigation |
| O5 | Who can change rules, when, with what approvals and appeal process? | Commissioner scenarios and member trust research |
| O6 | What are position-specific NFL team-win eligibility/participation requirements, modifier ordering, rounding, and fantasy settlement policies? | Work through QB and other natural-position examples in the rules model, particularly K/DEF; scoring editor availability is not provider verification |
| O7 | Which roster, lineup lock, waiver, trade, tie, and playoff policies are needed in the first pilot? | Actual league requirements before scope selection |
| O8 | Which advanced authoring tasks can be desktop-first, and what must work fully on mobile? | Journey tests with commissioners |
| O9 | What live freshness/recovery/draft timing budgets and notification behavior are acceptable? | Provider capability + UX tests; set before implementation acceptance |
| O10 | What are pricing, data economics, and distribution plans? | Commercial research after initial audience/value evidence; no business model selected |
| O11 | Which engagement activities earn points, in what amounts, with what caps, moderation/reversal rules, and impact on competition? | Commissioner configuration scenarios and member incentive testing |
| O12 | How should chat, threaded discussion, reactions, announcements, and notification controls fit together? | Social interaction prototypes; no exact Sleeper feature parity implied |
| O13 | What postseason format, pilot group, clients, feature subset, and go/no-go review make a January 2027 test useful and safe to depend on? | PM and pilot commissioner define rules and acceptance; engineering verifies data and distribution feasibility |
| O15 | How are reserve limits, unassigned shared-reserve eligibility, movement override details, initial shared-draft assignment, and in-competition rule changes resolved? | Round-start assignment and bench-based capture are selected; walk through remaining policies in [07](07-playoff-absorption.md) |
| O16 | What are the survival measurement time, cumulative-point scopes, later tiebreak priority/fallback, and available commissioner remedies for a late correction? | Correction gates are selected in C25. The local slice supports an attributed keep-published decision; late override/appeal powers require further design |
| O17 | Which design-system foundations and libraries fit our visual direction, accessibility requirements, React Native, and React web? | Evaluate user-supplied references in the [product brief](01-product-brief.md) alongside core journey designs before adoption |
| O18 | What draft seat allocation, queue defaults, timer policy, legal-pick/pass rules, and undo/dependent-pick behavior should the operational draft support? | Validate the proposed team-owned experience in [09](09-draft-room-walkthrough.md); shared-manager-pool drafting remains a later design |

## Resolved questions

| ID | Resolution | Basis |
| --- | --- | --- |
| O14 | Sixteen teams across four rounds, equally allocated among 2/4/8/16 managers | Latest user clarification; C15 |
| P12 | Render application plus managed PostgreSQL; local SQLite retained | Approved by user as C28; implementation and recipe are in the [deployment guide](../deployment/hosted-preview.md) |

## Evidence boundaries

No current source-platform capability, sports-data contract, performance result, customer interview, or pilot commitment has been verified. WTII's contents are unavailable in this workspace. Earlier Reddit access failed; it is not a research source for these artifacts. Yahoo/Sleeper/ESPN are target sources and competitive benchmarks, not verified feature inventories.

When resolving an item, record the decision, reason, evidence, affected documents, and remaining uncertainty. Do not describe a hypothetical scoring example, paper prototype, or written acceptance criterion as a tested capability.
