# League lifecycle and exception handling

Working draft v0.1. This turns the [product brief](01-product-brief.md), [rules model](02-league-rules-model.md), and [playoff format](07-playoff-absorption.md) into behavior to specify, implement, and test. It does not settle the gameplay questions identified below. Existing prototype checks are not evidence of production readiness.

**Confirmed:** commissioner-configurable football leagues; mobile and desktop; history continuity; sixteen playoff teams across four rounds; team-owned/per-team drafting defaults; optional manager-owned pools; configurable benches; empty slots; same-manager opponents; natural-position scoring; starter-survival as the first default tiebreaker. Capture follows **bench allocation**, not ownership mode: a team-specific bench transfers with the entire defeated team; a shared manager bench stays with the manager and only the defeated team's starters transfer.

**Execution direction:** build a working local foundation alongside the remaining rules and UX work. Start with the default team-owned operational slice; retain shared-pool and engagement-economy contracts without presenting unimplemented behavior as ready.

## Lifecycle contract

League identity outlives a season. A season moves through **setup → published rules → draft → round preparation → live round → provisional result → settlement → advancement/absorption → next round → archive**. Published rules may have multiple effective versions. The real product must define authorized transitions, not infer them from whichever screen a person last opened.

Provisional totals can update immediately; advancement and roster transfer are separate consequential operations. A game being final does not itself establish fantasy settlement. A hold identifies a specific unresolved tie, data gap, or policy—not an unexplained spinner. Initial result-publication timing still needs definition; it must not be confused with the correction window below.

### Published-result corrections

Automatic correction of a winner and capture is allowed only while **both** gates remain open: the configured 24–48-hour window after round completion, and before the next round's first NFL kickoff. The proposed local fixture setting is 48 hours, configurable from 24 to 48; that working value is not an adopted universal default.

Inside those gates, recompute under the original rules, reverse the affected capture, and apply the corrected advancement/transfer atomically. Clear next-round lineup slots containing assets the team no longer owns; do not select replacement starters or optimize a lineup after the fact. Preserve the prior result and transfer history.

If the window closed or the next round began/completed, preserve the published competitive result and capture. Record the corrected facts and conflict, show a clear warning, and notify the commissioner for an explicit decision. Do not automatically backfill historical lineups or rewrite later rounds.

## Happy and unhappy paths

| Stage | Expected path | Exception and required response |
| --- | --- | --- |
| Create or return | Create a season inside the enduring league; resume saved setup | Interrupted setup resumes without duplicate leagues. Distinguish starting fresh from continuing an existing league. |
| Invite and join | Accept an invitation into the correct league and role | Expired, revoked, repeated, or wrong-account invitations explain the remedy. Acceptance cannot claim an already-owned team or expose another league's private data. Actual invitation rules remain to specify. |
| Membership | Assign manager ownership and commissioner capabilities | A departure preserves teams, draft picks, history, and ownership tenure. Suspend affected actions and expose reassignment to authorized commissioners; replacement authority and temporary management need a league policy. |
| History | Preview sources, map identities, approve a reconciled import | Partial data stays labeled. Missing is not zero. Reimport cannot duplicate records; conflicting evidence requires review. Do not rewrite official past results using current scoring. |
| Configure and publish | Select a supported template; customize; preview the constitution | Invalid combinations or unsupported required facts identify the precise gap. Preserve the draft. Do not publish a setting that cannot be enforced. Rules and member-facing summaries must agree. |
| Change rules | Create a version with an effective boundary and visible differences | A concurrent edit cannot silently overwrite another commissioner's version. Midround or retroactive changes need a selected authority/approval policy and explicit affected outcomes. |
| Prepare and draft | Establish team seats and draft destinations; confirm a legal pick | A timeout, disconnect, duplicate request, changed turn, unavailable player, or impossible roster fit receives a distinct outcome. Never redirect a confirmation to another team. Pause, offline, and pending are separate states. |
| Set lineups | Choose eligible starters; preserve allowed empty slots | Reject duplicate use, invalid positions, and locked-player edits with actionable reasons. Manager-owned round assignment and within-team lineup edits have separate deadlines. Unassigned shared-reserve eligibility remains open. |
| Follow games | Apply versioned facts and explain stats, position overrides, bonuses, and corrections | Mark stale feeds and unavailable facts. NFL byes yield no game stats; they are not elimination. Elimination stops future scoring, not already-earned points. Postponed/suspended game handling requires a declared policy. |
| Resolve a round | Compare fantasy totals and the configured tiebreak sequence | Use starting players for the default survival criterion. A tied survival count or same-manager tie must reach an explicit fallback; do not invent a winner. Survival measurement time and fallback are open. |
| Absorb and advance | Apply bench-based capture: whole team including its specific bench, or starters only when reserves use the shared manager bench | Advance and transfer atomically or neither. Retried events cannot capture twice. Preserve shared reserves; a same-manager match must not duplicate assets already owned by that manager. |
| Prepare next round | Show the expanded roster, natural positions, NFL status, and new lineup opportunities | Keep eliminated NFL players visible as unavailable for future points. Inherited bench depth does not create extra starters. Do not silently carry over an ineligible lineup; clarify auto-fill versus manager action. |
| Correct a result | Explain revised facts and evaluate both correction gates | Inside both gates, reverse/recompute the affected winner and capture, invalidating foreign next-round lineup slots only. Otherwise preserve published outcomes and warn/notify the commissioner. Do not freeze unrelated branches or silently repair lineups. |
| Close and archive | Preserve final standings, champions, rule versions, and league story | An unresolved result stays unresolved. Reopening an archived season needs attributable authority; it cannot erase the original record or recalculate other seasons. |

