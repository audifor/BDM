# BDM Cross-System Integration Matrix

Snapshot: audit HEAD `32493210db55a30a94a4cefb65bf2aadf5f4dd41`. `ACTIVE` means a canonical producer feeds the named consumer; `PARTIAL` means only selected event types or workflows link; `SPECIFIED` means design exists but no production link was found; `ABSENT` means no meaningful integration was found; `NOT_APPLICABLE` means no expected relationship for this pair.

| Producer | Consumer | Status | Evidence / boundary |
|---|---|---|---|
| MatchEngine result | Game score/stat log | ACTIVE | `MatchResultApplication` applies deterministic result after match completion. |
| Match result/stat logs | Standings/postseason/season history | ACTIVE | derived standings, edition lifecycle and selective history consume completed Games. |
| Match result | Player history/coach reputation/experience | ACTIVE | selected canonical post-match and season consumers. |
| Match result | Injuries/availability | ACTIVE | `PostMatchInjuries` and availability paths; MatchEngine does not own medical state. |
| Match result | Morale/memory/media/narrative | PARTIAL | selected game/season events only; not every event is captured across every subsystem. |
| Match result | Club Finance attendance/revenue/facility use | ABSENT | BS0 loop audit found match attendance/revenue not a match consequence and finance absent from normal daily processing. |
| Match session | Career Fatigue/training development | NOT_APPLICABLE (separate) | Match Fatigue is transient and separate; no carry-over pipeline at this HEAD. |
| PlayerTruth/physical ratings/tendencies | MatchEngine actor decisions | ACTIVE | MG4-MG7 canonical consumption; only relevant profile values at decision seams. |
| PlayerTruth | Scouting/OrganizationKnowledge | PARTIAL | generated truth can seed permitted report/intelligence; knowledge is separately bounded and not universal. |
| OrganizationKnowledge/scouting | Market proposals/trades | ACTIVE/PARTIAL | BS10A-C consume knowledge-bounded evaluation for defined candidate workflows; whole market/trade AI remains narrow. |
| OrganizationKnowledge/scouting | Draft/recruiting | PARTIAL | draft/recruiting advisories use selected reports/knowledge; not every prospect fact is understood equally. |
| Staff | Scouting knowledge quality | ACTIVE | delegated scouting/quality uncertainty uses staff quality in specified report paths. |
| Staff | Training/medical/tactics performance | PARTIAL | responsibilities/advisory and engines exist; broad operational outcome use is not universal. |
| TrainingPlan/session | Development stimulus/offseason ratings | ACTIVE | scheduled training creates stimulus; annual development consumes bounded signal and resets it. |
| Training | MatchEngine Fatigue | ABSENT | Career Fatigue is a different persisted load; Match Fatigue is transient. |
| Injury/availability | Pre-match lineup | ACTIVE | common pre-match boundary validates availability and roster readiness. |
| Medical advice | Player treatment/recovery progression | PARTIAL | injury/availability and medical UI exist; complete user/AI treatment lifecycle should be mapped in BS12. |
| Facilities condition/capability | Training/medical/staff/match | ABSENT | CFI8 certified query is not consumed by these systems. |
| Facilities condition progression | ordinary Calendar | ACTIVE | `FACILITY_CONDITION` runs on each month's first day, advances condition, and opens maintenance needs with diagnostics. |
| Facilities maintenance/project execution | ordinary Calendar | PARTIAL | Explicit maintenance/project engines exist; not every action is automatically progressed by the ordinary calendar. |
| Facilities projects/access/condition | Club Finance | PARTIAL | explicit bindings and integration exist; full economic lifecycle not ordinary simulation. |
| Club Finance scheduled costs/revenue | ordinary Calendar/competition events | ABSENT/PARTIAL | certified engines/adapters exist but daily chain doesn't process whole Finance V2; selected actions can invoke specific paths. |
| Salary Engine | Contract legality/trade salary matching | ACTIVE | shared Salary boundary validates configured legality/matching. |
| ContractFinancialSchedule | Finance/BS11 planning | ACTIVE | derived schedule used by market/roster planning where context supplied. |
| Team salary budget | Club Finance commitments/cash | PARTIAL | legacy affordability path exists but not coordinated with CF V2 ledgers. |
| BS9 strategy/needs/context | GM option/plan selection | ACTIVE | BS9A-E deliberate pipeline. |
| GM selected plans | BS10 market/transaction execution | ACTIVE | explicit workflow and safe execution boundary; selection alone does not mutate market. |
| Governance decision rights | market contract signing and trades | ACTIVE | governed workflows exist for supported paths; not all action types share a generic queue. |
| Governance requests/decisions | Continue/simulate-until breakpoint | PARTIAL | shared breakpoint query detects user requests and approvals; these are `IMPORTANT` and nonblocking, and there is no current general resolver path. |
| Recruiting | Player roster on signing date | ACTIVE | recruiting cycle signings deliver at arrival through lifecycle boundary. |
| Recruiting | NBA Draft/contract compensation | NOT_APPLICABLE | NCAA signing is not professional salary contract; ecosystem gateway owns later move. |
| NCAA eligibility/academics/enforcement | Match availability | ACTIVE | common pre-match availability boundary enforces restrictions; MatchEngine remains unaware. |
| NIL/collectives/boosters | Recruiting appeal | ACTIVE | only configured appeal factor; recruiting stays sole commitment/signing authority. |
| Draft pick rights | Trade execution | ACTIVE | identity/original owner/current owner semantics preserved and trade resolution changes rights. |
| Draft selection | Continue/simulate-until breakpoint | ACTIVE | `SimulationBreakpoints` projects the user's current pick as `ACTION_REQUIRED`; tests cover Continue, simulate-until and resolution. |
| Staff Human State/consequences | Staff conflicts/career/politics | ACTIVE/PARTIAL | integrated in selected pipelines; all signal types are not consumed by all Staff systems. |
| Staff culture/cohesion/conflicts/politics | team performance/training/market | PARTIAL | persisted and cadence-driven; no universal performance modifier or all-system AI loop. |
| Relationships | Memory relationship effect | ACTIVE | Memory mutation can invoke existing relationship event API once. |
| Relationships | player retention/contract decisions | SPECIFIED | relationship substrate exists, but broad player negotiation or agent behavior isn't an active loop. |
| Memory | Narrative arcs/media generation | PARTIAL | memories are recorded for selected coach/season events; dynamic narrative arcs are reserved. |
| Media/Inbox | action breakpoint | PARTIAL | pending media is `ACTION_REQUIRED`; Inbox priority/response mapping is not universal. |
| Person identity | Player/Staff/Coach profiles | ACTIVE | canonical Person root; role-specific profiles/facades remain distinct. |
| World DB | GameWorld bootstrap | ACTIVE | explicit adapter materializes selected external competition/team/player data; external session remains outside Save. |
| Save V4 | GameWorld reconstruction | ACTIVE | canonical factories validate/enrich persisted JSON, not a second rules engine. |
| Player age/development | retirement/long-term roster replenishment | ABSENT | no general age-out/retirement pipeline found. |

## Integration opportunities to sequence

1. BS22: verify all time-advancing commands continue to use the existing breakpoint query; define when `IMPORTANT` requests become stopping actions.
2. BS16/BS17: define Finance cadence and facility maintenance/project consumers. Preserve existing monthly Facilities condition progression.
3. BS14/BS13: add named, evidence-bounded scouting/staff consumers in existing domain seams.
4. BS12: close medical/training lifecycle links while preserving Match Fatigue vs Career Fatigue distinction.
5. BS19/20: bridge relationships, memories and narrative on a deliberately selected event catalog.
