# BS0 Strengthening Master Audit

## 1. Executive summary

**Audit base:** `c23771ff51146ff7ce7a738504d54c443438b3ca` (`origin/main` matched). **Branch:** `bdm-strengthening-bs0-game-loop-audit`. **Worktree:** `C:\BDM-STRENGTHENING`. The worktree was clean at start; the existing branch/worktree already satisfied the requested isolation, and MatchEngine worktrees were left untouched.

BDM has a real, deterministic gameplay loop for matches, supported competition editions, training, recruiting, Draft, scouting, staff, coach career and selected media/Board consequences. MatchEngine is deeply connected to canonical player truth, match stats, standings, injuries, eligibility, coach outcomes and season progression. Save V4 reconstructs a broad canonical world through domain validation.

The main weakness is orchestration across systems. `CalendarEngine.advanceDay` is a long direct chain, not a day transaction with event aggregation and a general player breakpoint. `Continue` recognizes a small set of interruptions; `simulateUntilDate` can skip media and instant-resolve user games, but neither recognizes all user-owned pending decisions. Club Finance V2, Facilities lifecycle engines, and general Governance decisions do not run in the ordinary daily chain. The NCAA-like ecosystem is explicitly not able to generate its next season. The most serious issues are therefore missing lifecycle links and missed user decisions, not missing domain models.

The complete per-system A–Q matrix is in [BS0_GAMEPLAY_MANIFESTATION_MATRIX.md](BS0_GAMEPLAY_MANIFESTATION_MATRIX.md); the executable daily flow is in [BDM_CURRENT_GAME_LOOP.md](BDM_CURRENT_GAME_LOOP.md); canonical state boundaries are in [BDM_AUTHORITY_MAP.md](BDM_AUTHORITY_MAP.md).

## 2. What BDM already does exceptionally well

- **Deterministic match execution and presentation separation.** MatchEngine receives seeded RNG streams, models player-level spatial/action behavior and rotations, and returns a result without mutating GameWorld. MatchViewer consumes the resulting event timeline. Match result application is a separate boundary. See `src/engine/match/`, `src/app/game/playUserGame.ts`, and `docs/autopilot/MG7J_OFFENSIVE_ENGINE_FINAL_CERTIFICATION.md`.
- **Match-to-world consequences.** Completed matches create score and player stat history, affect standings/postseason/qualification, coach reputation/experience, morale, NCAA participation, injuries, and selective media/narrative/news consequences. See `MatchResultApplication.ts`, `PostMatchInjuries.ts`, `SeasonProgression.ts`.
- **Competition execution.** Edition-scoped formats, actual Games, standings, brackets/series, multi-competition calendars, World DB fixture binding, FIBA-like movement and configured qualification materialization are executable systems, not just configuration types.
- **Player truth and world integrity.** The 80-key Player Truth is persisted without an overall; match consumers receive a derived profile. `GameWorld` rejects duplicate team roster membership, invalid references, conflicting staff assignments and overlapping team fixtures.
- **A broad set of live supporting systems.** Scheduled training, annual development, injuries/medical advisories, scouting assignments/reports, staff autonomy/culture/politics, NCAA recruiting/NIL/eligibility, Draft, finance reporting and Board season evaluation are connected to explicit application or calendar boundaries.
- **Durable state.** Save V4 covers the large GameWorld model and routes reconstruction through canonical factories. Match sessions are correctly kept transient until a save/resume contract is designed.

## 3. Systems that exist but are weakly manifested

- **Club Finance V2:** certified accounts, recognition, treasury, forecasting, AI recommendations, and user workspace exist. The finance engine is not in `CalendarEngine.advanceDay`, match attendance/revenue is not a match consequence, and recommendations do not form a whole-club AI action loop. The separate salary/affordability paths need clearer coordination.
- **Facilities V2:** domain, lifecycle, finance integration, Save V4 persistence, and a deterministic sporting-context query layer are present. CFI8 explicitly documents that the context is not yet consumed by training/development/medical/staff/match systems. No canonical Facilities workspace was found in `src/ui-ng/applications`; the legacy Club Facilities tab reads `clubFixtures` and local React state rather than `GameWorld` facility records. Facility deterioration is not invoked from the normal calendar.
- **Governance V2 and ownership:** approvals, execution evidence, events, meetings, requests and commitments are durable and audited. The inspected code exposes explicit services, but there is no general governance cadence or simulation breakpoint for pending decisions.
- **Player model:** canonical ratings, derived match profiles, history, training stimulus and development are connected. Player-visible meaning exists, but autonomous players do not have a general goal/perception/action loop across contract, relationship, coach and career systems.
- **Scouting and staff:** both have real engines and workspaces. Their quality and knowledge rarely feed all downstream performance decisions; facility quality and ordinary match outcomes do not close the full loop.
- **Relationships, memories and narrative:** Coach-centric selected events (media, appointments, championships, tier movement) have effects and durable memories. Many Player/Agent/Owner relationships do not affect ordinary match/market decisions; not every meaningful canonical event creates a user-facing item.

