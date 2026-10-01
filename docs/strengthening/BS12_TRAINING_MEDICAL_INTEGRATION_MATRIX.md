# BS12 Training & Medical Integration Matrix

**Legend:** `CONNECTED`, `PARTIAL`, `DISCONNECTED`, and `ABSENT` describe producer/consumer links; derived values are projections from canonical state. “Visible” refers to default NG surfaces unless stated otherwise.

**Original audit baseline:** `f22c44d290e29f9df1dbaafe0ecd9d3badeef441`
**Canonical reconciled baseline:** `282e0893e251aa0e149941cb29cfeadc19ae28c5` (`origin/main` after PRE-BS12 integration)

## Training integration

| Producer / source | Consumer / consequence | State and persistence | Staff / Facilities | AI / user action | Manifestation and result |
|---|---|---|---|---|---|
| Built-in Training catalog (49 definitions) | Scheduled executor resolves target ratings, development/fatigue, morale/cohesion effects | Definitions are code; user definitions persist in `userTrainingModulesById` | Staff quality can modify execution; CFI context is not consumed | User can create module and schedule it; no AI-created team schedule found | Connected in NG Modules / Team / Personal |
| User team or individual schedule | `executeScheduledTrainingSessions` on due date | `scheduledTrainingSessionsById` persists; completion state prevents repeat execution | Assigned Staff IDs affect execution, then are cleared | User chooses module, date/time, duration, intensity, Staff; can cancel | Connected; sole automatic execution path |
| Team focus/intensity plan | User fill-week action creates concrete scheduled sessions | `trainingPlansByTeamId` persists | Delegated Training responsibility informs execution/preset | User selects plan and fills future schedule; AI ownership absent | Reusable scheduler input, not an independent automatic executor |
| Completed Training session | Adds bounded mapped stimulus | `developmentStimulusByPlayerId` persists | Quality/delegation are bounded inputs | AI does not schedule or tune workload | Connected to annual development; 35-key compatibility mapping |
| Annual development checkpoint | `OffseasonDevelopment` updates all 80 Player Truth ratings and writes history/reset | Canonical 80 ratings persist; history projects 35 signals | Not a Training Staff decision | Deterministic annual process; no separate AI training plan | Connected; no immediate rating mutation on session completion |
| Match preparation and completion | Career Fatigue feeds rotation planning, but does not initialize transient MatchSession fatigue; completion updates shared stimulus and Career Fatigue; post-match injuries use played minutes | Same persistent dynamic state/injury authority; in-match fatigue remains transient | No facility input | Deterministic match consequence path | `PARTIAL` Training/Career Fatigue→Match (rotation input remains; starting-fatigue input removed); `CONNECTED` Match→Career Fatigue, Match→development stimulus, and Match→injury |
| Training physical/recovery module | Career Fatigue is increased/reduced by session effect | `careerFatigueByPlayerId` persists | Staff quality may affect session execution; Facilities absent | User can schedule Recovery definitions | Connected to fatigue only; no injury treatment and no Training-created injury |
| Daily calendar | Fixed recovery decrement to Career Fatigue; scheduled Training; medical advisory phase | Career Fatigue/injury/advisory sources persist | Staff medical responsibility required for advisory | No congestion-aware AI planning | Connected daily lifecycle; independent of match-density policy |
| Same-day sessions | `dailyScheduledLoad` and `classifyDailyLoad` derive workload class | Derived, not saved as second fatigue value | No facility modifier | NG Load view displays load; no schedule-density recommendation | Partial: daily load visible, fixture congestion absent |
| Match calendar / congestion | No back-to-back, 3-in-5, travel or recovery policy found | No congestion authority | No Staff/facility consumer | AI planning absent; user can schedule around listed match dates | Gap, not hidden capability |
| Training definition `injuryRiskWeight` | No engine consumer; does not affect injury generation | Metadata only | None | Must not imply injury likelihood in UI | Disconnected metadata, not active injury risk |

## Medical integration

