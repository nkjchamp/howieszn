# Commissioner setup: screen-by-screen walkthrough

Historical setup study v0.2. This documents the standalone commissioner concept; its controls and screenshots are not the current application or a complete rule engine. The [working React app](../../apps/web/src/App.tsx), [shared rules implementation](../../packages/domain/src/index.ts), and [current format rules](07-playoff-absorption.md) are the current references.

Related: [product brief](01-product-brief.md), [format rules](07-playoff-absorption.md), [decisions](06-decisions.md), and [clickable design prototype](../prototypes/commissioner-setup/index.html).

## Sample and design boundaries

**Fourth & Friends** is fictional. Alex, Jordan, Sam, and Casey each control four of sixteen teams. Player names, scores, and rosters are fixtures, not live data or claims about postseason qualification.

Confirmed defaults: team-owned rosters; draft per team; six starting slots; no initial bench; empty slots allowed. Manager-owned mode defaults to a shared manager bench. Commissioners can change these settings independently. The default first tiebreaker is **Starting Players still in NFL Playoffs**.

The prototype holds choices in memory: no account, backend save, invitations, import, live scoring, or actual publication. Refresh resets it. Scoring rates are illustrative; no configured sports-scoring engine or provider-stat coverage is established.

**Current policy annotation:** capture follows bench allocation independently of ownership: a team-specific bench transfers with the entire losing roster; a shared manager bench stays with the manager and only losing starters transfer. Automatic winner/capture corrections require processing strictly before both the configured 24–48-hour deadline after completed NFL-round time and the next round's first NFL kickoff; the local working window is 48 hours. At/after either cutoff, preserve published outcomes/ownership, show published versus proposed results, and notify the commissioner for an attributed decision. An eligible automatic reversal clears foreign next-round lineup slots without selecting replacements; no historical backfill occurs. This older standalone study does not implement that policy and has not been overhauled to imply it does.

## 1. Set Up

**Goal:** name the league and recognize the game before encountering settings.

```text
Set Up
League name [Fourth & Friends]
Start with a default set of rules. Customize it however you'd like.
[Playoff absorption]
Win your matchup. Inherit the defeated roster.
16 teams · 4 NFL rounds                         [Continue]
```

League Name belongs here. A blank name receives concise inline feedback. This walkthrough supports the playoff template only; unavailable modes should not appear actionable. Desktop uses a focused template card; mobile keeps the same hierarchy in one column. Importing history or attaching a competition to an existing league remains a separate journey.

## 2. Rosters & Draft

```text
Roster ownership     [Team-owned ▾]
Draft players for    [Each team ▾]
Keep reserves on     [Team bench ▾]
SFLEX 1 · WR 1 · RB 1 · TE 1 · DEF/K 1 · FLEX 1
Initial bench: 0                         [Edit roster]
Allow empty slots                       [On]
```

Draft destination is independent of ownership. “Manager pool, then assign” under team ownership reveals an illustrated assignment step; it is not a working assignment editor. Changing ownership suggests the corresponding bench default, while preserving a commissioner-customized bench choice.

SFLEX is the superflex lineup label. DEF/K is one slot, filled by a team defense or kicker. Advanced roster editing exposes composition without making every commissioner start from an empty form. Eligibility and reserve limits still need rule definitions.

## 3. Managers

```text
Managers              [2] [4 selected] [8] [16]
16 teams              4 per manager
Alex · Jordan · Sam · Casey           Sample managers
Invite your league after setup       Preview only
```

This screen focuses on manager count and the later invitation journey. Count recalculates teams per manager and draft load. Samples use labels such as Alex · Team 01; no sixteen-name form is required. A, J, S, and C identify the sample managers. Do not suggest that selecting a sample sends invitations or creates accounts.

## 4. Timing

```text
Across teams          [Before round kickoff ▾]
Within a team         Until the player's game starts
Team roster locks ≠ every starting slot locks
```

Show cross-team assignment controls for manager-owned pools. Team-owned mode explains that players remain with their team. The alternative permits movement until the moved player's game starts. Illustrate an unstarted bench player remaining editable after round kickoff. Unassigned shared-reserve eligibility, protected locked starters, and detailed move timing remain unresolved. Capture scope is selected by bench allocation as annotated above; this study does not execute it.

## 5. Scoring & Ties

Expanded position-editor example; this does not select the toggle's initial product state:

```text
Fractional yardage [On]      Negative scoring values [On]
Customize Scoring by Position [On]
[Base rules] [QB] [RB] [WR] [TE] [K] [DEF]
Passing · Rushing · Receiving · Kicking
Team Defense · Team results · Misc · Custom
Passing yards [Enabled]     [25] yards = 1 point
NFL team wins [Off]          Inherited from Base
Position rule                                [Reset to Base]
Advanced bonuses ▾          Reception premiums ▾
Tiebreaker 1: Starting Players still in NFL Playoffs
```

