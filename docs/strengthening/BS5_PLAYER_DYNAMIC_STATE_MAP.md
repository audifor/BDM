# BS5 · Player Dynamic State Map

Baseline audited at Stage 2 base `f66f78a0767dfb7efd5aa05417c340516cfe17b7`;
final connections recorded after BS5 implementation. This maps existing state and
does not add Player fields.

| State | Persisted? | Owner | Updated by | Used by Match? | Used by AI/UI? | Gap |
| --- | --- | --- | --- | --- | --- | --- |
| Career fatigue (0–100) | Yes, `GameWorld.careerFatigueByPlayerId`, Save V4 | GameWorld / Career Fatigue domain | Training adds load; daily Calendar recovery subtracts 3; completed Match Next and legacy matches add converted net match load | Yes. Projected into each engine's transient fatigue before resolution; Match Next uses it in player-specific movement and decisions | Medical risk advisory and training/load surfaces use it. Current lineup/rotation AI does not rank players by fatigue | No second fatigue authority. AI load-sensitive lineup choice remains BS8 work |
| Match fatigue | No; transient per session | Match Next `MatchState.players[].fatigue`; legacy `MatchSessionState.fatigueByPlayerId` | Match Next adds small time- and player-event load; legacy MatchEngine advances active and bench fatigue by elapsed game time | Yes. Match Next has bounded speed, acceleration, shooting, passing, on-ball defense, driving and rebounding effects. Legacy MatchEngine retains its existing selected fatigue execution effects | Match viewer may expose transient state only through presentation/debug; it is not saved | Conversion into persistent Career Fatigue occurs only at completed-result boundary; partial sessions are not persisted |
| Physical condition / stamina | No separate current-condition value. Stamina remains Player Truth; injury and Career Fatigue are dynamic state | Player ratings; Injury and Career Fatigue domains | Player Development changes ratings at its existing development boundary; matches/training update fatigue | Stamina remains a canonical rating input. No duplicate fitness field is introduced | Ratings and medical/fatigue surfaces | Short-term load is represented by existing fatigue and injury state |
| Injury | Yes, normalized `GameWorld.injuriesById`, Save V4 | Injury domain / GameWorld | Deterministic post-match injury application and medical actions | Yes. Active injury and competition eligibility filter availability before setup | Medical workspace and player/roster availability surfaces | Existing occurrence probability depends on actual played seconds. BS5 leaves injury rules unchanged; fatigue is already consumed by medical risk advisory |
| Availability | Derived, not persisted | `isPlayerAvailable`, eligibility, and match preparation | Recomputed for game date from active injury, roster, and competition rules | Yes. Both match preparation paths use available squads; fatigue does not disqualify | Roster, medical, and match preparation | No gap; fatigue affects execution, not eligibility |
| Morale | Yes, `GameWorld.moraleByPersonId`, Save V4 | Morale domain | Existing completed-result win/loss event and existing training events | Not an input to Match Next resolution | Morale projections and person/player UI where supported | No new match-performance or minutes rule. Existing bounded result rule remains the authority |
| Player confidence | No Player confidence authority found. Board confidence belongs to team/coach evaluation | Board system for team confidence | Season objective/tier outcomes | No | Board/coach UI | Do not reinterpret Board confidence as Player confidence |
| Player form | No canonical rolling form state. Recent results derive from match-stat history | MatchStatLog/history query and UI projection | Completed match logs supply recent statistics | No | Player overview/performance UI may show recent results | BS5 adds no form state or universal form multiplier |
| Development stimulus | Yes, `GameWorld.developmentStimulusByPlayerId`, Save V4 | Development domain | Training and completed-match participation add per-rating stimulus | Not a direct match-performance input | Development workspace shows accumulated progress | Match Next event involvement and legacy match minutes/box-score evidence add bounded stimulus; existing Player Development consumes it later |
| Development history / Player Truth changes | Yes, `playerRatingHistoryByPlayerId` and canonical Player ratings, Save V4 | Offseason Player Development | Annual development consumes stimulus, applies existing age/potential logic, records history, then resets stimulus | Current ratings feed resolution; matches never directly alter ratings | Player rating/history and development UI | No direct match-to-rating shortcut |
| Match minutes / workload | MatchStatLog per completed Game; Match Next and legacy engines derive played seconds from their canonical timelines | Match result/stat-log boundary | Match Next period/event projection; legacy event chronology including substitutions | Minutes and attributed actions accumulate session fatigue; completed participation contributes persistent fatigue and development stimulus | Match log and player performance views | Workload is a bounded deterministic projection, not a sports-science model |
| Training load | Training session/results persist; daily workload score is derived | Training domain and CalendarEngine | Scheduled training, daily recovery, existing load classification | Adds to the same persisted Career Fatigue that both match engines consume | Training workspace and load-management projections | Training remains its existing authority; match load writes to the same Career Fatigue map |
| Recovery | No separate recovery record; reflected in Career Fatigue | CalendarEngine / `recoverCareerFatigueForDay` | BS1 daily lifecycle subtracts 3, bounded at zero; scheduled training occurs after recovery | The next match reads recovered value | Training and derived medical surfaces | No second recovery engine |
| Role satisfaction / expected player minutes | No canonical player expectation/satisfaction state found | None for players; staff state is separate | N/A | No | Labels/rotation plans are not satisfaction | No dissatisfaction rule without canonical expectation data |
| Coach trust / coach-player relationship | Canonical relationships exist; no match-minute trust state/update found | Relationship domain | Explicit existing relationship events | No direct Match Next effect | Relationship surfaces | BS5 does not add a trust field or relationship rule |
| Chemistry | No Player/team chemistry state found in the audited authorities | None found | N/A | No | N/A | No state to connect |
| Personal stress / human state | Persisted StaffHumanState applies to Staff, not Players | Staff human-state system | Staff workload and role events | No | Staff workspaces | Do not transfer staff stress semantics to Players; Player RPG consequences remain BS19 work |
| Match injury-risk advisory | Derived, not persisted | MedicalRiskAssessment | Reads Career Fatigue, injury status, and recent injury history | Not a match-performance input; actual injury occurrence remains seconds-played based | Medical advisory/UI | Fatigue already changes advisory risk; BS5 does not rewrite occurrence or Medical authority |

