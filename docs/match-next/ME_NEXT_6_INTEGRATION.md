# ME-NEXT 6 - Integration

## Status

ME-NEXT is wired to the existing Match workspace. Technical checks do not close the milestone; visual approval remains with the user.

## Architecture and authorities

`MatchEnginePort` selects the engine at the application boundary. The normal Match workspace uses the Match Next adapter for both **Play match** and **Instant result**. The legacy engine remains available to its existing consumers and is unchanged.

The app prepares one data-only `MatchSetup` from the scheduled Game, eligible squads, canonical player profiles, lineups, tactics, matchups, competition court/clock, and seed. `MatchNextLiveController` owns a single `MatchState`; `tick()` advances its clocks, ball, player positions, rebound physics, responsibilities, actions, and transitions. `MatchFrame` is a read-only projection of that state.

The live session opens with both teams spaced around the center circle, with the two highest-standing-reach starters contesting the ball. A seeded outcome informed by standing reach determines the tip and starts a fast-break transition for both teams. The game and shot clocks start only when the tipped ball is controlled. Later periods and dead-ball restarts continue through the inbound path; at a made basket, all ten players move into inbound and defensive positions before play resumes.

The possession lifecycle is:

`opening jump ball or later dead-ball inbound -> possession -> 5OUT setup/advance -> decision/action -> defensive response -> shot, turnover, or reset -> rebound/loose-ball resolution -> transition or next possession`.

Passes remain in flight until their scheduled reception. At that point, a defender who is closer to the live ball than the intended receiver may intercept through the same physical acquisition rule as explicit interception commands; the canonical interception event closes the old possession, starts the defender's possession, and feeds PBP/stat projections.

M1-M5 do not implement screens/P&R, so this integration does not claim those actions. Existing action chaining supports drive/help/kick-out/catch-and-shoot, and defensive responsibilities keep reacting to the same live positions. Defensive and offensive rebound outcomes establish possession before transition roles act. Period and made-basket inbounds move the inbounder through engine kinematics before releasing the pass.

## Court presentation and parity

The normal Match workspace reuses BDM's existing `MatchCourt`, `LiveCourtStage`, scoreboard, and playback center. ME-NEXT frames provide every visible player position, ball position/height/state, possession owner, clock, and score. Presentation does not select actions or resolve outcomes. PBP lines project canonical events; pass lines name passer and receiver. Completed stats and Game application derive from the same final result/event stream.

LIVE and INSTANT use the same setup/controller path and seed. A live result is applied through the existing Game, stat-log, eligibility, season, and injury boundaries without changing save shape.

Existing pace, shot profile, featured-player, and MAN interior/perimeter tactics feed Match Next where supported. Unsupported tactics such as P&R coverage remain inert until their action system exists. Player decisions use canonical contextual attributes and geometry; no Overall value is introduced.

## Manual visual validation

1. Run `npm run dev` and open `http://127.0.0.1:1425/` (or the Vite URL shown in the terminal).
2. Start/load a career, open the **Match** workspace, and use its scheduled match for today.
3. Click **Play match**. The existing match center should show the normal BDM court, scoreboard, playback controls, ME-NEXT possession state, and live PBP.
4. Confirm the game opens with both jumpers at center and a visible ball toss before the clock starts. Watch a normal half-court sequence. Pause and use **Proxima posesion** to inspect multiple possessions. Watch the same court for a drive/help/kick chain, missed shot/rebound, defensive rebound/outlet/transition, and made-basket inbound if the match produces them.
5. Confirm playback starts at 1× and that the court animates continuously between engine frames. Check that the ball travels between the named passer and receiver, stays airborne during flight, and ends at the resolved owner. Compare the clock/score/PBP with the court and possession state.
6. Let the match finish or select **Simular final**. Confirm the final score/stats appear and the Game is completed when continuing.
7. Return to a fresh scheduled match and use **Instant result**. It should use ME-NEXT and apply the result through the same completion boundary.

The minimum visual gate is that the main Match workspace visibly uses ME-NEXT and shows coherent connected basketball on BDM's existing court. Also inspect pick-and-roll, extra-pass, offensive-rebound second chance, and transition slowdown only if the current M1-M5 actions produce those cases; do not count unsupported actions as passed.

## Known limitations

- No screen/P&R actions, in-game substitutions, or live coaching controls exist in M1-M5.
- Assists, blocks, and fouls lack authoritative events and are not inferred. Minutes use initial lineups because substitutions are outside scope.
- Offensive rebound shot-clock reset is unresolved by competition rules and remains unset.
- The existing disk-save repository requires the Tauri host.

## Focused validation

- `src/engine/match-next/matchNextActions.test.ts`
- `src/engine/match-next/matchNextTransition.test.ts`
- `src/engine/match-next/matchNextDefense.test.ts` (tactical-plan test only)
- `src/app/matchNext/MatchEnginePort.test.ts`
- `src/ui-ng/applications/match/MatchWorkspace.test.tsx`
- `npm run typecheck`
- `npm run build`

The full suite and long season certification are intentionally not part of ME-NEXT 6. Final PASS requires explicit user visual approval.
