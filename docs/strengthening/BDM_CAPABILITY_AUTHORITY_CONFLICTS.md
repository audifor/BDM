# BDM Capability Authority Conflicts

Classification is about who owns a fact and whether another copy competes with it. No conflict is repaired in this audit.

| Concept / possible competing owners | Classification | Evidence-based finding | Risk / owner |
|---|---|---|---|
| Current roster membership vs active contract team | DUPLICATE AUTHORITY RISK | `Team.rosterPlayerIds` is membership authority; `PlayerContract.teamId` independently describes contract party. World validation checks references, and market/repair paths use both. BS0 audit specifically found no general invariant enforcing active-contract team == roster team. | High. BS11/BS22 should define invariant and error/recovery boundary; no silent precedence. |
| Team roster vs scheduled future contract | SAFE PROJECTION | dated contracts provide future arrival/retention evidence; BS11A planning is derived and does not mutate `Team.rosterPlayerIds`. | Preserve view vs membership distinction. |
| Club Finance vs Salary Cap/payroll vs Team salary budget | COMPATIBILITY SURFACE / DUPLICATE AUTHORITY RISK | Finance ledger/cash/commitments; Salary Engine capHit/obligations/Trade matching; legacy TeamFinances salary budget used in some affordability. CoachFinances is personal cash and separate. | Medium-high. BS16 map concepts first and coordinate affordability; never sum cash, capHit, annual salary and budget. |
| UI-local or PCB Game state vs GameWorld | LEGACY | legacy migrated screens and old Club Facilities local values do not necessarily reflect canonical GameWorld. `ui-ng` workspaces use app/domain boundaries, but old surfaces remain. | High where a legacy screen looks authoritative; label/migrate per subsystem. |
| Player 35 ratings / overall vs PlayerTruth 80 ratings and 40 tendencies | SUPERSEDED | PlayerTruth catalog and migration docs establish new truth; no persisted overall per product guardrails. | Do not revive former truth model. |
| PlayerTruth vs OrganizationKnowledge/scouting | SAFE PROJECTION | true ratings/potential and organization-scoped estimates are deliberately separate. Knowledge coverage/confidence gates market/scouting use. | High if AI or UI leaks hidden truth. Keep actor information boundary. |
| MatchEngine V3 vs Match Next kernel | LEGACY | V3 is connected to canonical match application at this HEAD; Match Next source/branches are separate runtime and presentation work. | High. Don't combine or switch authorities by feature convenience. Port ideas/tests only. |
| Club Strategy/Club Needs/GM plan/Market action | SAFE PROJECTION | BS9 assesses needs/context/selects workflow; BS10 owns negotiation and transaction; Governance authorizes gated actions. Planning does not execute. | Preserve selection/execution separation. |
| Contract offer vs contract vs Transaction record | SAFE PROJECTION | offers/negotiations are intent/lifecycle; executed contract and immutable transaction records are separate. | Avoid treating submitted offer as roster or salary truth. |
| Player contract vs staff contract vs Coach personal finance | SAFE PROJECTION | employment contracts are institutional obligations; personal finance is individual wealth/cash; staff and player contracts have role-specific terms. | Do not generalize contract semantics without feature decision. |
| Salary cap dead money vs retained salary vs club cash | SAFE PROJECTION | different legal/accounting concepts in Salary/Trade and Finance; retained salary is distinct from dead money. | Keep separate ledgers and validation. |
| Facilities component capabilities vs current condition vs sporting impact query | SAFE PROJECTION | CFI3 defines what exists/capability; CFI4 condition; CFI8 derived context. | Integration absent is not duplicate authority; activate through explicit consumers. |
| Facilities V2 vs legacy Facilities tab | DUPLICATE AUTHORITY RISK | legacy Club Facilities UI uses `clubFixtures`/local state per BS0, while CFI V2 is persisted GameWorld domain. | Do not surface legacy local values as V2 facts. |
| Board evaluation vs Governance rights/decisions | SAFE PROJECTION | Board engine evaluates expectations; Governance records decision rights, approval, commitments and actions. | Connect results to decision records only by explicit policy. |
| Person vs Player/StaffPerson/Coach | SAFE PROJECTION | Person is shared human identity; Player/Staff are role profiles; Coach is RPG facade over Person+Staff profile. | Preserve identity and role profile distinction. |
| Coach reputation vs Staff reputation vs institutional reputation | SAFE PROJECTION | separate models and target types. | Avoid a single opaque “reputation” number. |
| Morale vs personality vs relationship vs memory | SAFE PROJECTION | four distinct representations: affect state, traits, directed relationship events, observer-owned memory. | Effects overlap only through explicit event consumers. |
| MatchViewer vs MatchEngine | SAFE PROJECTION | Engine produces deterministic sporting result/event timeline; viewer owns reveal/timing and controls presentation only. | Don't let visual frame rate decide gameplay. |
| Standings/series projections vs persisted Game/history | SAFE PROJECTION | standings/bracket state derive from Games/rules; selected season histories/champions persist. | Rebuild derived tables; do not duplicate state. |
| World DB vs GameWorld | SAFE PROJECTION | external DB identity/provenance and bootstrap adapter are outside runtime Save; GameWorld materializes canonical entities. | Keep DB session out of Save, maintain source provenance. |
| Save schema vs GameWorld source | COMPATIBILITY SURFACE | Save V4 is serialization envelope and migration boundary; canonical factories validate reconstructed world. | Keep migration additive and don't treat serialized mirrors as domain authority. |
| Training plan vs responsibility | COMPATIBILITY SURFACE | persisted Team TrainingPlan is operational input; Responsibility governs who acts; old training responsibility map has explicit migration compatibility. | Do not create parallel action ownership. |
| Draft pick original team vs current owner | SAFE PROJECTION | immutable Pick identity/origin; transferable current owner is authoritative right to select. | preserve both; never recreate IDs on trade. |
| Media, Narrative and Memory event capture | UNKNOWN | The three systems intentionally represent different things, but a complete event-to-memory/news/narrative source map was not established in this audit; no duplicate canonical authority was proven. | BS20 should map source-event IDs and capture coverage before adding a unified event layer. |

## High-priority authority guardrails

1. Assert roster/active-contract consistency through one explicit invariant/repair policy.
2. Keep finance/cap/cash/budget values named by their actual semantics.
3. Make all user/AI market, Governance and UI flows call the same contract/Trade engines.
4. Use organization knowledge where actors evaluate people; do not hand AI raw truth.
5. Keep MatchEngine V3, Match Next, viewer and world result application separated.