## BS5 connections

- Match Next and legacy MatchEngine receive a compact per-player initial fatigue
  projection. The persistent Player and GameWorld models are not passed wholesale
  into the engines.
- Match Next starts at half of Career Fatigue on its 0–100 session scale. Legacy
  MatchEngine uses the same bounded half-scale starting projection for its existing
  0–100 transient fatigue mechanic.
- Match Next accumulates deterministic time load plus weighted player-attributed
  actions. Legacy MatchEngine retains its existing on-court gain and bench recovery.
- At result application, only positive net session fatigue is converted back to
  Career Fatigue. Match Next uses a 0.5 conversion; legacy uses 0.125 because its
  existing per-second accumulation is much larger. Both are bounded by canonical
  Career Fatigue rules.
- Workload contributes to the existing Development Stimulus map, never directly to
  Player Truth ratings. Match Next uses action involvement; legacy simulation uses
  its available minutes and box-score categories.
- Result application already prevents the same scheduled Game from being applied
  twice. Live and Instant Match Next share the same completed Match Next result and
  consequence projection.
- Injury occurrence, availability, existing morale result effects, daily recovery,
  and annual rating-development boundaries remain their existing authorities.

## Remaining state gaps

Player form, confidence, expected minutes, role satisfaction, chemistry, and player
personal stress do not exist as canonical Player state. BS5 leaves them absent.
Fatigue-aware AI selection/rotation decisions remain for BS8; Medical and training
system changes remain for BS12; Player Human/RPG consequences remain for BS19.
