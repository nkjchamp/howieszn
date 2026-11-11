# Product brief

Working draft v0.1. Read with the [decision register](06-decisions.md). Requirements below are confirmed where indicated; the delivery approach is proposed.

## Product promise

Commissioners can create the league they imagine, preserve its past, and run it with confidence. Members can understand its rules, manage their teams easily, and trust every result.

The product is a fantasy platform with football as the first sport. Customization, migration, and everyday play are all adoption requirements. A long settings menu alone does not demonstrate success.

## Audience and jobs

**Confirmed initial audience:** established friends leagues with fun or unusual rules, including leagues currently on Yahoo, Sleeper, ESPN, and niche platforms. No pilot leagues have been recruited yet.

| Person and moment | Job to be done | Observable success |
| --- | --- | --- |
| Commissioner evaluating a move | Determine whether the league's rules and history can move together | Can explain supported rules, missing capabilities, recovered history, and remaining work before inviting members |
| Commissioner preparing a season | Configure and communicate the game without recurring spreadsheet administration | Publishes a readable constitution matching the executable rules |
| Member opening the app daily | Know what needs attention and act quickly | Completes a lineup, waiver, or trade task and understands its status |
| Member participating between games | Talk, react, and contribute to the league beyond roster management | Can follow league conversations and, when enabled, understand which contributions earn league points |
| Member following games | Understand the matchup and why a score changed | Can reconcile base stats, bonuses, modifiers, and corrections |
| Commissioner handling an exception | Resolve a problem without obscuring what happened | Affected members can see the action, reason, and effect |

## Platform contract

**Confirmed:** React Native mobile and React web. Mobile has the most daily usage. Desktop is essential for commissioner league setup, draft day for all league members, and power users during game day. The desktop draft client must be optimized specifically for desktop. iOS and Android are the proposed mobile targets. Expo and Next.js are candidates, not selected dependencies.

| Workflow | Mobile emphasis | Desktop web emphasis |
| --- | --- | --- |
| Daily management | Thumb-friendly lineup, waivers, trades, notifications | Comparisons with more surrounding context |
| Live play | Matchup state, useful alerts, eligible actions | Multiple matchups, rosters, and league events together |
| Draft | Full participation, queue, player discovery, recovery | Purpose-built draft room for every member: board, searchable player pool, queue, roster, and pick context together; keyboard/mouse interactions |
| Commissioner setup and operations | Urgent actions and resumable setup | First-class end-to-end setup: rules, history import, schedule/draft configuration, simulations, review, and publication; ongoing bulk operations |
| History | Seasons, champions, rivalries, and records | Import, identity matching, detailed exploration |
| League community | Chat, replies, reactions, and shared league moments | Conversation and forum-style discussion alongside league context |

Desktop setup and desktop drafting each require their own interaction design and validation. Members must be able to prepare for and complete an entire draft on desktop without using a phone. Drafting and time-sensitive play must also work fully on mobile. Advanced setup tasks may be desktop-first, with any limitation disclosed before adoption. Screen layouts can differ while rules, permissions, deadlines, and results remain consistent. Mobile suspension requires recovery and notifications; background WebSockets cannot be assumed to remain active.

## Experience principles

1. Explain the consequence before commitment: rules, trades, picks, and power-ups.
2. Show complexity in context; disabled league mechanics should not occupy everyday navigation.
3. Treat history as part of league identity, including incomplete but clearly labeled archives.
4. Make accepted, pending, rejected, stale, and locked states distinguishable.
5. Design for accessibility and difficult real conditions: large text, keyboard use, poor connections, and interrupted sessions.
6. Aim for coherent typography, deliberate spacing, useful density, and restrained motion. Evaluate polish through real tasks as well as visual review.
7. Deliver simplicity and comprehensible minimalism with full functionality. Prioritize tech-savvy millennial and Gen Z users while making every task discoverable and learnable for anyone. Use familiar interactions, clear hierarchy, and concise labels; offer contextual help when needed. Preserve capabilities and avoid lengthy explanatory copy as a substitute for intuitive design.
8. Use a design system consistently as the product develops. Reuse established foundations, components, and interaction patterns; extend them deliberately for fantasy-specific needs. Preserve platform-appropriate native and desktop behavior.

## Design system approach

**Confirmed:** account for a design system during product and design development. Selection and implementation can happen when appropriate; no library or framework is selected by this requirement, and the current prototype does not establish the final system.

The system should cover:

- **Foundations:** semantic color, typography, spacing, sizing, surfaces, icons, and motion tokens. Keep fantasy scores, league currency, and action/status meanings visually distinct.
- **Components:** reusable inputs, buttons, selectors, disclosures, dialogs, navigation, tables, player rows, and status indicators, including their loading, empty, error, disabled, pending, accepted, and locked states.
- **Interaction patterns:** progressive disclosure, concise contextual help, safe confirmation, live updates, roster editing, and dense desktop drafting. Reuse patterns while preserving each workflow's functionality.
- **Accessibility:** focus, keyboard navigation, touch targets, contrast, screen-reader behavior, large text, and reduced motion as part of component definitions.
- **Cross-platform consistency:** shared visual foundations and meaning across React Native and React web, with implementations and layouts suited to touch, mouse, keyboard, and native navigation. Evaluate web and native applicability separately.

