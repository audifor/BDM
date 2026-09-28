# BS8 · Coach + Rotation AI

## Result

BS8 adds one deterministic coaching plan consumed by Match Next setup and runtime.
It determines the starting five, player roles, rotation depth, per-period minute
targets, and eligible replacements. Live playback and Instant Result share the
same `MatchNextLiveController` state transitions and substitution decisions.

## Starting five and lineup evaluation

`createCoachRotationPlan` selects from the game-ready squad already filtered by
eligibility and medical availability. It evaluates Player Truth by role:
handling and passing for a point guard; shooting, movement, and perimeter defense
for wings; interior scoring, strength, rim protection, and rebounding for bigs.
Position and secondary-position fit, player fatigue, tactical emphasis, opponent
perimeter/interior profile, and lineup-level handling, spacing, defense, and
rebounding affect the transient decision.

A legal five saved by the user is preserved. AI/default selection is contextual
and deterministic, with player ID as the last tie-break. Career Fatigue reduces a
player's role fit before tipoff, so a suitable fresher player can displace a tired
equivalent. The plan does not persist a score and does not use PlayerImpact,
Overall, legacy Overall, or another universal player rating as coaching truth.
The existing `calculateTeamStrength` projection remains for its previous
legacy/summary surface and is not consulted by the Match Next coaching plan.

## Rotation and minutes

The plan allocates each period's available player time across its selected
rotation. Targets account for role fit, the starting five, available depth, and
the existing `shortRotationCoach` trait. The staff's existing tactical knowledge
weights tactical fit; adaptability modestly changes bounded fatigue tolerance.
The plan supplies the rotation targets to the Match Next runtime. Valid saved
minute matrices become the period targets, and valid saved clock-window
instructions are considered first at stoppages. Invalid minute matrices fall
back to contextual targets. Existing authored intent remains an input rather
than a second saved rotation authority.

Targets are guidance rather than timed choreography. During play, substitution
pressure combines the player's target-minute overrun, MatchSession fatigue,
replacement role fit, and late-game score/clock context. Close late games increase
fatigue tolerance; late blowouts reduce unnecessary load. No possession-by-
possession hot-hand rule was added.

## Substitution and continuity

The controller evaluates substitutions only when a new `ballDead` event marks a
stoppage. It proposes at most one change per team at that boundary. The engine
command validates team membership, active/bench status, a five-player lineup,
and position/role fit. It writes the canonical `substitution` event, swaps
active status, places the incoming player at the outgoing player's court spot,
and clears the outgoing player's temporary responsibilities. Normal Match Next
reconciliation then rebuilds offensive slots and defensive assignments.

The MatchFrame contains only active players, so the departing token disappears
and the incoming token appears without bench animation. The substitution event
is projected into play-by-play with incoming and outgoing player IDs and its
reason. No foul rule is inferred from unmodeled events: **FOUL TROUBLE ROTATION
= DEFERRED**.

MatchSession fatigue is not reset on entry. The existing clock-running fatigue
authority increases fatigue for active players and recovers it for players on the
bench. A player who returns carries their current value.

## Actual minutes and BS5

`MatchState.courtTimeTenthsByPlayerId` increments only while the game clock runs
and only for the active five. Match Next result statistics use these values for
actual seconds played; canonical substitution event order supplies the active
lineup for plus/minus and the final `started` flag.

BS5's existing post-match dynamic consequence path consumes those seconds. A
player who stays in longer receives more minute workload and stimulus; a player
who enters later receives only their actual time. Existing MatchSession fatigue
increments and development stimulus are applied at match completion through
the established Career Fatigue and Development Stimulus authorities.

## User, AI, and future boundary

Both teams use the same coaching plan and runtime. A valid user-saved starting
five and explicit rotation intent are honored. The user team currently uses
automatic coach substitutions because no live substitution control exists.
Future manual commands can target a particular substitution before the same
engine validation boundary; BS8 does not add that interface.

## Deferred scope

- **BS12 Medical:** no injury probability, treatment, or medical authority change.
- **BS19 Human RPG:** no new coach identity, trait, or attribute.
- **Future UI:** no rotation-plan display or manual live substitution surface.
- **Fouls:** no authoritative Match Next foul event exists, so foul-trouble
  rotation is deferred.
- No MatchEngine rewrite, movement engine, timeout strategy system, or new
  defensive AI was introduced.

## Visual validation

Use the user's next scheduled game in Match Next Live and keep playback at 1×
through the first quarter. The automatic plan produces a substitution during a
normal full-length match without manual commands. For a deterministic local
reproduction, prepare that same world/game through `createMatchEnginePort('match-next').prepare(world, game, 20260928)` and create its live session; the focused test
`CoachRotation.test.ts` uses the same seed and waits for the first substitution.

Watch the play-by-play and court frame through the stoppage. Confirm the outgoing
token disappears, the named incoming player appears at that court position, the
score and clock resume, and five valid defensive assignments return after the
inbound. The focused test also confirms returning players keep their current
MatchSession fatigue. Match Next tests verify deterministic event and minute
outputs; they do not replace this visual approval gate.
