# Playoff roster-absorption format

Working format rules v0.2. This records selected defaults and confirmed policies; remaining choices are identified below. The [shared local rules](../../packages/domain/src/index.ts) and [React app](../../apps/web/src/App.tsx) implement a bounded fixture-backed foundation, not a live pilot. Earlier standalone studies are historical design artifacts and may retain superseded behavior.

## Selected direction

Each bracket team plays a head-to-head matchup decided by its total fantasy points. The winner advances and absorbs the defeated assets eligible under bench allocation: the entire losing roster with a team-specific bench, or only the losing starters when reserves use a shared manager bench. Shared reserves stay with their manager. Players whose NFL teams are eliminated score zero in future rounds; their already-earned scores remain historical results. Multiple teams can belong to the same manager, and those teams may eventually face one another.

**Confirmed bracket:** sixteen teams across Wild Card, Divisional, Conference Championship, and Super Bowl rounds. Manager count must divide sixteen: 2, 4, 8, or 16 managers, with teams split equally. This supersedes the earlier eight-manager cap and open bracket-size question.

| Managers | Teams per manager |
| --- | --- |
| 2 | 8 |
| 4 | 4 |
| 8 | 2 |
| 16 | 1 |

## Defaults and commissioner choices

| Setting | Selected default/direction | Commissioner configuration |
| --- | --- | --- |
| Roster ownership | **Team-owned:** each team retains its own accumulated roster | Can select manager-owned pools instead |
| Draft destination | **Draft for each team** when using the default team-owned model | Can draft one manager-owned pool, assign players to teams, and then use team-owned rosters from that point forward |
| Team-owned reserves | Non-starters remain on the team's specific bench by default | Commissioner can change reserve allocation |
| Manager-owned reserves | Non-starters remain on the manager's shared bench by default | Commissioner can change reserve allocation |
| Capture scope | Team-specific bench: entire defeated roster; shared manager bench: losing starters only | Follows the selected bench allocation independently of roster ownership |
| Round roster assignment | In manager-owned mode, assign each team's round roster before the first NFL game of that round starts | Commissioner can allow later cross-team moves, such as until the moved player's game starts |
| Starting lineup changes | After round assignment closes, change starters using that team's bench, subject to player game locks | Commissioner can configure supported movement/lock policies |
| Starting lineup | 1 SFLEX (superflex), 1 WR, 1 RB, 1 TE, 1 Team Defense-or-Kicker slot, 1 FLEX | Commissioner can change supported roster rules; exact eligibility and bounds need definition |
| Empty slots | Allowed | Commissioner can configure lineup requirements |
| Same-manager matchup | Allowed | Additional bracket placement controls are not yet selected |
| Matchup tiebreakers | Default first criterion: **Starting Players still in NFL Playoffs** | Commissioner can configure criteria/order, including cumulative team or manager fantasy points; later fallback remains open |
| Automatic result corrections | Strictly before the configured 24–48-hour deadline after NFL-round completion and before the next round's first NFL kickoff | Working local window: 48 hours; at/after either cutoff retain the published outcome/ownership and notify the commissioner |
| Scoring and mechanics | Template provides understandable defaults | Commissioner can enable, disable, or change supported mechanics and fantasy-scoring rules, including changes that alter strategy |

Draft destination and ongoing roster ownership are independent settings. Drafting one pool does not require keeping manager-owned pools throughout the competition. The user-selected alternate path is **shared draft → assignment → team ownership**. Other combinations must be specified and validated before being offered.

Team Defense-or-Kicker is one slot filled by either eligible asset, not two required starters. This avoids making sixteen unique team defenses a prerequisite. Superflex eligibility of QB/RB/WR/TE and flex eligibility of RB/WR/TE are proposed conventional interpretations, not separately confirmed eligibility rules. Defense-versus-kicker scoring balance remains a design test.

## Ownership examples

**Default:** a manager drafts separately for Teams A and B. A wins and absorbs its opponent's players. Those inherited players belong to A; they are not automatically available to B. The manager selects A's next lineup from A's accumulated roster, with non-starters on A's specific bench by default. The commissioner can change reserve allocation.

**Alternate draft, same ownership:** a manager drafts one pool and distributes it among their teams before play begins. After assignment, each team owns its allocated players and subsequent captures. Handling of any unassigned initial players remains to be settled; this one-time draft assignment is distinct from recurring round assignments in manager-owned mode.

**Manager-owned mode:** the manager coordinates multiple teams, with non-starters on the manager's shared bench by default. Before the first NFL game of each round, the manager sets each team's roster; round assignment determines eligibility without changing underlying manager ownership. Under shared-bench allocation, only a losing team's starters transfer and reserves stay with the manager. If the commissioner selects team-specific benches instead, the whole losing roster including its bench transfers. Treatment and movement of unassigned shared reserves at the assignment deadline remain open; capture scope does not.

## Round assignment versus starting-lineup locks

The user has selected two distinct boundaries:

1. **Team assignment:** by default, manager-owned players must be allocated to a team's round roster before the first NFL game of the round starts. After this deadline, teams cannot freely draw from other teams' rosters.
2. **Starting lineup:** within its assigned roster, a team can still change starters using its own bench after the first game starts, subject to player game locks. Roster assignment closing does not freeze every starting slot for the entire round.

Commissioners can change the assignment/movement policy. A selected example option is cross-team movement after the round begins while the moved player's NFL game has not started. Exact scope—moves versus swaps, filling empty slots, inherited reserves, and protection for a starter whose game already began—needs an explicit policy. Do not use this option to silently reassign completed points or start one player for multiple teams.

