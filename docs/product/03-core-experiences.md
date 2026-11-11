# Core experiences and prototype plan

Prototype these experiences before implementation. Related: [product brief](01-product-brief.md), [league rules model](02-league-rules-model.md), [history migration](04-history-migration.md), [pilot backlog](05-pilot-backlog.md), and [decisions](06-decisions.md).

## Constraints and working recommendations

Confirmed constraints: native mobile supports daily play. Desktop React web is essential for commissioner league setup, draft day for every member, and game-day power use. The desktop draft room must be optimized specifically for desktop. Both clients need complete drafts and live scores without manual refresh. Custom rules must remain understandable.

Recommendation: React Native with native interactions. Share rule meaning, permissions, deadlines, and confirmed state across clients. Advanced authoring and import reconciliation can be desktop-first; urgent commissioner actions remain usable on mobile.

These are untested hypotheses; no user research has been performed. Wireframes describe information priority, use fictional sample counts, and are noninteractive. They are not evidence of supported connectors or implemented screens.

## J1: Bring an existing league forward and publish a rule

**Scenario:** Import history, resolve identities, and propose a five-point starting-QB team-win bonus. This illustrates a rule, not a confirmed scoring specification.

Journey:

1. Choose a supported source or manual history entry. Explain supported records and limitations before import.
2. Preview seasons, managers, teams, and missing fields. Map a renamed franchise to its continuing identity; keep ownership history separate.
3. Resolve conflicts without overwriting existing records. Preserve source provenance and mark unknown facts explicitly.
4. Start a new season from a template. Add the QB bonus and define eligibility, ties, inactive players, corrections, and when it becomes effective.
5. Simulate illustrative outcomes. Compare totals with and without the rule; show the precise qualifying event.
6. Review the generated constitution and changes summary. Publish a version, then invite members to read the league's differences.

Social extension: discuss the proposed scoring rule in a league conversation with replies/reactions and a linked rule preview. Members should be able to ask questions and express themselves without confusing discussion with an official vote or published rule change. Chat versus threaded forum organization remains a design question.

Mobile / React Native:

```text
League setup                     Step 3 of 5
History: 8 seasons | 2 unresolved mappings
[Review mappings]
Scoring: QB team-win bonus        +5 proposed
[View examples]  [Edit essentials]
Next: Review season rules
```

Desktop / React web:

```text
Setup steps | Import / rule editor | Outcome preview
History     | Manager mappings     | Missing / conflicts
Rules       | QB win bonus +5      | Before → after points
Review      | Effective season     | Member-facing summary
                       [Save draft] [Review publication]
```

Required states: empty history, importing, partial success, conflict, unsupported field, saved draft, invalid rule, publishing, published. Keep historical rules attached to their original seasons; a new rule must not silently recalculate imported results. Publication failure retains the draft and reports whether anything became effective.

Acceptance: the commissioner can complete league setup on desktop, including history review, rules, draft/schedule settings, and publication. They can explain what transferred, identify unresolved records, and predict the bonus in a sample matchup. A member can locate the effective rule version. Invalid or ambiguous eligibility prevents publication with a specific repair path.

## J2: Draft in a desktop-optimized room, participate fully on mobile, and recover across devices

Detailed design artifact: [draft-room walkthrough and prototype](09-draft-room-walkthrough.md).

**Scenarios:** A member prepares for and completes the entire draft on desktop. A second member drafts entirely on mobile. Either can disconnect near a turn and resume on the other device. Desktop drafting is a primary journey for all members, independent of cross-device recovery. Snake and auction require distinct picking and bidding interactions. Auction is design exploration, not committed pilot scope.

Journey:

1. Enter the room; confirm league rules, draft type, connection, queue, and autopick behavior.
2. Search or filter players while keeping turn status and roster needs visible.
3. Submit a selection or bid. Show pending acknowledgement separately from acceptance.
4. Lose connection. Preserve the queue locally, label unsynced edits, identify stale information, and avoid presenting the local timer as authoritative.
5. Reconnect or change devices. Reconcile accepted actions, elapsed turns, and current availability before enabling further submissions. Offline queue edits are not advertised as synced to another device.
6. Explain any autopick, rejected action, commissioner pause, or correction through room history.

Mobile / React Native:

```text
Round 4 • Your turn • 00:24       Connected
Players | Queue (6) | My roster
Player name / position / availability
Selected player details
[Confirm pick]                   Sticky action
```

Desktop / React web:

```text
League • Turn / timer • Connection • Pause status
Draft board | Searchable players | Queue + roster
            | Selection / bid    | Budget if auction
Player detail / comparison stays beside the selection
Room history: accepted picks, pauses, corrections
```

