# League and rules model

Domain model v0.2. This describes the wider product; the [shared local rules implementation](../../packages/domain/src/index.ts) and [working React app](../../apps/web/src/App.tsx) implement a bounded subset. Policy choices are proposed unless explicitly confirmed here or in the [decision register](06-decisions.md).

## Stable vocabulary

| Concept | Meaning and boundary |
| --- | --- |
| League | Persistent community and identity across seasons and platforms |
| Season | Competition with defined participants, schedule, rules, and results |
| Franchise | Competitive identity that may persist across seasons; continuity is commissioner-confirmed |
| Season team | A franchise's display name, roster, and results for one season |
| Bracket team | A distinct competing team; one manager may control several, with configurable team-owned rosters or a manager-owned pool |
| Person and membership | A participant and their season/league permissions; an imported historical person need not have an account |
| Ownership tenure | Who controlled a franchise during a period, including co-managers and replacements |
| Ruleset version | Published rules with explicit applicability and effective boundaries |
| Sports event and fact | Provider-identified game, player, stat, result, or status, with revisions and provenance |
| League event | Recorded pick, roster action, scoring adjustment, governance action, or modifier resolution |
| Engagement activity and point award | League-scoped participation and any resulting currency ledger entry; separate from fantasy scoring |
| Historical record | Imported official fact or archive item with source, completeness, and review status |

One league has seasons; each season has teams and rules. A franchise may have many season teams and ownership tenures. Names alone never establish identity. Provider IDs are mapped to internal sports identities; external league/team IDs are scoped to source and season.

## Compose a league

| Dimension | Examples | Compatibility questions |
| --- | --- | --- |
| Roster lifecycle | Redraft, keeper, dynasty | What survives rollover? Who owns future draft picks? |
| Acquisition | Snake, auction, waivers, FAAB, trades | When do players lock and budgets settle? |
| Competition | Head-to-head, points, guillotine | How are ties, eliminations, and playoff qualification resolved? |
| Scoring | Stat rates, thresholds, position bonuses, team outcomes | Which facts qualify and when are points final? |
| Optional mechanics | Currency, shops, power-ups | Eligibility, timing, stacking, counterplay, and correction behavior? |

Templates are named configurations of these dimensions. Each selected module needs a declared compatibility contract. Unsupported combinations should be explained before publication; a selectable setting is a promise the product can enforce.

The [playoff roster-absorption format](07-playoff-absorption.md) makes roster ownership and draft destination independent settings. Its selected defaults are team-owned rosters and drafting per team; a commissioner can instead enable a shared draft pool followed by assignment into team-owned rosters, or ongoing manager-owned pools. Reserve allocation is commissioner-configurable: team-owned mode defaults to each team's specific bench; manager-owned mode defaults to the manager's shared bench. **Capture follows bench allocation, not ownership mode:** a team-specific bench transfers with the entire defeated roster; with a shared manager bench, only the losing team's starters transfer and reserves stay with the manager. Manager-owned round rosters must be set before the first game by default; within-team lineup edits still follow player game locks. Commissioners can permit later inter-team moves for unstarted players; detailed movement overrides remain to specify.

League chat/discussion supports community regardless of whether the league enables engagement rewards. Selecting a shop does not silently enable engagement-based earning, and disabling the economy does not remove social participation.

## Season lifecycle and authority

Proposed lifecycle: **setup → rules published → draft → active competition → settlement → archived**. Offseason and multiseason rollover need additional definition before keeper/dynasty scope is approved. Returning to setup or reopening settlement is an explicit, logged action.

Draft configurations are editable. Commissioners must be able to enable, disable, and adjust supported mechanics and fantasy-scoring settings, including choices that change strategy. Published versions are retained. Proposed change handling: a new version with a diff, effective boundary, audience notification, and any league-required approval. Prospective rule changes are a proposed default; rule-change powers, voting thresholds, and appeal windows remain open. Official-stat corrections to playoff results and captures follow the confirmed cutoff policy below rather than an unrestricted retroactive-change permission.

