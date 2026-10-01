# BDM Project Lineage

This is a source-oriented generation map. Git history searches were read-only across available refs; no historical branch was checked out. Mainline audit snapshot: `32493210db55a30a94a4cefb65bf2aadf5f4dd41`.

## Player, knowledge and user presentation

Legacy Player models / 35 ratings and early overall concepts → recovery and Player Model Intelligence planning → canonical PlayerTruth 80 ratings + 40 tendencies → MatchEngine MG4 uses ratings/tendencies/physical truth → Player Dynamic State adds training stimulus, development history, injury/fatigue/morale links → Player OS/PCB-to-NG workspace migration. Canonical current truth is `PlayerTruthCatalog` and Player domain, with derived impact/age values not persisted. Scouting/OrganizationKnowledge is a separate imperfect actor view, not a later version of truth.

Evidence: commits `cf62b49`, `b90eb61`, `c3fe162`, `a54cbe8`, `3307cec`, `b0cc591`; docs `MG4B`, `MG4F`, `MG4G`, `BS5`, `PLAYER_MODEL_INTELLIGENCE_MIGRATION_PLAN.md`, `BDM_OS_NG_PLAYER_AUDIT.md`.

## Matches and tactics

MatchEngine V0 team-strength prototype → possession-level V2 → MatchEngine V3 player ratings/tendencies, physical truth, spatial state, movement, defense, offensive actions, playcalling and MatchViewer bridge through MG4-MG7 → MatchEngine Next separate branch series BT1-BT4 and Phaser rendering experiments. The current audit HEAD uses V3 as canonical application simulation. Match Next's alternate state machine and presentation are useful historical/parallel source material, not an implicit migration.

Evidence: MG4-MG7 docs, `docs/match-next/ME_NEXT_6_INTEGRATION.md`; commit stream from `c3fe162` through MG7 and Match Next `7a2eea3`/`e8254eb`/`25821d7`/`0062d78`.

## Competition and World DB

Single competition/season foundation → multi-competition calendar → B04 edition formats and playoffs → FIBA-like promotion/relegation → NBA-like and NCAA-like ecosystems → separate men's/women's ecosystem instances → World DB selection, session, bootstrap, fixture/materialization adapters. Competition editions own season windows while GameWorld owns global date. NCAA recruiting/eligibility/academics/NIL/enforcement and NBA draft/salary/trade boundaries remain ecosystem scoped. NCAA future-season continuation is a known gap in the audit docs.

Evidence: Hitos 047-057 architecture narrative; BS1/BS3; World DB docs and `src/engine/competition`, `src/domain/worldDb`.

## Training, medical and Player Dynamic State

Legacy health/training surfaces → player truth/development → Training V1 persisted plans and deterministic scheduled sessions → per-rating Development Stimulus consumed by annual development → Career Fatigue recovery/load processing; separate Injury/medical and MatchSession Fatigue → BS5 connects selected state across matches. Career fatigue and match fatigue remain separate authorities. Training does not directly mutate ratings and Match fatigue is not persisted into career state.

Evidence: `docs/ARCHITECTURE.md` Training V1 section, BS5 docs, training/development/medical tests and engines.

## Staff and Coach RPG

Legacy staff roles and coach-owned RPG data → Staff V2 shared Person root and StaffRole registry → staff professional attributes, organization/assignments, responsibilities/delegation/advisory → workload and human reactions → professional relationships, units/culture/cohesion → conflict → career autonomy → organizational politics/influence/cases/actions/groups → politics UI integration. Coach remains a separate RPG facade over Person+StaffProfile/headCoach assignment; Coach Career, Coach Reputation and Coach Finances have their own engines. Staff V2 is broad existing work and not a greenfield BS13 model.

Evidence: `docs/STAFF_SYSTEM_V2.md`; branches/waves 4B2, 4C1-4C3, 5A-5F4; `docs/ARCHITECTURE.md` Person section.

## Club Strategy and GM