Follow the user's Yahoo references through grouped stat controls, not a single generic scoring dropdown. Each stat supports an enable toggle and preset or custom values. Use yardage ratios where appropriate; expose advanced bonuses on demand. Kicking and Team Defense keep their own groups. NFL team wins belongs in Team results; it is not a standalone Custom league bonus.

Customize Scoring by Position reveals Base rules and natural-position tabs QB/RB/WR/TE/K/DEF. Base applies to every position. Within a position tab, a commissioner can override a stat's amount, enabled state, or both; untouched rules inherit Base. Reset to Base removes the override. SFLEX and FLEX are not scoring positions. Position overrides replace inherited stat settings rather than adding another score; position reception premiums are explicitly separate and additive.

NFL team wins starts off in Base and every position. It can be enabled for all positions in Base or configured position by position. A QB-only +5 rule is an example, not an adopted value. K/DEF participation semantics remain open. All displayed rates and presets are illustrative; provider availability for each stat is unverified.

The first tiebreaker counts **starting players** whose NFL teams remain alive. Commissioners can change or order criteria, including cumulative team and manager points. Survival measurement time and later fallback remain open. Correction cutoff behavior is selected in the current policy annotation, although this historical study does not implement it. Manager points alone cannot distinguish teams controlled by the same manager.

## 6. See a round

```text
Alex · Team 01  92.40   beats   Jordan · Team 01  86.10
Alex advances → 12 rostered → choose 6 starters
[Starting lineup] [After the win] [View full new roster]
```

**View full new roster** shows all twelve original and inherited players, with natural positions rather than lineup slots:

| Origin | Player | Position |
| --- | --- | --- |
| Alex | Josh Allen | QB |
| Alex | Justin Jefferson | WR |
| Alex | Jahmyr Gibbs | RB |
| Alex | George Kittle | TE |
| Alex | Denver D/ST | DEF |
| Alex | Amon-Ra St. Brown | WR |
| Jordan | Jalen Hurts | QB |
| Jordan | CeeDee Lamb | WR |
| Jordan | Saquon Barkley | RB |
| Jordan | Trey McBride | TE |
| Jordan | Brandon Aubrey | K |
| Jordan | Nico Collins | WR |

QB remains QB even when started in SFLEX; WR remains WR in FLEX. DEF and K identify distinct assets despite sharing a lineup slot. In this team-specific-bench fixture, Alex selects six starters from twelve, leaving six team-bench reserves. Other Alex teams do not gain access automatically. NFL-eliminated players earn zero later. The fixture uses six slots regardless of edited roster size. The older shared-reserve warning means that path is not implemented here, not that its capture policy remains undecided.

## 7. Review

```text
Fourth & Friends · 4 managers · 16 teams · 4 rounds
Ownership / draft / reserves / timing / Base scoring / position overrides / ties
Changed from template: [concise list]
Needs definition: final fallback · initial publication timing
[Back to edit]                          [Publish demo league]
```

Provide edit links beside groups. Review lists Base scoring and enabled position overrides, with reception premiums identified as additive. The final action produces a demo acknowledgement: no league was created or saved, and no invitation was sent. Retain unresolved policies; do not imply live readiness. Production publication must resolve applicable gaps and generate an accurate constitution.

## Review tasks and evidence

Test renaming in Set Up, ownership versus draft routing, manager sizing, bench overrides, scoring group controls, starter-only survival ties, the two locks, and the twelve-player roster. Check desktop/mobile layouts, keyboard use, labels, and large text.

The earlier flow checks remain recorded for navigation, setup, rosters, managers, timing, default ties, full-roster preview, and demo publication. This position-scoring revision passed browser checks at 1440 × 1000 and 390 × 844: all six natural-position tabs; independent team-win settings; Base inheritance and later Base edits; whole-rule snapshots; disabled overrides; reset to the current Base rule; preserved-but-inactive overrides when customization is off; validation of an invalid value in a hidden position; and complete position-override review. Additive reception bonuses were checked against effective TE reception values and again after Reset to Base. The mobile seven-screen flow had no horizontal overflow, and the exercised desktop/mobile flows reported no JavaScript errors.

These checks establish historical prototype interaction behavior, not native-device behavior, sports-data coverage, full scoring correctness, accessibility conformance, customer usability, or implementation of the newer capture/correction policy. Rates remain illustrative; final fallback and initial publication timing remain unresolved.

Visual references: [desktop Set Up](../prototypes/commissioner-setup/desktop-setup.png), [desktop scoring overview](../prototypes/commissioner-setup/desktop-scoring-overview.png), [mobile Rosters & Draft](../prototypes/commissioner-setup/mobile-rosters.png), and [full new roster](../prototypes/commissioner-setup/desktop-full-roster.png).

Position-scoring references: [desktop controls](../prototypes/commissioner-setup/desktop-position-scoring.png), [NFL team-win rule](../prototypes/commissioner-setup/desktop-team-win.png), and [mobile controls](../prototypes/commissioner-setup/mobile-position-scoring.png).
