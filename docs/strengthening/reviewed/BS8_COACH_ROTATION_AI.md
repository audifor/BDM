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

## Competition clock, dead ball, and substitutions

Ball dead, game clock stopped, and substitution opportunity are separate states.
The Match Next setup receives clock behavior resolved from the specific
`Competition.rules.gameFormat`; it does not infer rules from a league or ecosystem
label. GameFormatRules carry period and shot-clock lengths, the offensive-rebound
reset, made-basket final-period thresholds, dead-ball causes that stop time, legal
substitution causes, and the inbound clock restart point. The named formats
configure FIBA at 24/14 seconds (full/offensive-rebound reset), NCAA at 30/20, and
NBA/WNBA at 24/14. FIBA stops a made-basket clock at 120 seconds in the final
period/overtime; NCAA/WNBA use 60 seconds in the final period; NBA uses 60 seconds
in its first three periods and 120 in the final period/overtime. Named formats
restart on inbound receive. FIBA made-basket substitution windows are limited to
the non-scoring team. Each competition may configure these values independently.

A made basket always records the score and creates its inbound state. It stops the
game clock only when the active competition's final-period threshold says so.
When time continues, it remains running while both teams form for the inbound and
through the inbound pass. When rules stop it, it restarts at the configured inbound
release/receive point. The shot clock starts when the receiver controls the inbound.

The controller considers a substitution only when a dead ball is also a
competition-defined substitution opportunity. The made-basket substitution window
has its own final-period threshold, configured independently from the clock-stop
threshold (the named presets currently use matching values). `ballDead` by itself
is insufficient, and a legal substitution window does not depend on whether the
game clock is running. The engine command rechecks competition legality and the
existing BS8 lineup validation before changing players. It proposes at most one
change per team. The canonical `substitution` event records incoming/outgoing IDs,
game clock, period, and reason; normal Match Next reconciliation rebuilds the active
five's offensive and defensive assignments.

The court MatchFrame contains only active players, so the departing token disappears
and the incoming token appears without bench animation. A separate read-only
`Rotación / validación` disclosure in the Live Match workspace shows both complete
match squads, starter status, COURT/BENCH, actual minutes, MatchSession fatigue,
pre-match Career Fatigue, total target minutes from the rotation plan, and the latest
substitution evidence. It also projects points, rebounds, steals, and field-goal
makes/attempts from authoritative Match Next events. Assists, blocks, fouls, and
player-attributed turnovers are omitted because Match Next has no authoritative
event support for them. The disclosure does not edit engine state.

No foul rule is inferred from unmodeled events: **FOUL TROUBLE ROTATION = DEFERRED**.

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
automatic coach substitutions because no live substitution control exists. The
validation disclosure is read-only; manual live coaching remains future work.

## Deferred scope

- **BS12 Medical:** no injury probability, treatment, or medical authority change.
- **BS19 Human RPG:** no new coach identity, trait, or attribute.
- **Future UI:** no manual live substitution surface or final stats screen.
- **Fouls:** no authoritative Match Next foul event exists, so foul-trouble
  rotation is deferred.
- No MatchEngine rewrite, movement engine, timeout strategy system, or new
  defensive AI was introduced.

## Visual validation

Use the user's next scheduled game in Match Next Live and open
`Rotación / validación`:

1. At tipoff, confirm five COURT players and five starters per team; remaining
   dressed players appear as BENCH.
2. Let the match run. COURT players accrue actual minutes; BENCH players do not.
3. Compare each player's actual minutes with the plan's total game target.
4. Watch fatigue rise for active players and recover for bench players; a player
   returning later retains their current MatchSession fatigue.
5. At a legal substitution, inspect the latest OUT/IN evidence and clock/period.
   Confirm COURT/BENCH changes and exactly five active players per team.
6. Confirm the five defensive assignments after the substitution target active
   players only and contain no duplicate defender.
7. Observe made baskets in ordinary time: score and inbound state appear while the
   game clock continues. In a configured final-period stop window, the clock stops
   and follows that competition's inbound restart rule. A basket alone does not
   create a substitution.

The actual-minute display comes from `MatchState.courtTimeTenthsByPlayerId`;
fatigue comes from the current MatchSession player state; target minutes come from
the canonical `CoachRotationPlan`; substitution details are projected from its
canonical event. The test suite validates deterministic state transitions but does
not replace this visual approval gate.
