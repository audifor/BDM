# MG5I · Rebound Geometry + Transition Foundation

## Rebound authority

Before MG5I, missed-shot rebound probability combined player rebounding impact
and standing reach. Rebounder selection used rebounding impact. MG5I adds the
current spatial distance of active players to the basket attacked by the shot.
It uses `SpatialState.players.position` and the canonical attacking basket; it
does not use BaseSpacing targets or move players to influence the outcome.

Proximity is normalized over 0–8 metres and contributes a bounded ±0.06 to the
existing offensive rebound probability before the existing 0.12–0.40 clamp.
Rebounder selection weights existing rebound impact with a bounded spatial weight
from 0.75 to 1.25. Skill remains part of both outcomes; position is not a
guaranteed winner.

The existing physical authority remains standing reach only. Height and wingspan
are not added as new rebound inputs. Offensive rebound keeps the attacking team
in possession. Defensive rebound changes possession. In either case, the chosen
active rebounder immediately controls the ball and the ball position matches that
player's current position. The resolver reuses its existing probability and actor
draws; MG5I adds no RNG draw.

## Transition foundation

After a made basket, turnover or defensive rebound, the new attacking team is
derived from the existing possession authority. Transition targets are derived
from the canonical attacking basket and current player positions. The offense
moves toward its attacking end while the other team moves toward its defensive
end. Each active player takes one bounded step through the MG5C `movePlayerToward`
primitive, using the existing 2 metre BaseSpacing movement limit. No transition
phase is persisted. On the next ordinary possession step, the existing BaseSpacing
pipeline runs from the resulting positions.

Live and instant simulation continue to share MatchEngine. This milestone adds no
fast-break decision tree, outlet pass, rebound trajectory, box-out behavior,
transition state machine, or tactical UI authority. Rebound and transition
controls remain deferred until they have a canonical mechanical consumer.

## Focused coverage

`SecondaryActionResolution.test.ts` checks that basket proximity changes rebound
probability and actor selection while rating differences still matter.
`MatchSession.test.ts` checks transition direction and step bounds, ball and
possession synchronization for rebounds, trigger behavior, and deterministic
wrapper/stepping equivalence.
