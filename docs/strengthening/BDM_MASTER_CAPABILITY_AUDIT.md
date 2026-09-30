# BDM Master Capability Reuse & Manifestation Audit

## Audit base and result

- **Branch:** `bdm-master-capability-reuse-audit`
- **Audit code/documentation base:** `32493210db55a30a94a4cefb65bf2aadf5f4dd41`
- **Separate prerequisite archive commit:** `7b4d551b62ca5ef33c7a394a4788cea6dce75c59` (`docs(strengthening): archive reviewed contract roster planning`)
- **Final audit commit:** recorded as the atomic documentation commit on this branch (see final Git record).
- **Worktree:** isolated `C:\BDM-CAPABILITY-AUDIT`; original BS11A worktree and other BDM worktrees were not accessed or changed.
- **Production behavior:** unchanged.

This audit finds that BDM has already built broad canonical basketball simulation, player truth and development, world/competition lifecycle, contracts/market/trades, NCAA ecosystems, Staff V2, Coach RPG/career, Finance V2, Facilities V2 and Governance V2. The largest remaining deficits are selected cross-system connection, manifestation, subsystem cadence and long-horizon closure. A shared deterministic breakpoint projection already handles important user/system candidates; review its severity and action surfaces rather than rebuilding it.

## Scope and sources inspected

- Current source trees: `src/domain`, `src/engine`, `src/app`, `src/integration`, `src/save`, `src/stores`, `src/ui`, `src/ui-ng`, `src/tauri`; tests colocated with subsystems and application workspaces.
- Canonical docs: `docs/ARCHITECTURE.md`, `docs/autopilot/PRODUCT_GUARDRAILS.md`, Save/PCB migration docs, `docs/FINANCE_V2.md`, `docs/STAFF_SYSTEM_V2.md`, player intelligence and Player OS migration audits.
- Strengthening evidence: BS0 game-loop/matrix/authority docs; BS1-BS5, BS8-BS11 reviewed milestones and detailed BS10A-I/BS10E-A-D reports; archived BS11A contract/roster planning docs.
- Certifications: MatchEngine MG4-MG7, ME Next/BT branches, CF1-CF12, CFI1-CFI8, Governance BG1-BG8, World DB and NCAA ecosystem source docs.
- Git history: current 80-commit lineage, all-ref feature searches and branch refs for Staff V2, Finance V2, Facilities V2, Governance V2, PlayerTruth/Player Intelligence, MatchEngine V3, Match Next, World DB and BS11B. Historical refs were read only; none checked out. No other worktree was touched.
- Tests: source and existing test names/coverage were inspected as evidence; no test suite was run, consistent with audit instructions.

No separate fuller `MASTER PROJECT PROMPT` or product source-of-truth file was found in the repository inventory. `docs/BDM_OS_3.md` provides UI/system design direction, not a replacement for `docs/ARCHITECTURE.md` or the supplied product guardrails. Open `TO DECIDE` items in the Staff specification remain proposals, not decisions. The earlier BS0 audit was used as historical evidence and its breakpoint/Facilities statements were checked against current source; updated findings in this audit reflect current code.

The detailed capability table is in [BDM_MASTER_CAPABILITY_REGISTRY.md](BDM_MASTER_CAPABILITY_REGISTRY.md); the field-by-field Contract authority and later BS11B branch review is in [BDM_CONTRACT_DEEP_AUDIT.md](BDM_CONTRACT_DEEP_AUDIT.md). Hidden, dormant, legacy, specification, authority, lineage, integration and product-surface findings are in the linked companion reports.

## Capability accounting

The registry contains **115 decomposed capability rows**, each with one primary status:

| Status | Count |
|---|---:|
| CANONICAL_ACTIVE_VISIBLE | 67 |
| CANONICAL_ACTIVE_HIDDEN | 11 |
| CANONICAL_PARTIALLY_CONNECTED | 19 |
| MODELED_NOT_ACTIVE | 1 |
| LEGACY_BUT_USEFUL | 3 |
| SPECIFIED_NOT_IMPLEMENTED | 8 |
| SUPERSEDED | 2 |
| ACTUALLY_MISSING | 4 |

Rows are decomposed capabilities across many systems, not an inventory of every enum/value/method. The highest priority findings are missing/partial subsystem connections and manifestations: Club Finance lacks a global calendar processor, Facilities lacks its canonical workspace and sporting consumers despite an active monthly condition phase, and Governance `IMPORTANT` action candidates have no general resolver. A shared breakpoint projection already handles multiple user/system events and should be extended only for demonstrated gaps.

