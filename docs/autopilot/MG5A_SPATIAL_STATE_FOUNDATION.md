# MG5A — Spatial State Foundation

MG5A starts from certified MG4G `3307cec`. MG4H remains deferred because no canonical player trait catalog exists.

## Canonical court

`src/domain/court/CourtGeometry.ts` owns the shared court footprints in meters. MatchEngine selects FIBA, NBA/WNBA, or NCAA geometry from the game's competition ecosystem and category. The existing MatchViewer court rules reuse the same length, width, and basket offset values; presentation projections remain UI-only.

Coordinates use `x` along court length from the left baseline and `y` across court width from the lower sideline. Baskets sit at the shared regulation offset from each baseline and at court center width. Home attacks right in periods 1–2 and left afterward; away attacks the opposite basket. Queries support both directions without changing the coordinate system.

## Runtime state

`MatchSessionState.spatial` stores the court, one position per active player, and the ball state. At session creation, lineups receive a deterministic five-slot bootstrap formation oriented toward each team's opening-period basket. These are initial anchors only; they do not model tactical spacing or movement.

The current MatchEngine has team possession but no player ball handler at session creation. The ball therefore starts unassigned at court center. The ball type also supports a loose ball and player control; the player-controlled state is tied to the holder's current position, and a substitution transfers that state to the incoming player if the outgoing player holds it. A substitution preserves active-five correspondence without animation or RNG use.

The state is runtime-only. It is not persisted and does not change shots, passes, defense, rebounds, events, or match results. React and the renderer have no spatial authority. Movement, spacing AI, collision, ball flight, and shot-distance effects remain out of scope.

## Proofs

Focused court and MatchSession tests cover court bounds and basket placement, ecosystem geometry selection, deterministic 10-player bootstrap, ball initialization, and substitution synchronization. Full suite and build are intentionally skipped; typecheck is run because MatchSession's shared runtime type changes.
