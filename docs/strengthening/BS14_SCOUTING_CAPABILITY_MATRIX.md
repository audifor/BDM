# BS14 Scouting Capability Matrix

Snapshot: source `c52a21717a5973ee33d99a0df3000d405bcb9847`.

| Capability | Status | Authority | Gameplay effect | UI visible | Save persistent | Problem / note |
|---|---|---|---|---|---|---|
| Player true ratings (80) | REAL | `Player.basketball.ratings` | Drives simulation | Exact only for controlled roster; external profile rows omitted | Yes | External individual scouting is deferred to BS14D. |
| Staff evaluator attributes | REAL | `StaffPerson.professional.attributes` | Error, uncertainty, time, selection | Staff UI | Yes | No overall; distinct quality numbers coexist. |
| Staff Scout roles | REAL | Role registry + TeamStaffAssignment | Eligibility/proficiency/ranking | Staff UI | Yes | Default human request only uses regionalScout. |
| Player assignment | REAL | `scoutingAssignmentsById` | Queued/active/completed daily work | Scouting workspace | Yes | Human UI only QUICK_LOOK, normal, fixed evaluator. |
| Report evidence | REAL | `evidenceById` | Inputs report provenance/quality | Partial | Yes | Automatic producer creates one synthetic evidence stub; many sources unused. |
| Evaluator report | REAL | `evaluatorReportsById` | Changes organization knowledge | Yes | Yes | Seven aggregate rating dimensions, not 80 findings. |
| Organization knowledge | REAL | `organizationKnowledge` | Affects projections and AI rankings | Yes, derived ranges/labels | Yes | Organization scoped; knowledge starts empty. |
| Legacy team knowledge | LEGACY / MIGRATION INPUT | V1 `playerKnowledge` payload and `PlayerKnowledgeRecord` type | V1→V2 conversion only | None at runtime | V1 input only | Converts by `Team.organizationId` into organization-scoped `legacyBaseline` findings. |
| Repeated observation | PARTIAL | consolidation formula | Changes estimate/coverage; may alter uncertainty | Report history | Yes | No staged discovery progression; disagreement may widen uncertainty. |
| Knowledge decay | PARTIAL | lazy freshness in evaluation helpers | Range/confidence display worsens after 365 days | Yes | Date remains; no rewrite | No expiry, refresh, or event. |
| Player profile fog | REAL / PERMISSIONED | `derivePlayerKnowledgeAccess` + `organizationKnowledge` | No simulation effect | Own exact; external aggregates/unknown | N/A | External development history is masked pending BS14D. |
| Potential evaluation | PARTIAL | report findings + OrganizationKnowledge | Potential valuation and display estimates | Scouting/development panel | Yes | Eight domains, never rendered exact by evaluation helper. |
| 80-rating scouting | MISSING | No finding/report mapping for each canonical key | No attribute-level report effect | 7 summary dimensions only | N/A | Stale 7-dimension assumption. |
| Player discovery/search | MISSING | No discovery authority | Assignments need known Player ID; AI bounded targets | Knowledge board is own roster/known subjects | N/A | No discoverability state. |
| Region/country/competition coverage | MISSING | No Region/coverage entity | No geographic effect | No true coverage map | No | `prioritizeRegions` groups nationality only. |
| Delegated assignment | REAL | responsibility + `DelegatedScouting` | Requests one bounded QUICK_LOOK | Assignment/advisory boards | Yes | Only runs for configured delegated holder. |
| Advisory Player opposition/prospect report | PARTIAL | `AdvisoryScoutingReports` | Requests FULL_REPORT, unapplied advisory | Outcomes and assignment/report board | Yes | Not same as tactical OppositionScoutingReport. |
| Tactical opposition report | REAL | `oppositionScoutingReportsById` | Recommendations; accepted into game plan | Scouting Opposition tab / tactics | Yes | Separate pre-match domain, exact once per team/game. |
| Draft knowledge use | REAL | Organization valuation | AI pick ranking/recommendations | Human draft estimates | Yes | Unknown prior when no knowledge. |
| Recruiting knowledge use | REAL | Organization valuation | AI target ordering | UI projections | Yes | Candidate list includes public/context inputs separately. |
| Market/free-agent knowledge use | REAL | Organization valuation/market knowledge | Candidate ranking and feasibility | Market views | Yes | Does not read hidden ratings in evaluated consumer paths. |
| AI scouting operations | PARTIAL | Same responsibility + assignment engine | No default assignments; works if explicitly delegated/advisory | Not directly distinguished by UI | Yes when created | Default responsibilities are userControlled. |
| Report narrative/strengths/weaknesses | UI_ONLY/PARTIAL | Findings only | No narrative effect | Some derived labels | No narrative | No persisted observation text or general recommendation. |
| Scout workload | REAL | mission-unit activeWorkload + generic workload | Queueing/duration/selection | Assignment status | Assignments persist | No travel or cash cost. |
| Financial scouting budget/cost | MISSING | None | None | None | No | No per-assignment cost. |
| WorldDB initial knowledge | MISSING | Bootstrap creates no knowledge | Starts with empty org knowledge | External players are Not scouted | None initially | Same empty knowledge as generated world. |
| Generated world initial knowledge | MISSING | createNewGame has empty knowledge | No baseline reports | External players are Not scouted | Empty collections save | Legacy helper not called on normal generation. |

