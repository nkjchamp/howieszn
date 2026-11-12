# Draft room: screen-by-screen walkthrough

Design draft v0.1. This extends [commissioner setup](08-commissioner-setup-walkthrough.md) into drafting, beginning with the confirmed team-owned, per-team draft configuration. [Clickable draft prototype](../prototypes/draft-room/index.html) · [format rules](07-playoff-absorption.md) · [product brief](01-product-brief.md) · [decisions](06-decisions.md).

This document describes the earlier independent HTML study. The current React draft room's revised hierarchy and validation are recorded in [15](15-draft-room-hierarchy.md).

## Sample and boundaries

**Fourth & Friends** is fictional. Alex, Jordan, Sam, and Casey each manage four of sixteen teams. Each team drafts six players for SFLEX, WR, RB, TE, DEF/K, and FLEX, with no initial bench. Empty starting slots are allowed under the selected template. Actual player positions remain QB/RB/WR/TE/K/DEF; SFLEX and FLEX describe lineup eligibility.

The working design uses a **six-round snake draft: sixteen team seats × six picks = 96 picks**. Snake order, seat allocation, timer behavior, queue policy, and autopick policy are proposed design choices, not commissioner defaults adopted by the user. Team ownership and per-team pick destinations are confirmed requirements.

This is an in-memory interaction prototype: no accounts, invitations, backend, synchronized clock, sports feed, or remote managers. Player names, order, and research information are fixtures, not claims about NFL postseason eligibility or authoritative rankings. Any advancing turns, pauses, timeouts, or reconnects are local demonstrations. Refresh resets the study. Shared-manager-pool drafting needs a distinct later walkthrough; it is not implemented here.

## 1. Draft lobby

**Goal:** understand who is drafting for which teams before the clock starts.

```text
Fourth & Friends                           Draft lobby
Team-owned · Snake · 16 teams · 6 rounds

Alex       4 teams       Ready
Jordan     4 teams       Ready
Sam        4 teams       Ready
Casey      4 teams       Ready

Draft order / Rules / Starting lineup
[Start demo draft]
```

Readiness belongs to managers, while the order identifies individual teams and their owners. Show both identities wherever they could be confused. The lobby should reveal the roster slots, number of picks, scoring context, and autopick assumptions without requiring everyone to read the constitution again.

Commissioner controls have an explicit role label. Starting the demonstration must not imply other people joined or that every live-readiness requirement was verified. The start action loads two labeled fixture picks: Josh Allen for Jordan · Team 01 and Ja’Marr Chase for Casey · Team 01. Alex · Team 03 is then on the clock at 1.03. Scheduled start, actual attendance, and invitation handling remain future product work.

Desktop uses the available width for manager readiness and the team order together. Mobile stacks them, keeping the entry action easy to reach.

## 2. Live desktop draft room

**Goal:** research, manage several teams, and make the correct pick without losing the turn context.

```text
Fourth & Friends                 Connected · Draft active
Round 1 · Pick 1.03       Alex picking for Team 03
Clock / Next turns / Commissioner controls

16-team draft board — owner + destination in every column
Round 1 …
Round 2 …
… Round 6

Player pool          Player detail          Team queue
Search / position    Name / natural position Reorder / remove
Sort / availability  Research fixture        Autopick context
                     [Confirm selection]    Team roster
                                            SFLEX / WR / RB
                                            TE / DEF-K / FLEX
```

Board, player pool, selected-player research, queue, and team roster should remain available together at supported desktop sizes. Dense data must retain readable type and clear hierarchy. Use panel scrolling where necessary rather than forcing repeated full-page navigation. At shorter laptop heights, the board scrolls vertically to keep the pick action and research/queue/roster panels visible. Quick switches for Alex’s four teams complement the grouped all-team roster selector.

The current turn has a predetermined destination: **Alex · Team 03**. Browsing Alex's Team 01 roster must not redirect the current pick. Distinguish the team being inspected, the team whose queue is edited, and the team on the clock. Opponents’ rosters are inspectable; their queues remain private in the UI. A final selection action names the player and destination.

Search, position filters, and sort preserve browsing context while picks occur. Available-player selection shows natural position; roster placement can use SFLEX or FLEX. Avoid implying that any six drafted players automatically satisfy every required lineup slot. Exact draft-time roster legality and treatment of deliberately empty slots still need an enforceable rule definition.

Per-team queues are a proposed approach for this walkthrough. Queue scope must be visible. Reordering supports buttons or keyboard interaction as well as any drag affordance. Autopick must explain whether it uses the queue, roster needs, or an illustrative ranking fallback; that choice is not an adopted platform-wide policy.

## 3. Confirmed pick and next turn

**Goal:** know the result of the action and what happens next.