BS9A club strategic state → BS9B needs → BS9C decision context → BS9D option selection/execution safety → BS9E workflow and planning lifecycle → BS11A ContractRosterPlanning projection attaches evidence back to BS9. BS9 does not become a second market engine: BS10 owns candidate economics, negotiation, signing and Trade execution, Finance/Salary owns its specific legality, and Governance owns approval.

Evidence: reviewed BS9A-E documents and audits; BS11A archived docs and implementation `src/engine/clubNeeds/ContractRosterPlanning.ts`.

## Contracts, market and trades

PlayerContract/lifecycle/release and roster integrity → BS10A candidate intelligence → BS10B feasibility economics → BS10C acquisition proposal intelligence → BS10D-A-I authorization, contact, response, offer prep/submission, negotiation, signing, governance and convergence → BS10E-A-D multi-asset trade proposals, negotiations, salary/legal validation, approval and atomic execution → BS11A dated roster planning. BS11A did not add renewal. At the audit HEAD, shared SimulationBreakpoints already covered user game/media, Draft, market/trade, Governance, season and integrity candidates. Later branch `bdm-stage2-bs11b-contract-review-decisions`, commit `34dc2ab`, adds review-decision domain/engine/app/persistence/UI and a contract-horizon candidate to that existing breakpoint system; it is after the audited HEAD and should be reviewed as the immediate sequel.

Evidence: reviewed BS10 reports; current source and tests; `git log --all`; archived BS11A docs.

## Finance and Facilities

Club Finance V2 CF1-CF12: domain → treasury/cashflow → recognition/commitments → economic adapters → contract schedules → forecasts → revenue → operating costs → debt/capital/competition economy → regulation → valuation/financial health/AI → UI certification. Facilities CFI1-CFI8: domain → owner/control/operator/access → Save → component anatomy/capabilities → condition/standard/serviceability → monthly condition progression/maintenance needs → projects → restoration follow-up → finance integration → basketball sporting-context query. Finance V2 lacks a global calendar processor. Facilities deterioration/need opening is already a monthly calendar phase, but the canonical workspace, automated maintenance/project operation and CFI8 consumers remain partial; do not rebuild either foundation.

Evidence: `docs/FINANCE_V2.md`, CF1-CF12 and CFI1-CFI8 certification reports, branch refs and source directories.

## Governance and institutional world

Governance V2 BG1-BG5: decision foundation, objectives/evaluation, decision rights, meetings/requests/commitments → BG6 institutional profiles/structure/instantiation → BG7 boosters/collectives/NIL governance/compliance → BG8 ownership, capital, multi-club conflict and structural regulation. Board evaluation is an actor/expectation subsystem; Governance decision records are approval authority. BG8 and Finance/Facilities remain explicit neighboring authorities rather than duplicated team fields.

Evidence: BG certification reports and branch refs; ownership, governance, investment, structuralRegulation and supporter domains.

## Memory, media and narrative

Legacy news/media and relationships → Coach reputation/career → canonical Personality and general Relationship events → Memory v1 observer-owned record with semantic deduplication and monthly decay → Media/Narrative/InBox engines for selected event families. This is a real base, but not a universal story/event layer: memories presently record limited events and Hito 063 reserves player role memories, dynamic arcs and broader narrative manifestation.

Evidence: `docs/ARCHITECTURE.md` Memory system section; `src/domain/{personality,relationships,memory,media,narrative,inbox}` and engines.

## UI generations and data lineage

Legacy PCB screens/data assumptions → entity action/context menu work → UI NG workspace shell and per-application React models → explicit app/domain commands. RealWorldSpain/World DB data enters through adapters and is materialized to canonical GameWorld; Save is portable runtime state and does not persist external session identity. Preserve prior UI/test intent while changing canonical source binding.

Evidence: PCB recovery/migration docs, `src/ui`, `src/ui-ng`, `src/app`, `src/domain/worldDb`, `src/save`.