## BS14B authority status

`GameWorld.organizationKnowledge` is the only current mutable Player scouting knowledge authority. V1 legacy records are parsed only at the compatibility boundary and immediately converted. Generated and WorldDB creation do not initialize legacy knowledge; ACB test-game baseline data is authored into OrganizationKnowledge.

## BS14C delta

The Player profile fog is now permission-aware through `derivePlayerKnowledgeAccess`. Own controlled-roster current ratings remain exact; external profiles receive only current organization knowledge plus public context. External 80-rating attributes and development history are unavailable until BS14D adds rating-level scouting. Potential remains based on OrganizationKnowledge. No global knowledge was seeded, and the ACB baseline uses the shared projection. See [BS14C Player Knowledge Visibility](BS14C_PLAYER_KNOWLEDGE_VISIBILITY.md).

## BS14D delta

| Capability | Status | Authority | Gameplay effect | UI visible | Save persistent | Problem / note |
|---|---|---|---|---|---|---|
| 80-rating scouting | REAL | `rating:<CANONICAL_KEY>` in `organizationKnowledge` | Full Report and focused Skill Evaluation store uncertain per-rating findings | External Attributes shows known rows/ranges; unknown stays Not scouted | V2/V3/V4 generic knowledge payload | All 80 keys are covered; tendencies remain deferred. |
| Scouting family catalogue | REAL | Domain `PLAYER_RATING_FAMILY_KEYS` | Defines focused evaluation and attribute grouping | Same mapping in profile catalogue | Static code | Eight families; one canonical key per family. |
| Aggregate from rating findings | REAL | `deriveAggregateEvaluationFromRatingKnowledge` | Acquisition valuation reads derived aggregate above 0.60 coverage; otherwise stored aggregate fallback | Summary dimensions | Derived on read | Uncertainty widens for missing coverage. |
| Mission distinction | REAL / PARTIAL UI | `ScoutingEngine` mission mapping | Quick Look = two broad findings; Full Report = 80; Skill Evaluation = selected family | Human UI still Quick Look only | Reports and current findings persist | Existing advisory/domain route supports Full Report; no new selector. |
| External rating detail | REAL / PERMISSIONED | `derivePlayerKnowledgeAccess` | No simulation side effect | Known rating evaluation only; own roster stays exact | N/A | Exact mode still requires exact OrganizationKnowledge evaluation. |

See [BS14D Rating-Level Scouting](BS14D_RATING_LEVEL_SCOUTING.md) for the error, consolidation, freshness, save, and manual validation contract.

## BS14E delta

| Capability | Status | Authority | Gameplay effect | UI visible | Save persistent | Problem / note |
|---|---|---|---|---|---|---|
| COUNTRY / COMPETITION territory membership | REAL | Team country, Competition participants, current rosters | Current basketball location governs eligibility | No territory management UI yet | Derived from world | Nationality is not used. |
| Persistent Scout operations | REAL | `scoutingTerritoryAssignmentsById` | Staff quality/workload drives bounded daily discovery | Store/application commands only | V2/V3/V4 | Two shared Scouting workload units per active operation. |
| Organization player awareness | REAL | `organizationPlayerAwarenessById` | Discovered identity becomes a Quick Look candidate | Scouting workspace candidate source | V2/V3/V4 | No rating or potential findings are created. |
| Public player addressability | REAL | Roster, opponent, draft, recruiting, market knowledge, free-agent sources | Publicly exposed players remain selectable | Scouting workspace | Source systems | Identity access does not grant knowledge. |
| `prioritizeRegions` | CONVERGED | Existing responsibility ID; current scheduled Competition focus | Stops grouping by nationality | No new UI | Existing outcomes | Wider AI territory operations are BS14F. |

## BS14F delta

| Capability | Status | Authority | Gameplay effect | UI visible | Save persistent | Problem / note |
|---|---|---|---|---|---|---|
| Autonomous AI territory planning | REAL | `progressAiScoutingOperations` + BS14E territory service | Periodic bounded coverage by eligible AI Staff | No new UI | Assignments use existing V2/V3/V4 runtime | Maximum three per organization, capped by eligible Scout slots. |
| AI awareness and report funnel | REAL | Territory discovery + `requestScouting` | Public/contextual target selection, Quick Look then selective Full Report | Existing Scouting views | Awareness, assignments, reports and knowledge already persist | Two report requests per organization per planning cycle. |
| Human control boundary | REAL | `coachId === userCoachId` | Prevents autonomous work on user-controlled teams | Existing delegation UI | No new responsibility state | Existing delegation remains authoritative. |
| Acquisition knowledge feedback | REAL | Existing OrganizationKnowledge valuation consumers | Completed report findings can change real valuation inputs | Existing consumer views | OrganizationKnowledge already persists | No new market, trade, draft, or recruiting algorithm. |

See [BS14F AI Scouting and Acquisition](BS14F_AI_SCOUTING_AND_ACQUISITION.md) for bounds, fairness, and validation.
