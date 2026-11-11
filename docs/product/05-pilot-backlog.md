# Discovery and pilot backlog

Working draft v0.1. This is an ordered planning backlog, not a sprint commitment. Target readiness before the 2027 NFL season and participating leagues' drafts; consider an optional January 2027 NFL playoffs pilot. Exact release dates and delivery estimates are unset. Readiness takes precedence over either window. All items are **not started** unless explicitly described as a document produced in this foundation set; no product acceptance criteria have been tested.

## Delivery windows and scope

| Window | Intent | Readiness condition |
| --- | --- | --- |
| January 2027 NFL playoffs — optional | Small invited test of one explicit postseason format, desktop/mobile drafting, live scoring and explanations, and league interaction | Define the format and its NFL elimination/bye/replacement policies; verify postseason data, client distribution, permissions, draft recovery, and scoring/correction integrity. Enable only ready mechanics. |
| Before the 2027 NFL season and league draft dates — target | Established leagues can migrate, configure, draft, and operate the supported full-season experience | Meet the selected leagues' history criteria, core experience acceptance, data/operations requirements, and complete-season rehearsal gates below. |

The postseason pilot needs its own rulebook and selected subset of B1–B10; it is not contingent on completing every regular-season feature. Choose its supported clients and native test distribution explicitly, retaining desktop-optimized drafting as a requirement. Scope and a go/no-go review must be set before inviting a league to depend on it. Unready live behavior is a reason to run a disclosed prototype/replay study or skip January.

Use the [roster-absorption exploration](07-playoff-absorption.md) as a current configuration test case: sixteen teams, equally divided among 2/4/8/16 managers, across all four NFL rounds. The [local foundation](13-build-status-and-decisions.md) implements the team-owned fixture journey; shared-reserve eligibility, detailed movement overrides, final tie fallback, and live governance remain gates for their respective capabilities. Acceptance must distinguish default team-owned/per-team drafting, shared draft followed by assignment, and ongoing manager-owned mode. Team-owned reserves default to the team's bench; manager-owned reserves default to the manager's shared bench; test commissioner overrides for both. Team-specific benches transfer with the defeated roster; shared benches transfer only defeated starters, without taking another team's players or the whole manager pool. Test correction eligibility strictly before both the configured 24–48-hour deadline and next-round kickoff; later corrections preserve published outcomes and notify the commissioner. Test round-start team assignment separately from per-game starting-lineup changes, plus the commissioner option for later inter-team movement of unstarted players. Verify each selected tiebreaker, including a same-manager tie and tied survival counts. Test the combined Team Defense-or-Kicker slot, empty lineups, same-manager opponents, and rule/scoring changes under the selected change policy.

January cannot prove regular-season acquisition policies, full migration coverage, multiseason behavior, or season-long retention. Keep those gates on the regular-season plan. Neither window implies a commitment to ship every envisioned format or power-up.

## Milestone A — Validate the product definition

| ID | Work and dependency | Acceptance evidence |
| --- | --- | --- |
| A1 | Recruit reference leagues: Yahoo, Sleeper, ESPN, niche; obtain WTII rules | Record actual rulebooks, history needs, commissioner tasks, and member concerns with permission; identify migration dealbreakers for each. Recruitment is pending. |
| A2 | Walk through the [rules model](02-league-rules-model.md); depends on A1 | Map each required rule to supported concepts or an explicit gap. Resolve QB eligibility/timing, governance, corrections, and competition ties for the selected pilot. No bespoke staff code is needed to express an accepted pilot rule. |
| A3 | Investigate sports-data feasibility; can begin independently | Evidence-backed matrix for required facts, identifiers, revisions, live transport, historical access, latency, licensing, and cost. Missing snap/status data causes a rule redesign or blocker, not an invented fact. Sportradar is a candidate. |
| A4 | Investigate [migration routes](04-history-migration.md); depends on source access from A1 | Test representative authorized source samples; document actual season/field coverage and gaps. Each league has an agreed minimum-history acceptance sheet. |
| A5 | Test [three journeys](03-core-experiences.md) with commissioners and members | Produce interactive designs after concept review; observe end-to-end commissioner setup on desktop, rule comprehension, import reconciliation, a full desktop draft, a full mobile draft, cross-device recovery, and scoring explanation tasks. Test desktop-specific layouts and interactions on laptop and larger screens. Define completion/comprehension rubrics before sessions; record failures and revisions. Current text layouts are untested. |
| A6 | Select postseason and regular-season pilot scopes and architecture; depends on relevant evidence from A2–A5 | Record each window's enabled format, supported clients, history requirements, operational policies, app distribution route, provider choice, and remaining gaps. Set performance/recovery targets and separate go/no-go gates before engineering acceptance; do not treat optional January omissions as removed regular-season requirements. |

Deliverable at this milestone: a supported league definition and validated experience direction. An attractive prototype alone does not satisfy data or history feasibility.