## Highest-value findings

### Top hidden and dormant capabilities

1. **Facilities V2** has persisted ownership, access, component anatomy, condition, maintenance, projects, finance bindings and CFI8 sporting context. Monthly condition progression and maintenance-need generation are active in Calendar. The canonical workspace is absent; CFI8 is not consumed by training/medical/staff/match.
2. **Club Finance V2** has CF1-CF12 ledger, treasury, commitments, revenue/cost, forecast, debt, regulation, valuation, health and AI recommendation capability. It is not a regular `CalendarEngine.advanceDay` subsystem, and recommendations are not approved actions.
3. **Governance V2** already models rights, decisions, meetings, requests, commitments, evaluation and ownership. `SimulationBreakpoints` projects requests and user approvals as `IMPORTANT` (nonblocking); there is no general Governance action resolver.
4. **Staff V2 Human State and politics** includes workload, reactions, culture, cohesion, conflicts, autonomy, political actions and groups. Its consequences are real but scattered across systems, with no unified operations loop.
5. **PlayerTruth/Player Dynamic State** includes 80 ratings, 40 tendencies, potential, development, training stimulus, medical/injury, fatigue, morale and performance history. Presentation and consequence are fragmented; no overall is persisted.
6. **Scouting/OrganizationKnowledge** has assignments, reports, coverage/confidence and staff quality uncertainty, but many potential consumers do not use it.
7. **BS11A ContractRosterPlanning** already adds read-only real-date contract/roster horizons and feeds BS9. It is visible in Analysis but has no decision workflow in this HEAD.
8. **Relationships/Personality/Memory/Media** have canonical stores and engines; only selected events create durable memories or user-facing narrative.

### Top reusable legacy and specification work

- Reuse Staff V2 spec/implementations, role catalog, responsibility outcomes, Human State, culture, conflicts and politics; leave `TO DECIDE` boundaries unresolved.
- Reuse CF1-CF12 Finance and CFI1-CFI8 Facilities engines/certifications instead of rebuilding them.
- Reuse BG1-BG8 institutional and ownership boundaries, PI/OrganizationKnowledge, BS9 planning/BS10 negotiation and Trade authorities, MatchEngine V3, current player workspace contracts/tests, and World DB migration adapters.
- Use PCB screens/screenshots/tests to recover layout and workflow intent only; rebind to current canonical state.
- Port Match Next/Phaser presentation and state ideas selectively. MatchEngine V3 remains canonical on this audit base.
- Most actionable later history is branch `bdm-stage2-bs11b-contract-review-decisions`, commit `34dc2ab`, which adds ContractReviewDecision domain/engine/app, Save, Analysis UI/tests, and an important nonblocking contract-review breakpoint after this audit base. Inspect/review before any rewrite or reimplementation. The audited HEAD already has `SimulationBreakpoints` for user games/media, Draft, market/trade, Governance, season and lifecycle integrity.

### Main competing-authority risks

- Active player contract team vs `Team.rosterPlayerIds` membership lacks a general invariant/recovery policy (high).
- Club Finance cash/commitments, NBA Salary Cap payroll/capHit and old Team salary budget have distinct meanings but affordability is not fully coordinated (medium-high).
- Legacy PCB/local facilities displays can look authoritative while not representing Facilities V2 (high manifestation risk).
- PlayerTruth vs OrganizationKnowledge, Coach vs StaffPerson, Board evaluation vs Governance approval, match result vs MatchViewer, and Save vs GameWorld are intentional separations: preserve them.
- Early Player and MatchEngine implementations are superseded; no second rating or match authority should be revived.

## Cross-system opportunities and gaps

