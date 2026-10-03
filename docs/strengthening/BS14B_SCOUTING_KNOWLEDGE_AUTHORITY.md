# BS14B — Scouting Knowledge Authority Convergence

**Status:** Implemented and validated; commit recorded in the final response.

## Re-anchor and provenance

- **Selected BS13 base branch:** `bdm-stage2-bs13e-staff-gameplay-manifestation`
- **Selected BS13 base SHA:** `8bb698b8c4b1f766d38ca9edb4da6ca5e0607f84`
- **Base selection:** this is the latest clean committed BS13E state found in the available repository history, and it descends from the known BS13 strengthening commits. A fresh worktree at this SHA avoided carrying unrelated local edits from the dirty checkout, including `src-tauri/Cargo.toml`.
- **BS14A audit source:** `c52a21717a5973ee33d99a0df3000d405bcb9847`.
- **BS14A audit commit cherry-picked:** `fb330b4f0dcee42de9f19edeed89a3f8ea125b63`.
- **BS14B starting SHA after cherry-pick:** `24b8decd203f130cdccaf117a4f0f13283b12abb`.

The BS13E delta adds Staff responsibility/delegation, workload, evaluator quality, calendar integration, and associated save/runtime behavior. The inspected relevant paths show no change to the scouting knowledge data shape, report completion authority, V1 migration boundary, or acquisition valuation input. BS14A's scouting-authority conclusions remain current; this implementation updates the ACB test-game exception and closes the duplicate runtime authority.

## Authority and ownership

`GameWorld.organizationKnowledge` is the only current mutable Player scouting knowledge collection. Report completion consolidates findings there. The `PlayerKnowledgeRecord` type and V1 `playerKnowledge` array are compatibility input only: no `GameWorld.playerKnowledgeById` runtime map exists, and current reports do not dual-write legacy records.

### Deprecation boundary

- **Who may create it:** no production gameplay path creates `PlayerKnowledgeRecord`; old save files may contain it, and tests may construct legacy fixtures.
- **Who may read it:** only the Save V1 parser and migration code read the old record shape.
- **When it converts:** during V1 deserialization, before a runtime world is created; V2+ saves contain OrganizationKnowledge.
- **Why it remains:** old V1 save compatibility still needs to preserve representable estimates and uncertainty.
- **Removal point:** a later save-format retirement milestone (planned for BS14H save lifecycle/integration certification) may remove the V1 reader and the legacy record contract once old V1 saves are no longer supported.

Knowledge ownership follows the existing `Team.organizationId` field. V1 migration resolves each observer team against the deserialized Team collection and uses that exact organization ID; unknown observer teams fail migration instead of silently using the team ID. Multiple teams can share an organization. Generated and WorldDB data carry stable organization IDs, and both human and AI teams resolve through their Team record.

## V1 migration behavior

The V1 boundary converts every seven-dimension legacy finding into an OrganizationKnowledge finding with `legacyBaseline` provenance, its original estimate and assessment date, and the legacy uncertainty. It derives conservative confidence and ownership coverage. When multiple legacy observer teams resolve to the same organization and subject, migration returns one record; it combines estimates deterministically and expands uncertainty to cover the input ranges, capped at the OrganizationKnowledge maximum. Output is sorted and repeated migration is deterministic. The V1 serializer emits an empty legacy array; V2+ persists current OrganizationKnowledge.

## Creation paths

- **Generated world:** begins with empty OrganizationKnowledge and no legacy runtime authority.
- **WorldDB:** begins with empty OrganizationKnowledge and no legacy runtime authority. Shared Team-to-Organization mappings remain intact across save/load.
- **ACB test game:** its special deterministic baseline is now created directly as `legacyBaseline` OrganizationKnowledge for the user's organization. It does not create or update PlayerKnowledgeRecord.

The ACB initial baseline is test-game-specific; normal generated and WorldDB starts remain unseeded in this milestone.

## Consumer certification

- Current report completion writes OrganizationKnowledge only.
- Organization/player evaluation reads OrganizationKnowledge and retains its UNKNOWN prior when no finding exists.
- The Market workspace knowledge badge now reads by `team.organizationId`; market valuation already used OrganizationKnowledge.
- Trade, draft, recruiting, and AI free-agent/draft/recruiting rankings use OrganizationKnowledge-based evaluation/valuation inputs.
- Tactical opposition preparation remains a distinct team/game report artifact. It may consume OrganizationKnowledge but does not merge with evaluator reports or own Player findings.

No valuation formulas, scouting dimensions, profile visibility policy, 80-rating report behavior, or geography behavior changed in BS14B. The Player profile's direct PlayerTruth exposure remains a BS14C issue.

## Files and verification

The implementation removes the runtime legacy index and enrichment helper, introduces deterministic V1 conversion into OrganizationKnowledge, updates the Market workspace, and adapts ACB, Staff, and save fixtures. Focused tests cover report writes/no legacy runtime field, OrganizationKnowledge evaluation, market/draft/recruiting consumers, V1 migration and idempotence, generated/WorldDB/ACB startup, and V2/V3/V4 persistence. Validation is limited to those focused tests, TypeScript typecheck, production build, and `git diff --check`; no full test suite is run.