## Milestone B — Proposed complete-season implementation backlog

These are candidate engineering epics for later authorization. Proposed scope is a redraft league with custom scoring; power-ups and additional formats are not implied commitments.

| ID | User outcome | Minimum acceptance criteria | Dependency |
| --- | --- | --- | --- |
| B1 | Enter the right league securely | Sign in and recover access; accept an invitation; permission checks prevent another team/member's restricted actions; imported historical people are not auto-created as active users | A6 |
| B2 | Bring the league's identity and history | Preview source coverage; resolve mappings; publish reviewed history; preserve source scores; distinguish missing data; safe reimport creates no duplicate seasons/results; meet that league's acceptance sheet | A4, B1 |
| B3 | Configure and publish a season | Complete commissioner setup on desktop, including rules, history review, schedule/draft settings, and publication; save/resume; validate combinations; preview QB bonus; publish matching constitution and member summary; retain version/diff; enforce chosen change policy | A2, B1 |
| B4 | Complete a snake draft on mobile and desktop | Desktop-specific room keeps board, player pool, queue, roster, and turn context available together at agreed laptop/desktop sizes; supports keyboard/mouse use and preserved search/selection context; a member completes the full draft without a phone. Mobile supports a complete draft too. Enforce turn and server clock; search/queue/autopick; duplicate or late requests resolve once; reconnect/switch devices without lost confirmed picks; commissioner pause/undo has visible effects | B1, B3 |
| B5 | Manage a legal lineup | Validate roster/position rules; enforce specified per-game lock and postponed-game policy; two devices converge; pending/rejected/accepted states are distinct; corrections are attributable | B3, B4 |
| B6 | Acquire and trade players fairly | Claims, FAAB budgets, ties, trade approvals, roster limits, and deadlines follow published policy; concurrent claims cannot award the same player twice; retries cannot duplicate budget changes | B3, B5 |
| B7 | Follow live scores and understand them | Provider events reconcile to exact rule breakdowns; duplicates and corrections are handled; reconnect recovers missed updates; both clients converge; stale data is visible; no hard refresh needed | A3, B3, B5 |
| B8 | Resolve standings and finish a season | Defined ties/playoff qualification work on fixtures; corrected results propagate under settlement policy; commissioner overrides are logged; final season becomes browsable history | B6, B7 |
| B9 | Receive useful communications and handle incidents | Notification deep links reach the relevant object; late/dismissed notifications do not permit expired actions; foreground resume recovers state; league rule/operation changes are visible | B1, B3–B8 |
| B10 | Participate in the league beyond roster management | League chat/peer discussion supports contributions and replies; members can distinguish conversation from official announcements, votes, and rule changes; define moderation, reporting, and notification controls before implementation. Exact chat/forum structure is open | B1, A5 |

Accessibility, native navigation, responsive web layouts, cross-device consistency, and observable failure states are acceptance requirements across B1–B10. Define numeric scoring freshness, recovery, and draft timing budgets in A6 based on provider capability and tested UX; they are unresolved launch prerequisites, not zero-latency promises.

## Milestone C — Expansion candidates

Prioritize using reference-league demand: auction (nomination/bids/budget/recovery); guillotine (elimination/ties/release timing); keeper/dynasty (ownership/rollover/future picks/offseason); experimental shop (currency/eligibility/modifier ordering); shareable templates; additional sports. Every module needs rule compatibility and correction behavior before release.

The insurance/shop experience belongs in early design testing even if it is excluded from the first operational pilot. This checks that the product vision is represented without making all mechanics launch dependencies.

Engagement rewards are a commissioner-controlled economy capability. Before enabling them: publish eligible activities, award timing and caps; show explainable credits and spending; deduplicate repeat events; define moderation/reversal behavior including already-spent points; prove that social features work with rewards off. Test for message farming and reaction collusion, and assess competitive balance for members with different availability. Specific earning rules and shop launch timing remain open.

## Regular-season readiness and evaluation

Before a live league depends on the product, demonstrate a full season rehearsal with desktop commissioner setup, selected rules, imported history, complete desktop and mobile drafting, cross-device recovery, lineup deadlines, waiver/trade contention, score corrections, playoffs, and archive closure. Desktop web is a required pilot client; explicitly select the native mobile targets. Record tested clients and scenarios; distinguish simulation from live provider evidence.

Unexplained score discrepancies, lost/duplicated picks, unauthorized actions, unreconciled required history, unsupported configured rules, and unresolved settlement policies block the pilot. Recruit and define acceptance for each actual league; the illustrative P1–P4 slots in the migration artifact are not recruited customers.

Evaluate commissioner assistance, completed manager tasks, disputes/interventions, weekly participation, and return intent. Establish numeric targets only once sample size and measurement are defined. Completing a replay or prototype task is not evidence of completing a live season.