```text
Pick accepted
Lamar Jackson · QB → Alex · Team 03

Board cell filled / Player unavailable / Team roster updated
Queue reconciled
Next: another manager and team
```

Pending acknowledgement is distinct from accepted. Confirmation captures the displayed player, team, and turn. If that context changes before submission, reject the stale confirmation rather than redirecting the pick. Repeated confirmation must not add a second pick. Accepted changes reconcile the board, availability, roster, and queue. Preserve the manager's search, filter, selected roster, and scroll context where possible.

Confirmation should be concise and attributable, with confirmed pick history available for inspection. The queue, player search/filter/sort, and panel scroll positions should survive pick updates. If a player becomes unavailable, explain the rejection and let the manager choose again. Do not substitute another player while presenting the original choice as accepted.

## 4. Mobile participation

Mobile is a complete drafting client, not a companion that requires desktop access.

```text
Round / Clock / Connection
Alex → Team 03                      Your turn
[Players] [Queue] [My teams] [Board]

Current workspace
Player selection / Detail
Persistent destination-aware pick action
```

Tabs prioritize one task at a time while retaining the same turn, queue scope, and accepted state. A persistent selected-player strip opens a detail sheet, with a destination-aware draft action and explicit confirmation. Tabs return the page to the top while retaining internal panel context. A phone user can search, inspect, queue, reorder, review team needs, and make every pick. Returning from the background needs explicit recovery in the real product; the study's simulated state does not establish native-device behavior.

## 5. Interruptions and commissioner actions

Show **paused**, **disconnected**, **pending**, **accepted**, and **autopicked** as different states. A paused room should not resemble a broken connection. Disconnection marks the displayed state stale and prevents a false success; a reconnect demonstration explains how confirmation would be reconciled. Production recovery must obtain authoritative state before resuming submissions.

An explicit demo timeout can illustrate autopick without pretending a local timer is server-authoritative. Commissioner pause/resume controls are labeled as simulations. Undo requires an audit trail and dependent-pick policy before live use; visibility of a control alone does not establish safe reversal behavior.

## Review tasks and evidence

Ask reviewers to identify the next destination; inspect another owned team without redirecting the pick; search and queue a player; reorder that queue; complete a pick; distinguish acceptance from pending; explain an autopick; pause/resume; and recover from the disconnect demonstration. Repeat the complete pick journey on mobile and with keyboard navigation.

Assess destination errors, comprehension, successful actions, retained context, accessibility, and confidence. These layouts and policies have not received customer usability validation. Browser interaction results, if subsequently run, should be recorded separately from sports-data, latency, concurrency, authentication, and real reconnect validation.

## Prototype verification

Browser checks exercised the room at 1440 × 1000, 1366 × 900, 1280 × 800, and 1024 × 768, plus phone/tablet layouts at 390 × 844, 360 × 800, and 768 × 1024. The main desktop draft action stayed within the viewport at those desktop sizes; the document did not overflow horizontally. The mobile board scrolls within its own region.

Checks passed for the fixed pick destination while another team is viewed; pending versus accepted state; global removal of drafted players from queues; keyboard queue reordering with focus retained; search/sort/panel-scroll retention; team-aware queue-first autopick; next-turn handoff; pause/resume; staged offline queue edits; reconciliation of one missed update; pending acknowledgement without duplicate picks; stale-confirmation rejection; mobile workspace tabs, player sheet, and confirmation; and complete six-round snake order. A full simulation produced 96 distinct drafted assets and sixteen legal six-player rosters. Confirmed pick history contained all 96 outcomes. Exercised browser flows reported no JavaScript errors.

These results validate local prototype interactions. They do not validate a server-authoritative clock, WebSockets, real concurrent managers, native background/resume, provider eligibility, live rankings, authentication, or production accessibility. There has been no customer usability session. Draft policy choices remain proposals.

## Visual references

- [Desktop lobby](../prototypes/draft-room/desktop-lobby.png)
- [Desktop draft room](../prototypes/draft-room/desktop-room.png) and [mid-draft sample](../prototypes/draft-room/desktop-mid-draft.png)
- [Laptop layout](../prototypes/draft-room/laptop-room.png)
- [Fixed-destination confirmation](../prototypes/draft-room/desktop-confirm.png)
- [Pause](../prototypes/draft-room/desktop-paused.png) and [disconnected state](../prototypes/draft-room/desktop-disconnected.png)
- [Mobile player pool](../prototypes/draft-room/mobile-players.png), [queue](../prototypes/draft-room/mobile-queue.png), [team roster](../prototypes/draft-room/mobile-teams.png), and [board](../prototypes/draft-room/mobile-board.png)
- [Mobile player sheet](../prototypes/draft-room/mobile-player-details.png) and [confirmation](../prototypes/draft-room/mobile-confirm.png)
