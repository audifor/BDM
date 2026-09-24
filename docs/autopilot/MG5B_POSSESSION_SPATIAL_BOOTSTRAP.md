# MG5B — Possession Spatial Bootstrap

MG5B extends the certified MG5A spatial runtime. Possession authority remains `MatchSessionState.attackingTeamId`; spatial views derive the offensive team, defensive team, and attacking basket from that field, the match teams, period, and canonical court geometry. No second possession state is stored.

When `stepMatchSession` selects its existing offensive actor, the spatial ball is associated with that player for the current resolution. At the returned session boundary, a known rebounder or credited stealer becomes the holder. Made baskets, fouls, and turnovers without a credited stealer leave the ball unassigned until the next handler is selected. A period transition also releases the previous handler; the attacking-basket query follows the existing period direction rule.

Ball control is derived from the active spatial player position. A held ball must reference an active player on the current offensive team and match that player's coordinates. Substitution preserves the holder by transferring control to the incoming player at the same position. There is no pass/receiver transfer mechanic in the current engine, so pass transfer remains pending.

Spatial synchronization consumes no RNG, changes no event or action choice, and does not affect sporting resolution. Player coordinates do not move. Movement, formations, trajectories, shot location, rebound geometry, and renderer integration remain out of scope.

## Proofs

Focused MatchSession tests cover derived offense/defense/direction, turnover and made-basket flips, rebound holder/position synchronization, period direction, substitution holder transfer, spatial invariants, and unchanged RNG draw counts in a deterministic miss/rebound path. The inherited pinned-score mismatch was reproduced on MG4G and is not changed here.
