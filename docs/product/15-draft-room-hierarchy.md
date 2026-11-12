# Draft room: information hierarchy revision

Implemented in the React web client after the user's review of the hosted foundation. The feedback was that core drafting worked, while the data hierarchy and page structure needed substantial improvement. This revision covers desktop and responsive mobile web. The [earlier HTML study](09-draft-room-walkthrough.md) remains a separate historical prototype.

## Primary workspace

The current turn, player choice, and pick action take priority. A compact header identifies the league, draft state, fixed picking team, round, and pick. Commissioner pause/resume stays beside that context. There is no decorative countdown or unsupported player projection.

A narrow progress strip shows accepted picks and the next three actual snake-draft seats. The full sixteen-team board is available through an explicit control. It is secondary to finding and selecting a player.

Desktop uses three columns:

| Area | Responsibility |
| --- | --- |
| Players | Search, position filter, availability, natural positions, NFL teams, and queue actions; results scroll inside the panel |
| Selected player | Position, fixture rank, eligible slots, roster-fit status, fixed picking team, and reachable pick/queue actions |
| Team context | One scoped selector and quick switches for the roster/private queue being inspected; all six starting slots stay visible at the tested laptop sizes |

Full-board inspection opens over the upper workspace on desktop. It has its own scrolling and does not move the pick action. Closing or pressing Escape inside the board returns focus to its trigger. Selecting an already-drafted player reveals their details. The board stays mounted, retaining scroll position when closed and reopened.

## Team scope and action safety

The inspected team and the picking team are separate. For example, Alex can inspect Team 02's roster and edit its queue while the current pick remains assigned to Team 01. The pool labels the queue destination; the turn header, pick action, and confirmation identify the fixed picking destination. A shortcut returns inspection to the picking team.

Confirmation freezes player, team, pick index, and revision. A changed turn cannot redirect it. Pausing disables an already-open confirmation while preserving the original intent. Resume does not silently replace its captured revision; a conflicting confirmation must be reviewed again.

An uncertain acknowledgement retains the shared client's original command identity and revision. Recovery remains accessible inside dialogs, and new mutations remain blocked until reconciliation. Picks, scoring, storage, ownership, and queue privacy rules are unchanged.

## Mobile web

At widths of 900px and below, Players, Queue, Roster, and Board are separate workspaces beneath the turn context. The board scrolls within its own region. Player details open in a bottom sheet with the destination and action together. Opening confirmation closes the research sheet first, avoiding stacked dialogs. Widening the browser closes only the mobile research sheet and retains the selection and any confirmation.

Queue reordering supports keyboard controls. A keyboard move restores focus to the same player's logical enabled move control after saving, including a fallback when the player reaches a boundary. Typing in search, changing teams, or focusing another row prevents focus restoration from interrupting that newer intent. Pointer moves do not trigger keyboard-only restoration.

## Validation

| Viewport / scenario | Result |
| --- | --- |
| 1440 × 900, 1366 × 768, 1280 × 800, 1024 × 768 | Search, selected player, picking context, primary pick action, and all six roster slots visible without document scrolling in the default view, including the draft-start notice |
| Expanded desktop board | Primary pick action retains the same vertical position; board scroll survives close/reopen; Close/Escape return focus correctly |
| 390 × 844 and 360 × 800 | No horizontal document overflow; mobile workspaces, sheet, queue, roster, and confirmation exercised; horizontal board scrolling remains contained |
| Draft behavior | Private team queues, another-owned-team inspection, immutable targets, stale/pause conflicts, remote turn changes, and complete 96-pick draft exercised through an isolated API |
| Realtime preservation | Search, position filter, selection, viewed team, player-list scroll, and board scroll retained across relevant updates |
| Lost acknowledgement | Dropped response after commit recovered with the original command ID/revision; exactly one pick recorded |
| Keyboard review | Independent browser checks covered repeat moves, boundary fallback, search/team/other-row focus preservation, and pointer behavior |
| Build | Web TypeScript and production build passed; browser exercises reported no JavaScript errors |

All browser mutations used disposable local fixtures; the hosted review league was not changed. These checks establish local browser behavior, not customer usability, native-device behavior, performance under live draft load, or accessibility conformance. No backend, database schema, or infrastructure configuration changed in this revision.

## Screenshots and release

- [Desktop](../validation/draft-hierarchy/desktop.png) and [short laptop](../validation/draft-hierarchy/laptop.png)
- [Expanded board](../validation/draft-hierarchy/board.png)
- [Different inspected team](../validation/draft-hierarchy/queue-scope.png)
- [Mobile players](../validation/draft-hierarchy/mobile.png), [player sheet](../validation/draft-hierarchy/mobile-player.png), and [queue](../validation/draft-hierarchy/mobile-queue.png)

The source is intended for `preview/protected-hosting`. Application auto-deployment is disabled. To review it on Render, open the `howieszn-preview` web service and manually deploy the latest commit on that branch. This revision retains existing PostgreSQL data. Live visual verification follows that deployment; no automatic live result is claimed here.