- **AI:** scouting and staff are connected at named operations but not all candidate, match prep, training, medical, facilities, financial and trade decisions. Agents have some negotiation/role-promise representation but no broad recurring autonomous agent loop. Club/owner AI is not a single year-round perception/action loop.
- **Lifecycle:** Finance V2 is not processed as a global daily subsystem. Facilities condition progression and maintenance-need opening run monthly, while maintenance/project actions and sporting consumers remain partial. NCAA future-season lifecycle is explicitly unsupported at this snapshot, with recruiting cycle initialization a specific gap. General retirement/newgen, comprehensive awards and long-horizon population management are absent. Match fatigue remains transient by design.
- **Breakpoints:** The shared projection is active in Continue, simulate-until and day-advance paths. User games, Draft picks, media, trade responses, selected market states, minimum roster, season and integrity issues receive candidates. `IMPORTANT` Governance and contract/market notices do not stop time; action resolvers are absent for some routes. The later BS11B branch adds a contract-review checkpoint using this system.
- **UI:** Facilities has no canonical V2 workspace. Finance is visible but its advice/action cadence is weak. Governance, Player/Staff dynamics and relationships/memories are fragmented. The NG workspace catalog already covers most core systems; do not rebuild module shells.
- **Events/observability:** histories and memories are selective; there is no universal event aggregation/trace. Tests/certifications are substantial but there is no evidence of full-world 10/25-season execution or history/save growth benchmark.

## Deep audits

- **Contracts:** Canonical PlayerContract, exclusive expiry lifecycle, current Team roster, scheduled contracts, annual compensation, contract financial schedule, salary-cap obligations, negotiating/contact/offers/signing/governance, release, transactions, trade/retained salary, rights and BS11A projections already exist. Current gap: options/bonuses/guarantees/clauses remain partial; player renewal/extension/non-renewal absent at audit HEAD. BS11A established the projection; later BS11B exists on a separate branch and needs comparison. BS11B prompt must be rewritten or explicitly scoped to remaining gaps after reviewing that branch, not issued as greenfield.
- **Staff:** one of the largest existing capabilities: Person-rooted Staff, roles/departments, professional attributes, responsibilities/delegation/advisory, workload, Human State, relationships, culture/cohesion, conflicts, autonomy/careers/contracts/reputation and organizational politics. Reuse and connect; do not create “Staff V3” or universal staff quality layer.
- **Player:** 80-rating/40-tendency truth, no persisted overall, history, development, potential, medical/injury, training stimulus, match profile and dynamic state. User manifestation exists in Player/Medical/Training/Roster; unified meaning and long-term retirement/contract/social action are incomplete.
- **Training/Medical:** Training V1 plans, scheduled sessions, Career Fatigue and bounded annual stimulus consumption already active. Medical/injury, availability and pre-match constraints are active. Match fatigue is separate/transient. Remaining work is cadence and consequences, not initial subsystem construction.
- **Scouting:** organization-bounded knowledge, report coverage/confidence, staff quality uncertainty, assignment/delegation and Scouting workspace already exist. Use them as input for new Draft/Recruiting/Trade/Market consumers.
- **Finance:** CF1-CF12 have a broad canonical model, persistent state, engines and workspace. Daily lifecycle and governed club action remain; map separate cash, salary budget, cap hit, dead money, retained salary and coach personal finance.
- **Facilities:** CFI1-CFI8 are canonical, persisted and certified; CFI8 already has a deterministic sporting seam. Surface and activate with explicit cadence and downstream contracts.
- **Governance:** BG1-BG8 ownership, board, approvals, institution, regulation and compliance are substantial. Preserve it for contract/trade/facility/staff/finance approval and connect pending actions to breakpoints.
- **RPG/Relationships/Narrative:** Coach RPG/Coach Career/Coach Finances, general Personality/Relationships, Memory, Media, Narrative, Inbox are all present. Their manifestation and event convergence are selective; use observer perspective and event identity rather than duplicate state.

## Remaining roadmap reconciliation

