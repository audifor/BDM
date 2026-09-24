# MG5G: Canonical Passing and Spatial Lanes

Before MG5G, MatchEngine had no pass action or canonical receiver. A possession now allows
one pass action, selected using the passer's existing `PASS_FIRST_BIAS` tendency. The passer
is the current same-team spatial ball holder when one exists, otherwise the normal chosen
offensive actor. The receiver is selected deterministically from active teammates excluding
the passer; bench players and opponents are not candidates.

`MatchPlayerProfile` transports canonical `PASSING_ACCURACY`, `PASSING_VISION`,
`PASSING_TIMING`, and `STEAL_ABILITY` signals. Passing execution combines those existing
passing signals; there is no passing overall. The resolver uses current `SpatialState`
positions to calculate passer-to-receiver distance and each of the five active defenders'
distance to the finite pass segment. Defenders whose projection falls behind the passer or
beyond the receiver exert no lane pressure. The maximum single pressure signal is used,
scaled by that defender's steal rating.

Completion probability is bounded to 0.35–0.97. It combines passing skill, a small bounded
pass-length penalty, and lane pressure. A completed pass emits `passCompleted`, keeps the
attacking team, and synchronizes the ball to the receiver's current position. The receiver
then controls the next action. A failed pass emits the existing turnover with a
`failedPass` marker and the intended receiver; when lane pressure identifies a defender, the
existing steal-credit chance may attribute the turnover to that defender. Player statistics
do not count a completed pass as an assist.

One pass per possession bounds action chains. The count persists through an offensive
rebound and resets when the possession ends or the period changes. Each pass action consumes
one existing action time interval; no shot clock, ball flight, or receiver movement is added.
Pass selection uses the existing sporting outcome draw; receiver selection adds one
`decisionRandom` pick and completion adds one `random.chance`. Failed-pass steal attribution
uses the existing conditional `actorRandom` chance. Geometry itself uses no randomness.
Live and Instant Result share MatchSession. The MatchViewer play-by-play formats pass events,
but court rendering and pass animation are unchanged.

Focused tests cover lane geometry and pressure, skill and length effects, pass completion and
ball transfer, failed-pass turnovers, and the pass-chain limit. Specialized pass types,
advanced passing AI, trajectory, cuts, transition, and rebound geometry remain deferred.
