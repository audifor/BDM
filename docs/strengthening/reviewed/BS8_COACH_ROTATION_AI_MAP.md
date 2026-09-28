# BS8 · Coach + Rotation AI Map

Audit base: BS5 at `b0cc5916293c621c99c7c5efee27d3ea8b2a96ad`. This map records the
authorities after BS8 integration.

| Decision | Current authority | Inputs | Output | Used by LIVE? | Used by INSTANT? | Gap / boundary |
| --- | --- | --- | --- | --- | --- | --- |
| Available roster | `getAvailablePlayersForCompetition` and eligibility/injury domains | Roster, game date, competition eligibility, injury status | Legal match squads | Yes | Yes | Sole availability authority; unavailable players are absent from `MatchSetup` |
| Starting five | `createCoachRotationPlan` in `engine/tactics/CoachRotationEngine.ts` | Available squad, Player Truth, Career Fatigue, positions, tactics, coach, opponent roster, saved user lineup | Ordered contextual five plus role assignments | Yes | Yes | Saved legal user five remains fixed; AI/default five is contextual |
| Lineup legality and balance | Coach role fit and unit projection; `validateMatchSetup` remains the boundary | Primary/secondary positions, five role fits, handling, spacing, interior/rebounding and perimeter defense | Five distinct legal squad players | Yes | Yes | Balance is transient; no persisted lineup score or Overall |
| Team strength projection | Existing `calculateTeamStrength` / `PlayerImpact` outside the coaching plan | Existing ratings and derived PlayerImpact | Existing legacy team-strength input/projection | No Match Next decision use | No Match Next decision use | Retained for its existing surface; it is not used by `CoachRotationPlan` to choose starters, minutes, or substitutions |
| Rotation depth and target minutes | Same `CoachRotationPlan` | Role fit, available depth, starters, `shortRotationCoach`, period length, explicit `TeamRotationIntent` | Deterministic per-period targets summing to five times period length | Yes | Yes | Invalid saved minute matrices fall back to contextual targets |
| Match substitutions | `decideRotationSubstitutions` and the `coachSubstitutions` engine command | Active five, plan targets, actual period time, MatchSession fatigue, clock/score, legal bench fit | Validated substitution event and active-five mutation | Yes | Yes | At most one change per team for a newly reached dead-ball stoppage |
| Court membership and fatigue | `MatchState.players.active`; existing `advanceMatchSessionFatigue` | Active/bench status and running game clock | On-court fatigue gain and existing bench recovery | Yes | Yes | Returning players retain their actual current session fatigue |
| Actual minutes and plus/minus | `MatchState.courtTimeTenthsByPlayerId`; `derivePlayerStats` replays substitution events for plus/minus | Clock-running ticks and canonical lineup/substitution event order | Per-player seconds, starter flag, plus/minus and box score | Yes | Yes | BS5 consumes those per-player seconds at completion |
| Defense/attack continuity | Existing Match Next structure and defensive reconciliation after engine commands | Active five, current possession and canonical assignments | Reconciled offensive slots and defender assignments | Yes | Yes | BS8 does not change movement or defensive decision rules |
| Match setup and simulation mode | `MatchNextEnginePort` uses `prepareMatchSetup`, `MatchNextLiveController`, and `skipToEnd` for both modes | Same setup, seed, coaching plans and transitions | Identical coaching/substitution event stream | Yes | Yes | The viewer renders the active five from the current frame; no bench animation is added |
| Coach profile | Existing `StaffProfile` tactical knowledge/adaptability and `shortRotationCoach` trait | Existing staff attributes and RPG trait | Tactical-fit weighting, bounded fatigue tolerance, and depth preference | Yes | Yes | No new Coach attribute, Coach Overall, or persisted plan is introduced |
| Foul trouble | No authoritative Match Next foul events | None | None | No | No | **FOUL TROUBLE ROTATION = DEFERRED** |
| User override | Saved `TeamLineup`, tactics, and existing rotation intent | User-authored pre-game decisions | Preserved legal starting five and rotation intent | Yes | Yes | No manual live-substitution UI; future user commands belong before the same engine validation boundary |

## Authority boundaries

- Availability is resolved before coaching. A player excluded by eligibility or
  injury cannot appear on the Match Next bench or enter through a substitution.
- `CoachRotationPlan` is transient coaching truth shared by Match Next Live and
  Instant. UI and result code are projections of it and of canonical events.
- The player role fit is a contextual projection from canonical Player Truth. It
  uses role-specific evidence and unit balance; no persisted Overall, legacy
  Overall, or generic single-number player-quality selector becomes coaching
  truth.
- A saved legal user lineup is preserved. AI teams use the same selector but
  select from available players rather than being locked to a stale saved five.
- Existing explicit `TeamRotationIntent` is honored as a pre-match instruction;
  automatic targets are used when no explicit plan exists.
- Substitution requests are generated by the coach engine and applied only by
  the Match Next command boundary at a new dead-ball event. Reconciliation then
  rebuilds current offensive and defensive structures.
- The application records playing time from running clock ticks. Substitution
  events reconstruct the lineup for plus/minus; BS5 workload, persistent Career
  Fatigue, and Development Stimulus use the resulting actual seconds.
- The user team currently receives the same automated in-game coaching default
  as AI teams. A future live coaching command can override a specific decision
  before it reaches the existing validation boundary; BS8 adds no live coaching
  UI.
