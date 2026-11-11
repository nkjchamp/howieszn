# Game day, lineups, and roster absorption

Historical game-day study v0.1. [Interactive study](../prototypes/game-day/index.html) · [current format rules](07-playoff-absorption.md) · [working React app](../../apps/web/src/App.tsx) · [shared rules implementation](../../packages/domain/src/index.ts) · [draft room](09-draft-room-walkthrough.md).

This extends the default **team-owned** concept from drafting into game day and the next NFL round. Every result, status, and player association is fictional fixture data. Its configuration is separate from the setup and draft studies; their selections are not imported. The standalone prototype has no backend, authenticated managers, live scoring feed, persistent save, or real transfer transaction. It predates the current correction policy and does not implement shared-bench mode.

**Current policy annotation:** capture follows bench allocation, not ownership mode: a team-specific bench transfers with the whole losing roster; a shared manager bench stays with its manager while only losing starters transfer. Automatic winner/capture reversal is allowed strictly before both the configured 24–48-hour deadline after completed NFL-round time and the next round's first NFL kickoff. The working local window is 48 hours. At or after either cutoff, preserve published outcomes and ownership, show published versus proposed results with the reason, and notify the commissioner for an attributed decision. Inside both gates, automatic recomputation clears foreign next-round lineup slots without choosing replacement starters. It never backfills historical lineups. The older study's correction-hold behavior below is historical; use the linked current app/rules for this policy.

## Sample and experience contract

Fourth & Friends: Alex · Team 03 faces Jordan · Team 01 during Wild Card. Alex starts Josh Allen, Justin Jefferson, Jahmyr Gibbs, George Kittle, Denver D/ST, and Amon-Ra St. Brown in SFLEX/WR/RB/TE/DEF-K/FLEX. Jordan has Jalen Hurts, CeeDee Lamb, Saquon Barkley, Trey McBride, Brandon Aubrey, and Nico Collins.

Desktop keeps matchup and roster visible together. Mobile separates **Matchup / My team / Activity** while retaining the same team and phase. Natural player positions remain QB/RB/WR/TE/DEF/K; SFLEX, FLEX, and DEF/K are starting slots.

The UI distinguishes:

- **Membership:** which team owns a player. Team-owned mode does not expose players to another team managed by Alex.
- **Starting assignment:** which eligible owned player occupies a slot. Player kickoff locks govern these changes; membership is not permission to move an already-started player.
- **Result finality:** live points, completed games, settled fantasy results, and applied roster transfers are separate states.

## 1. Before kickoff

```text
Alex · Team 03                         Before kickoff
Roster membership: Team 03 · 6 players
Starting-slot lock: By player kickoff
SFLEX  Josh Allen · QB                  [Edit]
WR     Justin Jefferson · WR            [Edit]
… six slots
Team bench: All rostered players are starting
```

Edit opens a focused starter picker containing owned, position-eligible players and “Leave slot empty.” Empty slots remain allowed. Selecting a bench player replaces the starter; the displaced player stays on this team's bench. Selecting a player in another unlocked slot performs a legal swap only when both destinations accept the resulting players. No player can occupy two slots.

Save applies the local draft choice; cancel changes nothing. The picker revalidates phase, membership, position eligibility, and kickoff locks at save time, so a stale dialog cannot override a later lock. Conventional flex eligibility is a design assumption already marked open in the format rules.

## 2. Live matchup

```text
Alex · Team 03   44.70   vs   Jordan · Team 01   37.50
Live · Provisional
SFLEX Josh Allen       Game started · Locked
WR    Justin Jefferson Game started · Locked
TE    George Kittle    Not started       [Edit]
```

The fixture starts Allen, Jefferson, Hurts, and Lamb first. Their points appear; later players remain at zero until the completed-game scenario. Editing an unlocked starter remains available even after other games begin. Locked starters cannot be removed or swapped out. The first-game boundary does not indiscriminately lock every lineup slot.

Real game statuses, byes, postponements, injuries, notification timing, and provider delay require actual data contracts. The study demonstrates state distinctions without inventing a live resolution policy.

## 3. Completed games and pending settlement