Proposed UI states: “Team assignments close at round kickoff,” then “Team roster locked; unstarted lineup slots editable.” In a league using a later-movement policy, display the actual applicable deadline instead. Keep shared reserve ownership, round eligibility, and starting status visually distinct.

## Commissioner-configured tiebreakers

The default first tiebreaker is **Starting Players still in NFL Playoffs**. Count starting players, not the entire roster or bench. Other confirmed commissioner-selectable choices include:

- Most fantasy points scored by the team to date in this competition.
- Most fantasy points scored by the manager's teams to date, where the manager controls multiple teams.

The starter-only scope and first criterion are now selected. Still define the survival measurement point, cumulative points window, later priority/fallback criteria, and whether manager totals include eliminated teams. Proposed cumulative team totals use that team's recorded performances rather than adding a captured opponent's earlier results; this interpretation still needs confirmation.

Offer clear configuration for precedence and an ultimate fallback when selected criteria remain tied. Manager-level points alone cannot separate two teams belonging to the same manager. NFL survival counts may also tie at zero or at the same roster size. A deterministic advancement policy is required before drafting.

Tiebreak resolution and initial result publication are separate from the confirmed official-stat correction policy below. Initial publication timing still needs an authoritative completion signal.

## Published-result correction policy

Automatic reversal of a winner/capture requires a correction strictly before **both** the configured 24–48-hour deadline after NFL-round completion and the next NFL round's first kickoff. The local working setting is 48 hours, configurable from 24 to 48; it is not a universal adopted default. If completion or schedule timing cannot be established, do not assume the automatic gates are open.

Inside both gates, recompute the winner and bench-based capture atomically, preserving the previous result and transfer provenance. Invalidate next-round lineup slots containing assets no longer owned; notify the affected manager to choose replacements. Never auto-pick an improved lineup or backfill earlier performances.

At or after either boundary, retain the published winner and ownership, including when the next round has started or finished. Record the corrected facts, show a clear published-versus-proposed winner/score comparison and reason, and notify the commissioner for an attributed decision. No automatic historical lineup or later-round rewrite occurs.

## Decisions still needed

- **Bracket placement:** sixteen teams and equal allocation among 2/4/8/16 managers are selected; seeding and initial placement of a manager's teams remain open.
- **Roster depth:** “no bench” described initial draft rosters. Absorption produces extra players; determine whether team-owned rosters retain all inherited reserves and whether any initial/ongoing limits are configurable.
- **Transfer timing details:** bench-based capture scope is selected. Define the exact roster snapshot and permitted moves before locking, plus initial settlement/publication timing. Proposed invariant: one asset cannot start for multiple teams in the same round; duplicate ownership/eligibility policy must be explicit.
- **Lineup timing details:** round-start assignment is the selected default; define unassigned shared-reserve eligibility, override precedence, precise per-game locks, empty-slot scoring, NFL byes, suspended games, and injured players.
- **Results:** define tiebreaker measurement/priority/fallback and authoritative initial publication signals. The automatic correction cutoffs and late-correction preservation policy are selected; commissioner decision permissions and appeals still need definition.
- **Change authority:** select which mechanics/scoring can change before or during the competition, required notices/approvals, and effective boundaries. Commissioner flexibility is confirmed; a universal midround or retroactive-change policy is not.

## Scoring configuration presentation

The setup scoring editor groups settings into **Passing, Rushing, Receiving, Kicking, Team Defense, Team results, Misc, and Custom**, following the user's supplied Yahoo references and subsequent position-scoring clarification. Support stat enable toggles, preset or custom values, yardage expressed as yards equal to one point, advanced bonuses, fractional and negative points, and position-specific reception premiums. Any displayed preset rates are illustrative until a scoring profile is selected; this is a design requirement, not evidence that a sports-data provider supplies every selectable stat. Provider availability must remain visible in the implementation plan.

**Customize Scoring by Position** reveals **Base rules / QB / RB / WR / TE / K / DEF**. Base rules are inherited by every natural position. A position can independently override a stat's amount and enabled state; unchanged rules inherit Base. **Reset to Base** removes the override. Review shows Base settings plus enabled position overrides, rather than disguising inherited rules as additional bonuses. SFLEX and FLEX do not appear as scoring-position tabs.

**NFL team wins** belongs under **Team results** as a normal stat available to every position, initially off in Base and all position tabs. Enabling it in Base applies to all positions unless overridden. A QB-only +5 rule is an illustration of a position override, not a selected default or standalone Custom league bonus. Participation requirements and K/DEF result semantics remain open. Reception premiums remain separate and explicitly additive to ordinary reception scoring; position overrides do not silently add another copy of the inherited stat score.

## Experience implications

Desktop draft preparation needs a team selector and a clear destination for every pick. In shared-draft mode, provide a manager-pool view and initial assignment workspace. Show starters, captures, and either team-specific benches or the manager's shared bench according to the commissioner-selected reserve allocation. Do not imply a shared reserve belongs to a particular team unless assigned. Keep ownership, reserve allocation, and lineup assignment distinguishable on mobile as well as desktop.

The setup summary should concisely show the selected ownership mode, draft destination, roster slots, empty-slot policy, and advancement/absorption behavior. Explain materially different strategies with a short example instead of a wall of instructions.

In the example absorption preview, **View full new roster** shows all original and inherited players. Label players by natural position (QB, WR, RB, TE, DEF, or K), not their lineup assignment (SFLEX, FLEX, or DEF/K). Preserve origin so the manager can see who was already rostered and who was inherited.

Review with the [rules model](02-league-rules-model.md), [core experiences](03-core-experiences.md), [pilot backlog](05-pilot-backlog.md), and [decision register](06-decisions.md).