These are **MANIFESTATION GAPS**: the system has canonical state or an engine, but does not consistently change what the player sees, decides, or experiences.

## 4. Missing lifecycle links

1. No shared daily transaction performs `START DAY → ordered systems → event aggregation → AI reactions → breakpoint evaluation → END DAY`. The actual order is in `CalendarEngine.advanceDay`, which directly calls selected engines. Finance V2, Facilities, general Governance and any all-systems event sink are absent from that route.
2. Season resolution is substantive but not universal. Supported non-NCAA round-robin/cup paths finalize and roll forward; NCAA-like future-season generation is explicitly unsupported by `CompetitionLifecycleCoordinator`. `startNextSeasonFor` does not initialize the next Recruiting cycle.
3. No full awards/retirement/newgen/roster-contract annual transition was found. Season history/champion and coach legacy exist; they do not replace every ecosystem's roster replenishment and aging/retirement lifecycle.
4. Match post-processing is strong but selective: no persistent match-session/fatigue carry-over, match-derived training stimulus, finance/facility usage, routine scouting evidence, or universal news/relationship record is applied.

## 5. Missing AI links

- **Club/GM:** autonomous decisions exist for selected jobs (recruiting, Draft, minimum roster repair); no unified club goals, risk perception, memory and year-round roster/contract/trade plan.
- **Coach:** user tactics and live coaching work; AI tactical adaptation and game-plan perception do not form a broad coach cycle.
- **Scout:** assignment/report engines and delegation exist, but knowledge freshness and report quality only influence selected valuations/advisories.
- **Staff:** staff autonomy, human reactions, conflicts, culture and political actions are among the strongest actor simulations; they are not consistently connected to decisions in match, training, medical, finance and facilities systems.
- **Player:** player truth shapes on-court actor decisions; off-court autonomous objectives, contract/agent negotiation and relationship-driven choices remain limited.
- **Agent:** GameWorld has Agent/Agency/market-reality/negotiation/role-promise state, but an autonomous recurring Agent decision/execution/consequence loop was not found.
- **Owner/Board:** Board objectives evaluate at season finalization and Governance supports controlled actions; neither forms a general date-driven perception/decision/breakpoint loop.

## 6. Missing user-facing links

- Most major systems do have a workspace: player truth/contract/development/medical/scouting, training, match, competition, scouting, staff, recruiting, Draft, trades, finance, Board, and news/media.
- **Facilities is the clearest visibility gap:** a rich durable system and sporting capability seam have no canonical application workspace. The legacy Club Facilities tab is fixture/local UI state, not a view or action boundary for the persisted Facilities V2 model.
- **Finance V2 is visible but weakly actionable:** CF12 certifies detailed reporting and AI advice; advice is not itself approval, funding, club action, or daily consequence.
- **Governance is visible as auditable structures/decisions, but not as a single pending-action surface that controls time advancement.**
- Inbox priorities are only low/normal/high. They do not form the requested BACKGROUND/INFO/IMPORTANT/ACTION_REQUIRED/BLOCKING semantics or a simulation-stop contract.

## 7. Missing self-healing links

**Legitimate recovery already present:** Save/world reconstruction validates references; the competition coordinator diagnoses unsupported lifecycle; scheduled games in the past cause a hard error; eligibility/availability/rotation enforce pre-match squad constraints; default rotations and tactical fallbacks are deterministic; AI minimum-roster maintenance signs affordable free agents at next-season rollover and returns unresolved team IDs; facility maintenance actions can restore condition through their explicit action boundary.

**Bug masking avoided:** these paths either use explicit rules or fail with structured errors. No broad silent repair layer was found, and this is safer than silently inventing fixtures or moving their dates.

**Missing recovery:** no general roster/registration/lineup repair for human clubs; no staff vacancy/qualification guarantee; no repair for validly referenced but semantically mismatched roster/contract state; no generic competition membership/schedule repair; no venue fallback; no recurring AI financial emergency response; no Facilities maintenance execution/AI strategy on the daily route. Pre-match failures reject an impossible squad rather than recover it.

## 8. Long-horizon risks

These are structural risks from current code, not claims that a long simulation was executed.