Desktop interaction requirements: at the agreed laptop and larger-screen sizes, keep turn/clock status visible alongside the draft board, player pool, queue, and roster. Use the available width with legible information density and independently scrollable panels. Support keyboard navigation, predictable focus, and queue reordering without drag-only controls. Searching or inspecting a player must preserve filters, scroll positions, and pick context. Make the selection and confirmation target explicit to prevent accidental picks. Commissioners have clearly distinguished room controls. Exact breakpoints and panel sizing remain design work.

Required states: waiting, on deck, active turn, pending submission, accepted, rejected, reconnecting, stale, paused, completed. Auction additionally distinguishes nomination, leading bid, outbid, and settled purchase. Show the accepted pick or winning bid once, including after a retry.

Postseason multi-team extension: follow the selected [ownership and draft destination](07-playoff-absorption.md). Per-team drafting needs an unmistakable pick destination and separate rosters. Shared-pool drafting needs an assignment step before team ownership begins. Show the configured reserve allocation: team-owned mode defaults to team-specific benches; manager-owned mode defaults to a manager-wide shared bench. Both defaults are commissioner-configurable. These configurations must not look interchangeable or imply that one asset can start in multiple teams.

For manager-owned round preparation, show the sixteen teams grouped by manager, the round-assignment deadline, and each team's eligible roster. After the first NFL game starts, the default UI locks cross-team assignment while retaining within-team starter/bench changes for unlocked players. A commissioner-selected later-transfer policy must show its actual eligibility instead. Display configured tiebreak criteria with matchup results; do not label stat-correction settlement complete merely because a tie was resolved.

Acceptance: a member can research, queue, select, and complete a draft entirely on desktop without a phone or losing the visible turn context. Test laptop and larger desktop layouts with mouse and keyboard, including simultaneous board/player/queue/roster use. A member can also complete the draft entirely on mobile. Switching devices preserves confirmed queue order and draft state. A timeout cannot create a false success. A corrected pick visibly updates the board, roster, and history. Managers can distinguish a paused room from a lost connection.

## J3: Understand a live score and apply an optional modifier

**Scenario:** A manager investigates a custom scoring bonus during Sunday play. A separate prototype explores bench insurance; inclusion in the pilot remains undecided.

Journey:

1. Open the relevant matchup from a notification or league home.
2. Inspect base statistics, rule bonuses, pending conditions, and official corrections.
3. For the optional prototype, prepare a predeclared bench replacement. Follow the [rules model's](02-league-rules-model.md) earlier-kickoff deadline and eligibility. Insurance triggers only for the specified pregame inactive status; it does not permit a midgame substitution.
4. Preview eligibility, cost, lock time, and scoring consequence before confirming. Charge/reservation timing remains an open policy and must be resolved before an interactive prototype promises it.
5. Follow activation or rejection in the matchup explanation and league activity history.

Engagement extension, when enabled by the commissioner: from league discussion or an eligible activity, show a concise award receipt linked to the earning rule and league-points ledger. The balance leads to eligible shop items. Use distinct labels for fantasy score and league points. Show award caps and pending/reversed awards in context; avoid an intrusive reward prompt on every message. Discussion remains usable when earning is disabled. Exact earning activities and amounts are undecided.

Mobile / React Native:

```text
My matchup                    Live • updated now
My total                       Opponent total
QB score → Base | Bonus | Corrections
Insurance: declared / locked / triggered
[View rule and activity]
```

Desktop / React web:

```text
League / matchups | Selected matchup | Score explanation
Standings        | Both rosters      | Events + rule version
Game statuses    | Live totals       | Modifier / correction
```

Required states: live, delayed feed, reconnecting, suspended game, pending bonus, provisional result, corrected result, and finalized result. Display last confirmed update when stale. A suspended game follows the league's published policy; the interface must not invent a resolution. Corrections retain an explanation and attribution.

Acceptance: a manager can reconcile a displayed score, identify provisional points, and understand why a modifier was accepted or rejected. Ineligible or late insurance declarations cannot appear successful.

## Validation and accessibility

Test with commissioners and managers on phone and desktop: predict an outcome, recover an interruption, explain a discrepancy, participate in a league conversation, and distinguish an engagement award from fantasy scoring. For the optional economy, test whether people understand eligibility/caps and whether earning encourages meaningful participation. Define task completion/comprehension rubrics before sessions. Record completion, errors, misunderstood rules, and confidence; set pilot thresholds after baseline observation.

Support screen readers, keyboard navigation, visible focus, large text, sufficient contrast, reduced motion, and generous touch targets. Never rely on color alone. Announce meaningful changes without reading every scoring event; preserve focus during updates. Validate draft actions with assistive technology.