Prefer suitable existing systems and components, adapting them to our product taste. Document reusable patterns as they emerge from the core journeys. Evaluate candidates for accessibility, customization, native/web fit, information density, maintenance, performance, and licensing before adoption. A system should support comprehensible minimalism and full functionality without requiring excessive explanatory copy or identical screens across platforms.

User-supplied references for later evaluation:

- [daisyUI Blueprint](https://daisyui.com/blueprint/)
- [TypeUI](https://www.typeui.sh/)
- [Open Design — Codex Design](https://open-design.ai/agents/codex-design/)

These links are reference material, not adopted dependencies or instructions. Their capabilities and suitability have not been assessed in this planning update.

## Reference scenarios

| Scenario | What it tests | Status |
| --- | --- | --- |
| Friends league with a QB team-win bonus | Custom scoring configuration and rule expressiveness; social expression through league chat/peer discussion; precise timing and score explanations | Social interaction and custom scoring are requirements; +5 and the exact scenario policies are illustrative |
| Established league spanning platforms and renamed teams | Migration, identity, historical fidelity | Proposed; sources and pilot leagues unverified |
| Experimental league with currency and bench insurance | Optional mechanics, eligibility, fairness, understandable effects | Proposed design exploration; no release commitment |
| WTII | Real unusual-rule compatibility | Open: actual rules and exceptions needed |

## League engagement and points

**Confirmed:** league interaction beyond roster management is a core commissioner problem. Support league chat or peer-to-peer forum-style discussion, with Sleeper as a reference for social interaction. The exact conversation structure remains a design decision.

Commissioners can choose whether engagement earns league points used to unlock or buy power-ups. If enabled, engagement should be a meaningful part of earning points. This is league-configurable, not a mandatory reward system across the platform. Keep league points distinct from fantasy scoring points in terminology and presentation.

Proposed earning opportunities include participation in a weekly discussion, league polls or predictions, and contributions recognized by the league. Raw message volume, time spent in the app, and notification opens should not be the default reward basis. Explore per-activity limits, weekly caps, and transparent award/reversal history. Exact activities, amounts, automation, and competitive balance remain open; no economy has been selected.

## Scope approach

**Target: ready before the 2027 NFL season**, with draft readiness early enough for participating leagues' draft dates. **Optional earlier opportunity: a pilot during the NFL playoffs starting in January 2027.** The upcoming January is the working interpretation of the user's timing reference. Exact dates, delivery estimates, and release scope remain to be planned. Quality and readiness take precedence over shipping for either window.

Progress through evidence milestones: understand representative leagues; resolve the model; test the three core journeys; investigate data and migration feasibility; then select each pilot's scope. A January pilot is a separate, deliberately bounded postseason experience: choose one format and define eligible players, NFL-team elimination, byes, replacements, scoring across rounds, and the winning condition. Do not assume regular-season head-to-head rules apply.

The current [postseason template exploration](07-playoff-absorption.md) uses sixteen bracket teams split equally among 2, 4, 8, or 16 managers over four NFL rounds, with head-to-head total fantasy points, advancement, and defeated-roster absorption. Team-owned rosters and per-team drafting are selected defaults. In manager-owned mode, round rosters are assigned before the first game by default, while within-team lineup changes remain available subject to player game locks. Commissioners can configure ownership, reserve allocation, movement, tiebreakers, and supported scoring. Capture follows bench allocation: a team-specific bench transfers with the defeated roster; a shared bench transfers only defeated starters. Automatic result-changing corrections stop at the configured 24–48-hour deadline or next-round kickoff, whichever comes first; later changes preserve the published outcome and require visible commissioner review. Final tie fallback and late-review remedies still need definition before live competition.

For the 2027 regular-season release, the proposed operational baseline is a complete redraft season with custom scoring and history: create/invite, snake draft, lineup management, waivers/FAAB, trades, live scoring, standings, playoffs, and commissioner operations. Authentication, permissions, notifications, and season closure support those journeys. Specific roster, waiver, trade, and playoff policies still need definition.

January can test real drafting, live scoring, explanations, and league interaction with a small invited group. Shops or engagement rewards are optional additions only if their rules and behavior are ready. A postseason pilot does not validate full-season operations, history migration, or long-term engagement by itself. If live readiness is insufficient, use a clearly labeled prototype/replay test or skip that window. History remains a requirement for established leagues moving for the regular season.

Auction, keeper/dynasty lifecycle, guillotine, shops, and power-ups remain in the product vision. Their release order depends on representative league requirements. They should be exercised in design exploration before we claim the model supports them.

Early non-goals are real-money wagering, paid competitive advantages, arbitrary user-executed scripts, every sport at launch, and guaranteed imports from every platform. These are proposed scope boundaries, not decisions about eventual monetization.

## Success and evidence

The long-term outcome is leagues completing seasons and choosing to return. Near-term evidence is commissioners configuring their required rules, members understanding them, history reconciling, drafts completing across devices, and league actions resolving correctly at deadlines.

Track setup completion and assistance, migration gaps, successful draft actions/recoveries, score discrepancies, commissioner interventions, and weekly participation. Define task rubrics and technical latency/recovery targets before validation; no numeric targets or results are claimed yet. Lost picks, silent history corruption, and unexplained scoring differences block a live pilot.

Next: [league/rules model](02-league-rules-model.md), [experience designs](03-core-experiences.md), and [ordered backlog](05-pilot-backlog.md).