| Horizon | Evidence-based risk | Priority |
|---|---|---|
| 1 season | NCAA-like completed seasons stop with `UNSUPPORTED_FUTURE_LIFECYCLE`; calendar-only test comments identify a deterministic duplicate player-ID failure when certain recruiting cycles cross date windows; a user's Draft pick is not a recognized Continue breakpoint. | P0 breakpoint gap; P1 lifecycle/ID issues |
| 5 seasons | NBA Draft creates a fresh deterministic prospect class each completed NBA-like season. Selected players join rosters; unselected players remain in `GameWorld.players`. No player retirement/removal lifecycle was found. This can grow the unrostered population over repeat seasons. | P1 |
| 10 seasons | Completed Games/stat logs, memories, scouting records and narrative beats are retained in persistent collections; narrative beats append and memory queries scan records. Save size and query cost therefore have an evidence-based growth path. No measured failure threshold was found. | P2 |
| 25 seasons | No whole-world 25-season test/certification covers population balance, team payroll/market stability, competition progression, facility condition, reference cleanup, save size or AI activity. NCAA progression is already explicitly unsupported; unselected generated prospects and retained history remain structural scaling risks. | P1 for unsupported NCAA; P2 for unmeasured scale |

Salary inflation, financial collapse, broken promotion chains and facility drift are **not asserted as observed failures**. The code has multiple finance rule authorities and robust deterministic promotion/condition engines; the missing evidence is whole-world long-horizon execution and activation of facility condition processing, not a demonstrated collapse.

## 9. Duplicate authority risks

- **HIGH — roster membership and active contract team:** `Team.rosterPlayerIds` is unique/canonical for membership; `PlayerContract.teamId` independently declares a team. `GameWorld.validateWorld` checks contract references but the inspected contract loop does not require the active contract's team to equal the roster team. Market code also derives free agency from both collections. See [BDM_AUTHORITY_MAP.md](BDM_AUTHORITY_MAP.md).
- **No other HIGH duplicate was substantiated.** Competition participants and Season snapshots are time-scoped by design; Player truth and observer knowledge are intentionally separate; Save V4 and external World DB state meet at explicit adapters.
- **MEDIUM coordination risk:** personal Coach Finance, Club Finance V2 cashflows, salary-cap payroll and legacy Team salary budget have different purposes, but free-agent affordability uses the legacy Team budget rather than a coordinated club cash/commitment decision.

## 10. P0 gaps

### No canonical action-required breakpoint across simulation commands

`ContinueFlow.getContinueStopReason` checks pending media, today's user game and a completed primary season. `simulateUntilDate` deliberately skips media and instant-resolves a user game; it does not check pending Draft picks, general high-priority Inbox actions, trade proposals, Governance approvals/requests, board decisions, or all contract responses. `CalendarEngine` stops Draft AI at the user's pick, but the outer Continue/simulate-until command does not treat that state as an interruption. The date can advance while a required user action remains open. This is P0 under the audit brief's explicit breakpoint rule. A generalized breakpoint engine is not implemented here.

## 11. P1 gaps

- NCAA-like future-season lifecycle is explicitly unsupported; `simulateUntilDate` returns a diagnostic instead of advancing beyond that completed season.
- Recruiting calendar coverage: initial world creation initializes cycles; next-season creation does not. Additionally, the existing `simulateUntilDate.test.ts` comments call out duplicate deterministic Player IDs for certain recruiting-cycle date windows. The comment is evidence; this audit did not reproduce the failure.
- Roster/contract cross-invariant and user-roster recovery are incomplete. An undersized roster causes pre-match failure; only non-user teams are considered by minimum-roster maintenance, and only during next-season creation.
- Facility condition/development/maintenance lifecycle and Club Finance V2 are not activated by the ordinary daily simulation, despite canonical engines and persisted state.
- Generated NBA Draft prospects persist when undrafted; no retirement lifecycle was found, creating an accumulating player-pool risk over repeat editions.

## 12. P2/P3 gaps

- Persistent match sessions and fatigue carry-over are absent; match fatigue is transient.
- Match feedback to training/development, scouting, facilities and Club Finance is partial or absent.
- AI trade intelligence, contract planning, coach tactical adaptation, Agent action and broad club goals are incomplete.
- Facilities visibility/actions, finance actions, generic Governance breakpoint/user queue and event significance aggregation are incomplete.
- Persistent Game/stat/memory/scouting/narrative histories are not pruned or compacted. Growth is supported by the data structures; performance degradation has not been measured.
- Unified event tracing, performance counters and multi-year certification are missing.

## 13. Recommended strengthening sequence

