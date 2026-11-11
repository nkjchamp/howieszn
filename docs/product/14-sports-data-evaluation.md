# Sports-data evaluation and procurement checklist

Status: research prepared; official-page access blocked. No vendor has been selected, contacted, licensed, or purchased. No key has been requested or tested. This evaluation supports the user's instruction to compare providers and pricing before choosing.

## Evidence and access limitation

This session attempted ordinary HTTPS reads through the inherited cloud proxy. The running environment reported current observations and an enforced restricted network policy. All five requests below failed at the proxy CONNECT stage with HTTP 403 and curl exit 56; no vendor page body was received. The policy denial establishes an environment access restriction, not vendor availability or the content of a pricing page.

| Candidate | Official URL attempted | Result |
| --- | --- | --- |
| Sportradar | [NFL overview](https://developer.sportradar.com/football/reference/nfl-overview) | Proxy denied `developer.sportradar.com` |
| Sportradar | [Sports content](https://sportradar.com/sports-content/) | Proxy denied `sportradar.com` |
| SportsDataIO | [NFL documentation](https://sportsdata.io/developers/api-documentation/nfl) | Proxy denied `sportsdata.io` |
| SportsDataIO | [Pricing](https://sportsdata.io/pricing) | Proxy denied `sportsdata.io` |
| Stats Perform / Opta | [American football](https://www.statsperform.com/sports/american-football/) | Proxy denied `www.statsperform.com` |

These are investigation destinations, not verified statements that a particular URL currently contains the expected product or pricing. No network setting was changed. Required access additions for these exact investigations are `developer.sportradar.com`, `sportradar.com`, `sportsdata.io`, and `www.statsperform.com`; additional redirect/API domains should be added only after observing them.

## Candidate comparison

All current commercial facts below remain **unverified**. Even a free trial or accessible endpoint would not establish rights to operate a consumer fantasy product.

| Candidate | Reason to investigate | Public current price | Contract-only status | NFL fantasy redistribution rights | Technical coverage |
| --- | --- | --- | --- | --- | --- |
| Sportradar | User has prior experience; candidate for detailed football facts and live delivery | Unknown: page unreadable | Unknown | Unverified for this product | Unverified |
| SportsDataIO | Alternative NFL documentation and commercial offering to compare | Unknown: page unreadable | Unknown | Unverified for this product | Unverified |
| Stats Perform / Opta | Third professional-data licensing candidate | Unknown: page unreadable | Unknown | NFL coverage and applicable rights both require verification | Unverified |

There is no evidence-backed winner yet. Request comparable written offers after public documentation and rights checks. Do not infer that Stats Perform supplies the needed NFL package, or that any listed vendor's general license includes our use case.

## Product and licensing requirements

Ask each candidate to confirm the exact product, competition, and commercial grant:

- NFL regular season **and postseason**, including byes, reseeding, postponements, Conference Championships, and Super Bowl; stable season/game/team/player identifiers.
- Consumer fantasy use across native iOS/Android and web, territories, expected audience/league scale, free versus paid leagues, and permitted monetization. Do not assume gambling-data rights include fantasy use or vice versa.
- Rights to calculate and display our own scores, position-specific NFL win bonuses, custom rules, and power-up effects; distribution to members through our WebSockets and notifications.
- Historical retention, caching, correction replay, backups, archive display, and use after contract termination. Imported league history is a separate rights/source question.
- Development/test environments, realistic samples, historical replay fixtures, attribution, logos/headshots, and any restrictions on exposing raw facts or allowing user exports.
- Availability/SLA, support escalation, rate limits, concurrent connections, version changes, correction guarantees, and scheduled maintenance. Confirm permitted streaming, webhook, or polling routes; our client WebSocket requirement does not imply a vendor must offer WebSockets.

Require written clarification where rights are absent or ambiguous. Licensing language and asset permissions need appropriate commercial/legal review before launch; the engineering adapter cannot supply those rights.

## Exact mapping for the current fifteen-stat foundation

The keys match `packages/domain/src/types.ts`. **Every provider-field mapping is currently unverified for all three candidates.** This table defines the evidence to obtain; it does not invent vendor schema names.

| Internal key | Required source fact / verification |
| --- | --- |
| `passingYards` | Player-game passing yards; identify gross/net definition and revisions |
| `passingTouchdowns` | Player passing TD count, distinct from rushing/receiving TDs |
| `interceptions` | Interceptions thrown by the player, not team-defense interceptions |
| `rushingYards` | Player-game rushing yards, including negative values and corrections |
| `rushingTouchdowns` | Player rushing TD count; verify penalty/nullified-play treatment |
| `receptions` | Credited catches, with later official revisions |
| `receivingYards` | Player receiving yards; distinguish from air yards and yards after catch |
| `receivingTouchdowns` | Player receiving TD count |
| `fumblesLost` | Fumbles lost, not total fumbles or forced fumbles |
| `extraPoints` | Made extra-point kicks; missed/blocked attempts need separate future facts |
| `fieldGoals` | Made field goals for the current flat rule; distance-based scoring needs per-attempt distance/outcome |
| `sacks` | Team-defense sacks; verify aggregation and fractional/half-sack handling |
| `defensiveInterceptions` | Team-defense interceptions, separate from individual defender data |
| `defensiveTouchdowns` | Explicit definition of defensive TDs and whether kick/punt returns are excluded; avoid double counting |
| `nflTeamWins` | **Derived:** finalized NFL winner plus associated team identity and position-appropriate eligibility; not a provider fantasy-score field |

For NFL team wins, request game participation/status evidence: offensive snaps, active/inactive status, kicker participation, and team-defense representation. The commissioner-facing rule is available to QB/RB/WR/TE/K/DEF; the required qualification is not identical for every position and still needs product definition. A provider's computed fantasy total cannot replace the underlying facts needed for custom scoring.

## Advanced-scoring coverage to investigate

The prototype's larger settings catalog exceeds the current core engine. Verify play-level distance/outcome facts for 40+ yard completions/runs/receptions/TDs, first downs, two-point conversions, sacks taken, pick-sixes, blocked kicks, safeties, return TDs, and field-goal distance tiers. Clarify event definitions, nullified plays, deduplication, and corrections before enabling those settings. Team-defense points-allowed tiers require the vendor's exact points-attribution definition.

Also verify roster/position updates, injuries, official inactive lists, late status changes, and schedule freshness. Injury substitution requires authoritative eligibility at the configured deadline; a late or absent status must not manufacture a retroactive replacement. NFL playoff survival needs explicit game outcomes and bye handling, not an absent game interpreted as elimination.

## Adapter and correction acceptance

Obtain samples for a live game, final game, inactive player, bye, postponed game, and corrected game. Normalize source identity/revision, observed time, received time, status, completeness, and field coverage. A sparse **complete** stat snapshot may define omitted fields as zero; an incomplete or unsupported field remains unknown. Document that distinction explicitly before connecting a live adapter.

Replay duplicate and out-of-order deliveries. Verify that totals and score explanations reconcile, previously recorded outcomes remain reproducible, and late updates are discoverable. The user-selected correction direction is automatic affected transfers only within the configured 24–48-hour cutoff **and before the next round begins**; afterward published results remain stable and corrections enter commissioner review. The provider must expose enough revision/status evidence to support that policy. Exact authoritative cutoff origin and receipt-time handling belong in the settlement contract.

## Comparable pricing request

Use the same scope for each quote: development plus an invited January playoff pilot, then the supported 2027 regular-season launch. Specify expected users, leagues, territories, traffic, data refresh needs, and retention before asking for a firm cost.

Request itemized base/license minimums, NFL/postseason coverage, realtime tier, historical access, calls/connections and overages, derived-score/fanout rights, media assets, test environments, support/SLA, and contract duration/termination. Some lines may be included or inapplicable; obtain explicit confirmation. Separate provider charges from our hosting, storage, notifications, and app-distribution costs.

No dollar estimate or “quote-only” label is defensible from this session's blocked access. Once evidence is available, compare total pilot cost, annual minimum commitment, rights fit, core/advanced fact coverage, correction behavior, latency, and integration effort. A cheaper feed that cannot legally or technically support the selected rules is not an equivalent offer.

## Next actions and decision gate

Continue local replay work without choosing a vendor. Restore authorized access to the listed public destinations or obtain official documentation/quotes through the user's existing relationships. Then verify sample responses and licensing terms, complete this matrix with source links and dates, and select a provider only after budget and rights are understood. No supplier contact, credential entry, purchase, or environment-policy mutation is authorized by this document.

Related: [technical plan](11-technical-plan.md), [scoring model](02-league-rules-model.md), [migration requirements](04-history-migration.md), and [decisions](06-decisions.md).