| Producer / source | Consumer / consequence | State and persistence | Staff / Facilities | AI / user action | Manifestation and result |
|---|---|---|---|---|---|
| Completed match with played minutes | `generatePostMatchInjuries` creates deterministic injury records | `injuriesById` persists record including optional source game | Training load and CFI Medical context do not affect occurrence | No AI injury decision; seeded simulation | `CONNECTED` Match→injury; actual minutes gate creation |
| Injury record and dates | `isInjuryActive` determines active state; shared availability boundary excludes player | Persisted record; active status derived from date interval | No treatment or facility state | No user injury-state mutation except Staff recommendation action | `CONNECTED` injury→availability |
| Competition eligibility | `getAvailablePlayersForCompetition` combines eligibility and active injury | Derived; no saved available boolean | None | Match preparation uses shared boundary | Connected; active injury blocks match availability, fatigue alone does not |
| Active injury + Medical Staff responsibility | Daily `MedicalAdvisory` creates treatment/RTP recommendations | Advisory outcome persists | Staff proficiency, workload, and temperament affect suggestion; facilities not consumed | AI may generate advisory for teams with genuine Staff holder; no accept/dismiss AI loop | Partial generation; recommendation is not treatment or clearance |
| Staff recommendation decision | Accept applies expected-return adjustment from frozen baseline; reject/dismiss does not change injury timing | InjuryRecord/advisory state persists | Staff workspace actions | User controls disposition; no automatic medical decision | Connected through Staff app; direct Medical action missing |
| Career Fatigue / injury history | `MedicalRiskAssessment` computes read-only risk score/band | Derived score; source fatigue/injury records persist | No Staff/facility effect | No probability or availability side effect | Connected read-only risk projection |
| Training recovery session | Changes shared Career Fatigue | Same fatigue scalar persists | CFI Recovery/Rehabilitation context is disconnected | User schedules recovery; no medical clearance decision | Connected to physical load only; no injury recovery |
| Injury expected return date | Date interval ends and injury stops blocking availability | No separate healed/fit status | No physician/rehab gate | No return-to-play protocol or test | Partial lifecycle; date-only resolution |
| Existing CFI capability context | No Training or Injury consumer found | Derived from access/capability/condition, not persisted | CFI defines Training/Performance/Medical/Rehabilitation/Recovery context | No user action in BS12 domain | Disconnected from gameplay; BS17 owns infrastructure operations |

## Surface and Save matrix

| Surface / boundary | Current manifestation | Canonical connection | Finding |
|---|---|---|---|
| NG Training workspace | Team, Personal, Load, Staff, Modules; schedule/cancel sessions; create modules and schedule recovery | Reads/writes scheduled sessions and module/responsibility/dynamic state | Default user Training agency is substantial and connected |
| NG Medical workspace | Overview, injured, history, risk, Staff; advisory count | Projects canonical injuries, risk, and medical state | No direct recommendation disposition in Medical surface; Staff workspace provides action |
| NG Staff workspace | Recommendation accept/dismiss | Shared `StaffRecommendationService` updates medical outcome/injury return date | Existing action path can be linked from Medical rather than duplicated |
| NG Player surface | 80-rating development, medical readiness, injury, fatigue/load/recovery timeline/history | Player Truth, injury, Career Fatigue and rating history | Connected projections; not treatment authority |
| Roster | Injury, availability, staff comments | Shared injury/eligibility-derived availability | Useful manifestation, not separate authority or unified Training/Medical management |
| Legacy Medical PCB route | Hard-coded sample players/injuries/Staff/facilities/date | No canonical simulation connection | Fake manifestation is opt-in legacy only; replace if supported or retire via BS21 decision |
| Legacy Training screen | Older 7-key rating summary | Stimulus has 35 compatibility keys | Key mismatch can under-report; repair or retire if route remains supported |
| Save V1 | Injuries, Training plans/responsibilities/sessions/modules, stimulus, fatigue, rating history persist | Canonical source records saved; derived status/load/risk/context reconstructed | No Save change needed for BS12A; event-level fatigue/session/executor history is absent |

## Authority and duplicate-risk matrix

| Concern | Canonical authority | Potential duplicate / stale representation | Risk and handling |
|---|---|---|---|
| Automatic Training | Scheduled Training executor called by daily Calendar | Legacy explicit executor and legacy plan models | Keep legacy API out of automatic calendar path; do not create parallel scheduler |
| Player development | 80 canonical Player Truth ratings + annual `OffseasonDevelopment` | 35 V2 and 7 V1 rating projections | Treat as compatibility views; fix stale UI mapping if supported |
| Fatigue/load | Persisted Career Fatigue; derived daily load; transient MatchSession fatigue | Similar labels across surfaces | Explain scopes; do not persist another daily-load/career-fatigue value |
| Injury | Persisted InjuryRecord; post-match generation | Catalog risk metadata | Metadata is not occurrence logic; no duplicate injury path |
| Availability | Shared active-injury + competition eligibility boundary | UI readiness labels | UI labels are projections; do not persist another available status |
| Medical risk | Derived risk assessment | Injury odds / availability | Keep read-only unless a product decision explicitly changes this |
| Recovery | Session and daily Calendar producers update same Career Fatigue | Could be misread as two recovery models or injury rehab | Keep shared target; explicitly distinguish fatigue recovery from injury treatment |
| Facilities | Derived CFI8 contexts | Suggested facility ratings in older audits/mock UI | Use real capability context only; no fabricated score or persisted copy |

## Cross-milestone boundaries

| Owner | Boundary |
|---|---|
| BS12 | Training/Medical domain lifecycle, physical/development consequences, medical availability decisions after approved product rules, consumption of existing Staff/CFI facts |
| BS13 | Rich Staff reasoning, career, personality, delegation, politics, organization-wide staff AI behavior |
| BS17 | Facility investment, construction, maintenance, serviceability operations; BS12 only consumes approved existing capability contexts |
| BS21 | Cross-app UX/information convergence and explicit legacy shell support/retirement decision |