| Proposed milestone | Recommendation | Repository evidence |
|---|---|---|
| BS1 World Lifecycle | KEEP | Daily chain exists but is fragmented; Finance/Facilities/Governance are missing from it; season scope is not universal. |
| BS2 Event / Breakpoint Engine | MOVE EARLIER | P0: current commands can advance through user-owned Draft/Governance/market actions. Build before expanding more autonomous systems. |
| BS3 Competition / Season Lifecycle | KEEP | League/cup/FIBA paths are strong, but NCAA continuation is explicitly unsupported and recruiting cycles do not roll. |
| BS4 Self-Healing World | KEEP | Validator/fallbacks exist, but no general domain-aware roster, staffing, fixture or contract recovery. |
| BS5 Player Dynamic State | ALREADY MOSTLY DONE | Truth, development, training stimulus, career fatigue, injuries, morale, history and transient match fatigue exist; remaining scope is connection/carry-over. |
| BS6 Match Intelligence | KEEP | Player-driven actions and tactical/spatial execution exist; broader coach/opponent perception and post-match consequences remain. |
| BS7 Basketball Motion Grammar | ALREADY MOSTLY DONE | MG6/MG7 already deliver deterministic spatial movement and multiple offensive actions; scope remaining movement gaps before duplicating the foundation. |
| BS8 Coach / Rotation AI | MERGE | Rotations work; user/live tactics work. Merge next AI coach decision work with BS6/7 match intelligence to avoid a second disconnected match planner. |
| BS9 Club / GM AI | KEEP | Narrow AI roster, Draft, recruiting and finance advice exist; no cross-domain club plan/action loop. |
| BS10 Market / Trade Intelligence | MOVE EARLIER | Pending offers must join BS2 breakpoints; AI trade/contract logic should precede advanced finance consequences. |
| BS11 Contract / Roster Planning | KEEP | Contract lifecycle exists; unified planning and roster/contract invariant/recovery remain. |
| BS12 Training / Medical | ALREADY MOSTLY DONE | Daily scheduled training, player development, availability, injury and medical advisories are present; connect facilities and match fatigue rather than rewrite. |
| BS13 Staff Intelligence | ALREADY MOSTLY DONE | Staff autonomy, human state, conflict, culture, politics, quality and careers are substantial; next work should wire outputs into gameplay. |
| BS14 Scouting | ALREADY MOSTLY DONE | Knowledge/evidence, assigned/delegated reports, advisories and UI are present; improve freshness and downstream use. |
| BS15 Youth / Newgens | KEEP | Recruiting/Draft generate deterministic prospects, but a broad age-out/newgen/retirement population lifecycle is not present. |
| BS16 Finance Gameplay | KEEP | Finance V2 has canonical ledgers and UI but lacks daily integration and decisive human/AI actions. |
| BS17 Facilities Gameplay | KEEP | CFI1–CFI8 establish durable systems/query integration; actual time progression and user actions/visibility remain. |
| BS18 Governance Gameplay | MERGE | Merge governance cadence and pending decisions with BS2 event/breakpoint; keep deeper institutional gameplay as a follow-up. |
| BS19 Human RPG | KEEP | Coach RPG/relationships/morale/memory have selected real consequences, but broader actor coverage is incomplete. |
| BS20 Narrative | MERGE | Existing Media/News/Narrative/Memory engines are active on selected events; event intake/significance belongs with BS2 before adding more story types. |
| BS21 UX / Information | KEEP | Many current workspaces are real; Facilities and a unified action-required surface need visibility. |
| BS22 Long-Horizon Simulation | KEEP | Population growth, history size and unsupported lifecycles need full-year-run evidence after lifecycle work. |
| BS23 Performance / Observability | MOVE EARLIER | Add focused trace/metrics while building BS1–BS4 so lifecycle failures and multi-year growth can be measured. |
| BS24 Product Layer | MOVE LATER | Most product workspaces already exist; finalize once the current state and actionable consequences are stable. |

### Proposed additions

Add an early **BS2A Pending Decision Inventory** only if the breakpoint milestone needs a bounded prerequisite: enumerate every durable user-owned pending state, its expiry/resolve transition and whether time may pass. Otherwise keep this inside BS2. Add a later **Roster/Contract Integrity** slice under BS4/BS11, because the current world validator does not prove this cross-record invariant.

## 14. Audit scope and confidence

This was a static repository audit informed by existing certification reports and targeted executable integration tests already present in the tree (`SystemLiveness`, `SystemsActivation`, `simulateUntilDate`, lifecycle and subsystem test files). A focused run of `ContinueFlow.test.ts`, `SystemLiveness.test.ts`, and `CompetitionLifecycleCoordinator.test.ts` was attempted, but Vitest could not start because this worktree has no installed `vitest` package (`ERR_MODULE_NOT_FOUND`). Dependencies were not installed. The enormous full suite and new tests were not run. No production behavior was changed. Long-horizon outcomes are classified as risks only where a concrete growth path or explicit unsupported state exists; unmeasured failure is called out separately.