| Milestone | Existing work to reuse | Specific new work / owner boundary |
|---|---|---|
| BS11 Contracts + Roster | PlayerContract, lifecycle/release, roster integrity, BS9/BS10 boundaries, Finance schedules, Salary Engine, Trade terms, Governance signing, BS11A projection, shared SimulationBreakpoints; inspect BS11B commit `34dc2ab` | Rewrite BS11B prompt around branch delta and tests; scope BS11C options/clauses/financial consequences only against approved product rules. Define review notices/actions by severity; don't create another breakpoint engine. |
| BS12 Training + Medical | Training V1, Career Fatigue, PlayerDevelopment stimulus, injury/availability, medical advisories, staff responsibilities | connect approved facility/staff/match effects and surface clear attribution; preserve distinct fatigue truths. |
| BS13 Staff Intelligence | Staff V2 full capability set + Staff workspaces + responsibility/advisory + relationships/knowledge | connect named decision consumers and make staff consequence/action states understandable; no parallel organization/staff model. |
| BS14 Scouting | OrganizationKnowledge, Scouting, Staff assignment/delegation/quality uncertainty and Player Intelligence | connect specific consumers while honoring knowledge limits; don't reveal truth to AI. |
| BS15 Youth + Newgens | NCAA Recruiting, NCAA eligibility/academics/NIL/enforcement, NBA Draft, player generation/development and ecosystem gateways | complete lifecycle and define any true youth/newgen/retirement rules; no implied changes to salary/NIL/transfer rules. |
| BS16 Finance Gameplay | CF1-CF12, Salary Engine, Finance workspace, Governance approvals, facility bindings | daily/economic event cadence, clear affordability semantic mapping, approved AI actions; don't replace ledger. |
| BS17 Facilities Gameplay | CFI1-CFI8, project/maintenance engines, Finance binding, sporting query | canonical Facilities workspace, lifecycle policy and explicit consumers; no duplicate facilities model. |
| BS18 Governance Gameplay | BG1-BG8, Board engine, supporters/boosters, compliance and action-specific approval; shared breakpoint candidates | surface existing candidates and define which governance actions are blocking or advisory, add missing resolver surfaces, selected AI/ownership action; keep authority and event records. |
| BS19 Human RPG | Coach RPG/career/finance/reputation, Staff Human State/career, Personality, Relationships, Memory | purposeful user agency and cross-person consequences; do not turn derived feelings into second persistent authority. |
| BS20 Narrative | Media, Narrative, Inbox, Memory, historical events, Coach/Staff events | canonical event catalog, perspective, memory-to-story rules and action response; no generic prose-only event duplication. |
| BS21 UX / Information | UI NG shell/apps, Player/Scouting/Finance/Staff/Match workspaces, PCB design evidence and entity actions | close visibility gaps, notably Facilities/governance/inbox/hidden state; every display sourced canonically. |
| BS22 Long Horizon | Calendar/season/repair/SimulationBreakpoints/Save, per-domain cadences, event/history data | verify every date-advancing route uses the existing breakpoint query; define notice severity, NCAA lifecycle, retirement/population coherence, explicit multi-year behavior and safe repair. |
| BS23 Performance / Observability | deterministic tests, certification suites, engine boundaries and existing diagnostics | establish profile/trace/long-run growth baselines; don't rerun the entire suite as part of documentation work. |
| BS24 Product Layer | RealWorldSpain/World DB, Save V4, UI NG startup/navigation, domain applications | connect selected flows to coherent onboarding/navigation and data provenance; do not move simulation into UI. |

## P0 and P1 findings

**P0**

1. Active roster/contract team consistency requires an explicit invariant and recovery authority rather than silent precedence; BS11 work depends on this boundary.
2. A full BS11B contract-review decision lifecycle already exists on branch `bdm-stage2-bs11b-contract-review-decisions` at `34dc2ab`, after this audit HEAD. Starting another BS11B implementation without comparing/reviewing that branch risks duplicate persisted intent and UX.

**P1**

1. Important Governance approvals can be surfaced without stopping time and lack a general resolver; decide severity/agency policy without silently converting `IMPORTANT` into a blocking rule.
2. Facilities V2 lacks a canonical workspace and sporting consumers; its monthly condition progression is already active and must be reused.
3. Finance V2 has weak global cadence/decision integration; define scheduled economic inputs and action authority before processing it routinely.
4. NCAA next-season lifecycle and recruiting cycle startup are incomplete.
5. No general player retirement/newgen/population maintenance; unselected deterministic Draft prospects persist.
6. Staff knowledge and scouting capabilities remain disconnected from many high-value consumers; user manifestation for player/staff social state remains fragmented.
7. No all-system event trace or long-horizon save/history growth certification.

## Permanent directive and next milestone

The mandatory **PHASE 0 · MASTER CAPABILITY REUSE CHECK** and gameplay definition of DONE are recorded in [BDM_REUSE_FIRST_DEVELOPMENT_DIRECTIVE.md](BDM_REUSE_FIRST_DEVELOPMENT_DIRECTIVE.md). Next, review the separate BS11B branch/commit and its audit/tests against this base, then revise the BS11B/BS11C prompt to avoid duplicate review workflow and specifically state what remains. Do not treat branch presence as merge/approval.

## Audit completion

No production behavior changed. The archive commit and all audit documents are intended to be committed atomically as `docs(strengthening): establish master BDM capability registry`. Final counts, diff check, final SHA and clean-tree state are reported after that commit.
