# League history and migration

Status: planning proposal. No provider research, connector calls, OCR evaluation, or imports have been performed. The prototype below is a noninteractive paper walkthrough. WTII requirements and historical records have not been supplied; nothing here asserts what that league needs.

See the [product brief](01-product-brief.md), [rules model](02-league-rules-model.md), [core experiences](03-core-experiences.md), [pilot backlog](05-pilot-backlog.md), and [decisions log](06-decisions.md).

## Product promise and boundary

A commissioner should bring their league's memory when moving here. Members should recognize past champions, rivalries, franchises, and records. Migration must explain recovered, unreviewed, and unavailable history before anything becomes official.

Support two explicit outcomes:

- **Structured history:** reviewed seasons, teams, standings, matchups, scores, and championships that can appear in league records. Each field needs source evidence and a confidence/review state.
- **Archive:** original exports, documents, or screenshots that preserve context when reliable structured extraction is unavailable. Archiving a standings screenshot does not establish structured matchup coverage.

Imports can contain both. Show season coverage; never silently promote archives into verified records.

## Coverage discovery

Required outcomes describe product goals; availability depends on provider permissions, interfaces, retention, account access, and source quality. Every capability cell is **UNVERIFIED**: an investigation target, not a supported integration.

| Capability | Yahoo | Sleeper | ESPN | Niche/defunct platform |
| --- | --- | --- | --- | --- |
| League and season identity | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Teams, owners, and name history | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Final standings and champions | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Weekly matchups and official scores | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Rosters and transaction history | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Settings and scoring-rule history | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |

Candidate routes to investigate are authorized provider interfaces, commissioner-held exports, manually entered records, authorized league-page extraction, and uploaded screenshots/documents. None is a verified route for any listed provider. Investigate public documentation and access requirements before promising a connector. Do not request passwords or bypass access controls. Screenshot extraction, if later adopted, must retain the original and require human review of extracted names, dates, scores, and table structure.

## Identity and historical integrity

Give leagues internal identities independent of provider IDs. Map source seasons separately: changing platform or external ID need not create a new league.

Distinguish a continuing franchise from its seasonal team name and from its owner. Model ownership eras; a renamed team may remain the same franchise, while a returning owner may manage a different franchise. Similar names suggest a match for review; they do not authorize an automatic merge. Preserve unresolved owners as unknown and let commissioners revisit them.

Historical official results remain as imported and approved. Never recalculate them using today's scoring rules, present-day player statistics, or later power-up logic. A historical correction requires explicit commissioner action, retained evidence, and a revision trail. Label computed aggregates with the seasons and completeness they cover.

Store provenance at the record or field level: source platform, external identifiers when available, season, supplied artifact, import batch, review decision, and subsequent revisions. Missing is distinct from zero. An unavailable score appears as “Unknown”; a supplied score of `0.00` stays `0.00`. Incomplete matchup coverage cannot produce an apparently complete all-time scoring leaderboard.

Reimport must be idempotent: unchanged source records must not duplicate seasons, franchises, or matchups. Show changed records as a proposed update, preserve reviewed identity mappings, and require resolution when new evidence conflicts with an approved value. Support canceling an unapproved batch and reversing a committed batch without deleting unrelated history. If later approved edits depend on that batch, preview those dependencies and require a resolution; reversal cannot silently discard subsequent work.

## Paper prototype: five import states

All sample data is fictional; these are proposed screens, not working software.

1. **Choose history.** “Bring your league history” offers source selection and artifact upload. The fictional *Sunday Founders* league supplies 2021 Yahoo records, 2022 Sleeper records, and 2023 ESPN screenshots. A season list keeps all three under one continuing league. Each source shows “Availability unverified.”
2. **Review coverage.** The draft summary shows 2021 standings and six supplied matchups; 2022 standings with incomplete ownership; 2023 archival screenshots awaiting transcription review. No screen implies a complete season merely because six matchups were supplied.
3. **Resolve identity.** “North End Knights” in 2021 and “North End” in 2022 are proposed franchise matches. The 2022 owner is missing. The commissioner can confirm franchise continuity while leaving ownership unknown, supply evidence for an ownership era, or keep separate franchises. The system does not infer the owner from the team name.
4. **Review results.** A supplied 2021 matchup shows North End Knights `113.70`, River Rats `108.20`. A 2022 matchup has one unknown score; another supplied score is `0.00`. The 2023 screenshot transcription remains explicitly unreviewed until a human compares it with the original. A conflict drawer displays competing evidence without choosing silently.
5. **Confirm and inspect.** The commissioner approves selected structured records and archives the unresolved material. The receipt lists included seasons, unknown fields, exclusions, and provenance. Repeating the same batch previews “No changes”; later evidence previews a revision. League members see the same coverage limitations in history views.

## Pilot acceptance template

Recruitment is pending for every pilot. These labels are candidate coverage slots, not recruited leagues or claims about their rules.

| Slot | Historical source | Recruitment | League-specific acceptance |
| --- | --- | --- | --- |
| P1 | Yahoo | Pending | To define with commissioner |
| P2 | Sleeper | Pending | To define with commissioner |
| P3 | ESPN | Pending | To define with commissioner |
| P4 | Niche platform | Pending | To define with commissioner |

For each recruited league, record requested seasons, authorized source access, required versus optional records, franchise/ownership decisions, acceptable archive-only gaps, and expected official results. The commissioner must approve a reconciled sample, coverage report, duplicate-free reimport, conflict handling, and batch reversal. Accept that league only against its agreed criteria; provider coverage alone does not establish success.