The untouched sample totals are **92.40–86.10**. Totals are calculated from the local fixture lineup, so benching a productive starter can change the winner. Completed games freeze that round's selected lineup for this demonstration. They do not transfer a player automatically.

```text
Alex leads. The roster stays put.
Awaiting settlement
No ownership changes until the result is settled.
```

If Alex loses or the fixture ties, the study does not offer Alex an absorption action. Default starter-survival tiebreaks still require measurement timing and an ultimate fallback; this concept does not invent those policies.

## 4. Review and apply absorption

“Mark result settled” is an external **demo scenario**, enabled after completed games. It is not a commissioner workflow approved for production. A real settlement service must satisfy the league's defined correction and governance rules before enabling transfer.

For an Alex win, a review dialog shows six retained players and six arriving from Jordan. The explicit “Apply demo absorption” action expands Alex · Team 03 to twelve unique assets once. Repeating it cannot add duplicate players. Other Alex teams do not gain ownership.

Capture scope follows **bench allocation independently of roster ownership**: a team-specific bench transfers with the entire losing roster; with a shared bench, only the losing starters transfer and reserves remain with the manager. The latter is confirmed but outside this prototype. Original and inherited labels preserve provenance. The resulting roster is shown with natural positions. A hypothetical result correction arriving while transfer review is open prevents the action from completing.

## 5. Prepare the next six

```text
Twelve players. Your next six.
[View full new roster]
SFLEX Josh Allen · QB   NFL team eliminated · 0 future points
      [Choose Jalen Hurts · QB]
```

All twelve remain owned, including players whose NFL teams were eliminated. Those assets show **0 future points**; their earned Wild Card points remain unchanged. The fixture preserves consistent NFL-team survival status among teammates. Selecting Hurts for SFLEX moves Allen to the team bench. Next-round lineup edits affect neither the frozen prior lineup nor the 92.40 historical total.

The full-roster view includes all original and inherited assets with position, NFL team, provenance, and survival state. Selecting an eliminated player is not silently prohibited: the manager sees the zero-point consequence. Roster caps and any forced-release mechanics remain separate open rules.

## 6. Historical result-changing correction interaction

In this older study, a correction before absorption places advancement and transfer on hold. After absorption, the study retains the existing twelve-player ownership and next-lineup selections while pausing further edits. It shows the revised leader and a fixture correction adjustment reconciling the revised totals to player rows. This is a record of that prototype's behavior, not the current automatic-correction rule.

That standalone UI does not perform reversal or recomputation. Current policy is now selected: the working app may reverse/recompute within both gates, invalidating foreign next-round lineup slots without choosing a better lineup. At/after the time or next-kickoff boundary it retains the published result/capture and warns/notifies for commissioner review. A begun or completed next round is never automatically backfilled. The historical study is intentionally unchanged rather than presenting its old hold screen as implementation of the new policy.

## Review tasks and verification

Ask a manager to distinguish membership from lineup locks, attempt a live locked-slot edit, bench an unlocked player, follow a provisional result, review a transfer, and select a surviving replacement. Use the current app to test correction cutoffs; the old study can only explain its historical hold interaction. Repeat on phone and desktop; provenance and historical score preservation should remain clear.

Earlier browser checks exercised local kickoff locks, pending-versus-settled separation, twelve-player unique absorption, next-round QB substitution, unchanged historical scores, the old correction hold, and mobile workspace visibility. Those results do not validate the newer cutoff/reversal policy. They are prototype checks, not native, provider, concurrency, production authorization, or customer usability validation; no real league was changed.

## Visual references

- [Desktop before kickoff](../prototypes/game-day/desktop-before-kickoff.png) and [live matchup](../prototypes/game-day/desktop-live.png)
- [Desktop next-round lineup](../prototypes/game-day/desktop-next-round.png) and [correction hold](../prototypes/game-day/desktop-correction.png)
- [Mobile lineup](../prototypes/game-day/mobile-lineup.png), [next-round roster](../prototypes/game-day/mobile-next-round.png), [starter picker](../prototypes/game-day/mobile-lineup-edit.png), and [full new roster](../prototypes/game-day/mobile-full-roster.png)
