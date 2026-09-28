# BS5 · Player Dynamic State Connection & Carry-Over

## Scope and authority

BS5 connects existing dynamic Player state across the match result and calendar
loop. It does not add Player fields, change the 80-rating Player Truth model, or
replace training, medical, morale, availability, or Player Development authorities.
The field-by-field audit is in
[`BS5_PLAYER_DYNAMIC_STATE_MAP.md`](./BS5_PLAYER_DYNAMIC_STATE_MAP.md).

Persistent state remains in `GameWorld`: Career Fatigue, injuries, morale,
Development Stimulus, development history, and completed MatchStatLogs. Match
fatigue is transient engine session state. Match engines receive a compact profile
and projected fatigue, not the complete Player record or a copied dynamic-state
authority.

## Match input and session fatigue

Both the Match Next setup boundary and the application path that prepares legacy
MatchEngine sessions project the persisted 0–100 Career Fatigue value into the
session's existing 0–100 transient fatigue scale:

`initial MatchSession fatigue = clamp(Career Fatigue, 0, 100) × 0.5`

Thus Career Fatigue 72 begins a match at session fatigue 36. Fatigue does not change
availability; injury, roster, and competition eligibility continue to decide who
can play.

Match Next stores `preMatchCareerFatigue`, `initialFatigue`, and current `fatigue`
on its transient player state. While game time advances, each fixed 0.1-second tick
adds 0.0005. Player-attributed drives, screens, shots, passes, closeouts, rebounds,
steals/loose-ball recoveries, and defensive responsibility changes add small,
deterministic workload increments. These additions are bounded by the session's
0–100 scale.

Match Next uses this context locally: fatigue reduces top movement speed and
acceleration by at most 12%; shooting skill, pass quality, on-ball defense, drive
execution, and rebound impact receive small, bounded fatigue adjustments. It does
not multiply every rating by a single fatigue factor.

The existing legacy MatchEngine session begins at the same half-scale projection.
It retains its own on-court fatigue gain and bench recovery rates and its existing
fatigue-sensitive execution calculations. Match Next and legacy session details
remain transient and are not added to Save.

## Match result, workload, and persistent fatigue

At the canonical completed-result boundary, a deterministic consequence projection
uses actual minutes and attributed workload. Match Next uses played seconds plus
its player-attributed event categories. The legacy result path reconstructs transient
fatigue from the event timeline (including substitutions), and uses minutes and its
available box-score categories.

The projection persists only the positive net session change, never the final
session absolute value:

- Match Next: `Career Fatigue addition = positive session delta × 0.5`.
- Legacy MatchEngine: `Career Fatigue addition = positive session delta × 0.125`.

The legacy factor is smaller because its existing per-second fatigue gain is much
higher than Match Next's fixed-step load. Both results pass additions through the
existing Career Fatigue clamp. Unused players receive no Match Next workload or
stimulus; legacy bench time uses the existing session recovery mechanic rather than
counting as on-court load.

Match result application requires the Game to remain scheduled. After its first
application the Game is completed, so retrying the same result is rejected before
the dynamic consequence projection can run a second time. No per-match fatigue
ledger or debug state is persisted.

## Recovery and training

BS1's Calendar lifecycle still recovers 3 Career Fatigue per day before that day's
scheduled training. Training continues to add its existing intensity-based fatigue
to the same Career Fatigue map and accumulate its existing per-rating stimulus.
Match additions therefore enter the same state, then the existing daily recovery
and training rules process that state. No parallel recovery engine or fatigue field
was added.

## Development stimulus

Completed match participation adds bounded values through the existing
`addDevelopmentStimulus` domain function:

- played minutes contribute stamina stimulus;
- Match Next event categories contribute relevant drive, screen, passing, shooting,
  rebounding, and defensive stimulus;
- legacy match minutes and available box-score categories contribute corresponding
  stamina, shooting, rebounding, passing, steal, and rim-protection stimulus.

The canonical offseason Player Development engine remains the only match/training
path that changes Player Truth ratings. It later consumes accumulated stimulus
under its existing age/potential rules and records rating history. Match completion
does not grant ratings directly.

## Form, morale, confidence, and role outcomes

The audit found no canonical rolling Player Form or Player Confidence state. Recent
performance displays are derived from saved statistics. Board confidence is owned
by the Board/coach system and is not Player confidence. BS5 introduces no new Form,
confidence, expected-minutes, role-satisfaction, chemistry, or Player stress state.

The existing match-result application continues to apply its current bounded win/loss
morale events to roster players and coaches. Morale is not used as a new Match Next
performance multiplier. No additional performance-to-morale or minutes consequence
was justified by an existing canonical rule.

## Injuries and availability

Both match-preparation paths continue using the existing availability and eligibility
boundaries. Injury occurrence remains deterministic and based on actual played
seconds; injury recovery and return-to-play remain owned by the existing Injury and
Medical systems. MedicalRiskAssessment already consumes Career Fatigue for its
advisory risk band. BS5 does not alter injury probability or medical decisions.

Fatigue alone does not make a player unavailable. It affects match execution and
medical advisory, while current injury and competition rules determine availability.

## Live/Instant parity, save/load, and manifestation

Live and Instant Match Next resolve the same canonical session state, event timeline,
seed, result, and consequence projection. Presentation playback does not contribute
fatigue or development stimulus. A repeated completed-game application is rejected.

Persistent state touched by BS5 already belongs to Save V4: Career Fatigue,
Development Stimulus, injuries, morale, Player ratings/history, and MatchStatLogs.
No save shape or migration changed. MatchSession fatigue remains transient. Focused
Save V4 tests confirm the changed persistent fields round-trip without changing
Player Truth.

Existing training/load, medical/injury, morale, player performance, and development
surfaces continue to show the state they already own. BS5 does not redesign those
workspaces. The completed-match consequence projection provides a transient
inspectable value per player: minutes, event/box-score workload, pre-match Career
Fatigue, transient fatigue before and after, persistent fatigue addition, and
Development Stimulus addition.

The match engines now consume fatigue during resolution. Current automatic lineup
and rotation decisions do not select players based on Career Fatigue; no fatigue-aware
AI selection rule was added.

## Remaining milestone boundaries

- **BS8 · Coach AI:** fatigue-aware lineup, minutes, and rotation decisions remain
  unimplemented.
- **BS12 · Training/Medical:** richer fatigue/load interactions and actual injury
  probability changes remain unimplemented; current medical advisory already reads
  fatigue and current occurrence authority remains unchanged.
- **BS19 · Human RPG:** Player confidence, personal stress, role expectations,
  relationships, and other human consequences remain unimplemented because no
  canonical Player authorities for them were found.
