# MG6G · Defensive reactions

MG6G adds a small spatial help and recovery reaction to the shared MatchEngine.
`MatchSessionState.defensiveReaction` is transient runtime state; it is not part
of `MatchSimulation`, `GameWorld`, or save data.

## Threat sources

The engine recognizes only active `DriveIntent`, `rimCut`, and post-screen `roll`
intents. A threat must be within its source's configured help distance of the
attacked basket, and its active target must be closer to the basket than its
current position. Pop, `spaceCut`, outward movement, and ordinary BaseSpacing
movement do not trigger help. A handler change invalidates the old drive and roll
through their existing intent ownership checks; the next active intent is
evaluated against current positions.

## Help and rotation

The primary defender assigned to the threat is ineligible. The closest remaining
active defender to the help point is selected with player ID as the stable tie
break. The help point is two metres from the threat toward the attacked basket.
It overrides only that defender's current BaseSpacing target.

One other defender may rotate toward the helper's exposed assignment. The rotation
has no follow-up rotation. The exposed player retains their actual location and
can benefit from existing shot-contest and passing-lane geometry; MG6G adds no
abstract defense bonus.

## Recovery and authority

When no eligible threat remains, the helper and optional rotator return to their
current BaseSpacing targets. This closeout uses their MG6A/B kinematics and does
not teleport or add a contest bonus. The runtime reaction clears after recovery.
Possession changes clear it immediately. A substitution of the helper, rotator,
threat player, or protected assignment clears the reaction so no stale player
references remain.

The target precedence is possession transition, then defensive reaction, then
BaseSpacing. Offensive drive, cut, screen, roll, and pop targets retain their
existing authority. Live and Instant Result use the same MatchEngine core; the
renderer only presents spatial state.

MG6G introduces zero RNG draws and uses no defensive ratings or tendencies. It
does not implement switch, drop, hedge, blitz, zone, traps, or chain rotations.
