# MG6F — Dribbling & Drives Foundation

MG6F adds one transient `DriveIntent` to `MatchSessionState`. It is created only
when `SpatialState.ball` identifies an active player-controlled handler for the
attacking team. The existing matchup assignment supplies that handler's primary
defender. No second ball owner or persisted action state is introduced.

## Decision and target

The handler's canonical `DRIVE_FREQUENCY` tendency determines inclination. A
bounded spatial opportunity factor also uses current distance to the assigned
defender and attacked basket; no drive overall or tactical slider is added. A
successful decision consumes one `chance` draw from `decisionRandom`. Target
geometry and movement consume no RNG.

The target is a near-rim point 2.25 m from the attacked basket, offset 0.75 m to
the side opposite the assigned defender's current angle to the handler. The
attacking direction comes from the live handler and basket positions. Court
geometry clamps the final target inside a 0.6 m margin. This is one direct target,
not pathfinding.

## Ball handling and movement

The match profile derives `ballHandling` as the average of canonical
`BALL_CONTROL` and `DRIBBLE_SECURITY` ratings. While the drive is active, a
bounded 0.85--1.0 factor scales only that handler's MG6A/B maximum speed and
acceleration; better ball handling preserves more of the player's athletic
profile. Braking remains unchanged. The ordinary spatial movement primitive moves
the handler and synchronizes the controlled ball position to the handler.

The drive target overrides BaseSpacing for the handler. Existing off-ball cut or
screen/post-screen targets continue to control their own player. A screen may
reduce its assigned defender's movement under MG6D; the drive receives no extra
screen bonus, and an active roll/pop continues while the handler drives.

## Completion and cancellation

The intent ends within 0.45 m of its target or after three movement steps. It is
also cleared if possession changes, the controlled handler changes, the primary
defender assignment changes, or the handler/defender is substituted. No intent
transfers to a receiver. Existing shot, pass, contest and rebound systems consume
the resulting positions without an automatic shot, pass, foul or kick-out.

Live and Instant Result use the same MatchEngine. The visual bridge displays the
updated spatial snapshots; the renderer has no gameplay authority.

## Boundaries and validation

Advanced dribble moves, foul drawing, contact and block resolution, help defense,
rotations, coverages, collision handling, pathfinding and animations remain out
of scope.

- `npm test -- --run src/engine/match/DribbleDrives.test.ts`: focused drive,
  ball-sync, skill modifier, screen interaction and cancellation coverage.
- `npm run typecheck`: run once for this milestone.
- Full test suite and build are skipped by the MG6F milestone.