Members act on their own teams within league policy. Commissioners administer league operations. Co-commissioner, co-manager, and spectator permissions need an explicit capability matrix before implementation. Commissioner interventions record actor, reason, before/after state, and affected outcomes; historical facts are not silently rewritten.

## A rule's product contract

Every executable rule declares: subject; eligible participants; triggering fact; conditions; amount/effect; action window; effective version; resolution order; visibility; and correction/settlement behavior. The readable constitution and score explanation derive from this same definition. Illustrative previews must say whether their data is synthetic or historical.

### Worked example: position-specific NFL team-win scoring

**Confirmed scoring model:** NFL team-win points are an ordinary scoring rule available to QB, RB, WR, TE, K, and DEF. Present the rule as **Team results → NFL team wins**, not a standalone Custom league bonus. Base rules apply to all natural positions, with commissioner-enabled position overrides for a stat's amount, enabled state, or both; rules without an override inherit Base. In this prototype, editing a rule creates a position-specific copy of its enabled state and amount; untouched rules continue inheriting later Base changes. Resetting a position rule to Base removes its override. SFLEX and FLEX are lineup slots, not scoring positions.

The rule is initially off in Base and every position. No five-point value has been adopted as a default. The original QB idea remains an example: leave NFL team wins off in Base, then enable a QB override worth +5. RB, WR, TE, K, and DEF continue inheriting the disabled Base rule unless configured separately. Overriding a normal stat replaces that position's inherited setting; reception premiums are a separate, explicitly additive mechanic.

The following table proposes the detailed qualification for that QB example. Participation and result semantics for other positions, particularly K and DEF, still require definition; do not extrapolate the snap requirement to them.

| Field | Proposed interpretation |
| --- | --- |
| Subject | A natural-position QB placed in a fantasy starting slot for that game, including SFLEX |
| Participation | Must record at least one offensive snap; provider availability unverified |
| Condition | Player's NFL team for that game wins |
| Effect | Illustrative QB position override: add 5 fantasy points once per qualifying player-game; not a selected default |
| Timing | Apply when provider marks the game final; remain provisional until league settlement |
| Ties / no participation | No bonus |
| Injury / benching | Bonus still applies if participation requirement was met |
| Duplicates | Multiple deliveries of the same result do not award multiple bonuses |
| Corrections | Revise provisional scoring with a visible reason; changes to published playoff outcomes and captures follow the bounded correction policy below |

“Starting” here means fantasy lineup placement, not necessarily the NFL's starting QB. Commissioners may intend a different interpretation; this is an explicit review question. Position eligibility, two eligible QBs on one NFL team, postponed games, and unavailable snap counts must be resolved before enabling this example's qualification policy. The position-scoring UI does not establish provider support for every stat or condition.

Illustrative explanation: **18.40 stat points + 5.00 NFL team-win bonus = 23.40 total**. Before final, show “Win bonus pending game result”; a projected bonus must not appear as earned points.

### Worked example: bench insurance

Experimental proposal: predeclare a bench replacement to cover a starter officially declared inactive before kickoff. It is not midgame injury replacement.

The replacement must be rostered, position-eligible, unused in another starting slot, and have an unstarted game when the effect resolves. Both designation and consumption must occur before the earlier relevant kickoff. Late or absent injury data cannot silently cause a retroactive swap. Exact status authority and safe fallback are open; hide/disable this mechanic if they cannot be supported reliably.

The example shop uses league-local, noncash currency separate from FAAB. Purchase and activation are separate states. The charge point—purchase or activation—and any reservation/refund behavior are open decisions. Whichever policy is selected, eligibility checks and balance/inventory changes must resolve exactly once; rejected requests must not create unintended charges. Every item must specify cost, limits, visibility, deadlines, expiry, stacking, and refund rules before it can be published. Prices and allowances are intentionally unspecified.