## Routine engineering handling

These are proposed implementation defaults with low strategic impact: authoritative server time and membership checks; stable identities; version checks on consequential commands; idempotency keys; transaction boundaries; private queue access; recovery from the last confirmed state; and accessible pending/rejected/accepted feedback. Preserve local browsing context, but never accept a stale local clock as permission to act.

Maintain separate records for asset ownership, bench allocation, round assignment, and starting-lineup placement. Retain inputs, completion/kickoff timestamps, and rule versions needed to reproduce scoring and correction eligibility. Repeated provider deliveries must not duplicate points, currency, picks, or transfers. Administrative adjustments record actor, reason, and before/after effects; support personnel should not settle disputes through invisible database edits.

## Community, currency, and trust

Discussion remains available when engagement rewards are disabled. Block/report controls and moderation must not silently award or revoke competitive currency. Keep message visibility, reward eligibility, and moderation outcomes distinct. Deleted or abusive contributions, repeated events, reciprocal reactions, and already-spent awards require defined ledger handling before rewards go live. Do not infer contribution quality from private conversations or raw message volume.

Notify people about consequential changes with links to the actual object. Late notifications cannot reopen expired actions. Managers need control over conversation noise; disabling social push notifications must not alter roster ownership or action permissions.

## Decisions needing input or evidence

| Priority | Unresolved question | Why it matters / independent progress |
| --- | --- | --- |
| Before live settlement | What authoritative signals establish round completion and initial result publication? | The correction gates are selected; confirm completion/kickoff facts and publish timing. The 48-hour local setting is proposed within the selected 24–48-hour range. |
| Before live competition | Survival measurement time and final tie fallback | All chosen criteria can still tie. Continue ordinary-result fixtures while leaving the final fallback configurable and unresolved. |
| Before manager-owned mode | What post-assignment movement can unassigned shared reserves perform? | Capture is resolved: shared-bench reserves stay with their manager. Define eligibility/locks without silently allowing cross-team moves after the selected deadline. |
| Before enabling team-win scoring | Participation eligibility for QB/RB/WR/TE/K/DEF, plus provider fact support | A nonplaying reserve or inactive player may otherwise earn unintended points. The editor alone does not establish executable eligibility. |
| Before live data/imports | Provider evaluation, coverage/rights, source access, and actual pilot history needs | Evaluate before selecting a provider. Continue fixtures; request only precise missing access through secure settings. No provider or cost is assumed. |

## Acceptance scenarios and gates

The first slice rehearses setup, draft, lineup locks, scoring, ordinary settlement, absorption, next-round lineup, and archive. Acceptance includes duplicate commands causing one outcome; stale-confirmation rejection; legal flex assignment; bye versus elimination; unresolved zero-score ties; departures preserving history; and duplicate-free imports.

Capture tests cross ownership mode with bench allocation, including same-manager opponents. Correction tests cover inside both gates; after the configured hour limit; before that limit but at/after next kickoff; a completed next round; and duplicate correction delivery. Only the first case can automatically reverse a winner/capture. It clears foreign next-lineup slots without choosing replacements; all late cases retain published outcomes with warnings and commissioner notification.

Before a real league depends on the slice, agree on the outstanding gameplay policies, validate required data and migration coverage, define measurable latency/recovery targets, and run the selected clients against authoritative persistence and concurrent actors. A passing fixture replay or attractive screen is progress, not evidence that these external or operational gates passed.