Opponent score-halving is a design exploration, not an approved item. Its interaction with negative scores, bonuses, shields, rounding, and hidden information requires explicit treatment.

### Engagement-based league points

**Confirmed intent:** commissioners may reward participation beyond roster management with league points that unlock or purchase power-ups. Engagement should play a substantial role when that earning path is selected. Specific earning rules and limits are proposed, not adopted.

Treat each earning rule as a contract: eligible league activity, eligible members, completion window, award amount, repeatability/caps, verification, award timing, visibility, and reversal behavior. Associate each award with its rule version and originating activity so retries cannot pay twice. Ledger entries record credits, spending, expiry, and attributed adjustments. The readable earning rules should be accessible from the balance and shop.

Candidate activities: a qualifying weekly discussion contribution, submitting a league poll/prediction before its deadline, or a commissioner-recognized contribution. Explore bounded participation awards rather than unlimited points per message. Reaction-based awards need collusion/popularity checks; subjective recognition needs attribution and published limits. Neither is assumed safe or required.

Example for discussion, with amounts intentionally open: a league enables one participation award per member for a designated weekly prompt, up to a weekly earning cap. Additional replies remain welcome but do not automatically produce additional awards. “Qualifying participation,” moderation, deleted contributions, and award reversals must be defined before this rule can go live. A reversal after points have been spent requires an explicit debt/refund policy; it cannot silently corrupt balances or past results.

Design validation must assess whether the economy rewards contribution without turning constant availability or spam into a dominant competitive strategy. Caps and power-up strength are proposed controls. Leagues can leave rewards off; their normal discussions and play continue.

## Resolution and corrections

Proposed scoring order: **normalize source facts → calculate base stat points → add eligible bonuses → resolve supported modifiers → round at the defined boundary → update totals and competition outcomes**. This order is itself part of the published rules. Rounding precision, modifier ordering, and tiebreakers are open; they cannot be left to client behavior.

Use fixed inputs and versions to reproduce an explanation. Distinguish projected, live/provisional, settled, and corrected results. Official game finality is separate from fantasy-week settlement.

**Confirmed playoff correction policy:** automatic reversal/recomputation of a published winner and capture requires processing the correction strictly before both cutoffs: the configured 24–48-hour deadline measured from completed NFL-round time, and the first NFL kickoff of the next round. The working local setting is 48 hours within that configurable range; it is not a universal product default. Unknown completion/schedule facts cannot establish automatic eligibility.

Inside both gates, apply the corrected winner and bench-based transfer atomically and retain the original result/transfer record. Clear affected next-round lineup slots whose players are no longer owned, flag the lineup for review, and never choose replacement starters or optimize a lineup after the fact.

At or after either cutoff—including when the next round has begun or completed—retain the published competitive outcome and ownership. Record the corrected facts, show the published versus proposed winner/scores and the cutoff reason, and notify the commissioner for an attributed decision. Do not automatically backfill historical lineups or rewrite later rounds.

Optional currency and power-up effects still need their own reversal rules before enablement; a source correction must not silently rewind their ledgers. Duplicate events/retries must not duplicate scores, purchases, picks, transfers, or notifications.

Imported official seasons retain source outcomes. A new ruleset never recalculates an imported season by default. A hypothetical replay is labeled and isolated from official history.

## Model review scenarios

Before implementation, walk through: duplicate game-final delivery; a QB benched after one snap; a player traded between NFL teams; a correction after playoff advancement; two simultaneous claims; a purchase retried from two devices; a reconnect at lineup lock; a renamed franchise with a replacement owner; an imported season missing scoring settings. Expected outcomes or explicit unresolved decisions must exist for each.

See [experience designs](03-core-experiences.md), [migration](04-history-migration.md), and [pilot acceptance](05-pilot-backlog.md).
