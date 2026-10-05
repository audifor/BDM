# BDM MatchEngine Next
# ME-NEXT 5: Transition & Rebounding

## Status

**FINAL PASS (2026-09-27).** The user approved the rebound capture and D interception after the latest corrections. Certification completed. Debug: `http://127.0.0.1:1424/?matchNextDebug=1`.

## Base

```text
811df6cefbbd8833ea6914052eb4ff726b487ab7
```

## Rebounding and transition architecture

- Misses create physical rebound roles and targets. Box-outs and pursuit use the existing movement intents and `PlayerKinematics`; proximity and the existing rebound resolver determine the winner.
- Rebound control uses a 0.12 m contact radius. The ball is secured only when a player's physical kinematics reaches its fixed landing point; rebounding, reach, position, and outcome RNG matter only among players in contact range. Passes and other ball interactions retain their existing acquisition radius.
- Pursuit, box-out, and transition-safety targets use the landing point, not the ball's changing flight position. Autonomous misses carom back from the basket along the shot line rather than returning to the shooter's release position.
- Two selected attackers crash while the remaining attackers preserve transition safety. Defenders box out assigned attackers and selected nearest defenders pursue when the ball is collectible.
- A defensive rebound, interception, or eligible loose-ball recovery establishes transition roles for both teams. Offense fills BALL_ADVANCE, lanes, RIM_RUN, and TRAIL; defense fills STOP_BALL, PROTECT_RIM, and assigned MATCH roles. Targets derive from live player and ball positions, basket, and court geometry.
- The outlet is a real PASS action and physical catch. The transition ends when the handler enters the front court or the defense stops the break; normal 5OUT and MAN responsibilities then resume through kinematics.
- Debug D compares passes to real receivers and stages an interception only when a defender reaches within 0.12 m of the live ball through MatchState kinematics. Scenarios render MatchState positions, rebound/transition roles, intents, and events. No display-only movement or outcomes are added.
- Debug scenes begin with a wing three, then give both teams 4 seconds of real MatchState movement to settle into 5OUT/MAN before the staged miss. The inspector shows shot distance and counts crash, pursuit, box-out, and safety roles.

## Focused validation

- Ball and possession authority: `matchNext.test.ts`, **21 passed**.
- Transition and rebounding integration: `matchNextTransition.test.ts`, **3 passed**.
- Match Next debug controls: `MatchNextDebugApp.test.tsx`, **1 passed**.
- `MatchNextDebugApp.test.tsx` also verifies D's interception contact distance is at most **0.12 m**.
- Typecheck: **PASS**.
- Build: **PASS**.
- `cargo fmt --check --manifest-path src-tauri/Cargo.toml`: **PASS**.
- `cargo check --manifest-path src-tauri/Cargo.toml`: **PASS**.
- Full repository suite: initial parallel run had **22 failures across 13 files** (21 timeouts under parallel load and one transient `LiveMatchController` assertion). The affected files were rerun serially; **160/160 tests across 14 files passed**.
- `git diff --check`: **PASS**. Match Next engine diff against the base is empty.
- `Math.random(` search in `src/`: **no matches**. No improper React, Zustand, or Tauri imports in Domain/Engine.

## Serialization, determinism, performance

- JSON round-trip and deterministic continuation are covered during rebound pursuit and again after the rebound, during transition.
- Rebound winner selection and role ordering use deterministic state and injected outcome RNG; same-state continuation is covered by the focused integration test.
- An attempted 24k-tick closeout fixture did not produce active transition ticks, so it was discarded and no transition performance number is claimed. Functional transition/rebound integration and the existing engine workload benchmark remain covered by the focused tests.

## Open questions

- Competition-owned offensive rebound shot-clock reset remains unresolved; the existing explicit `null` behavior is preserved.

## Human visual review

Use **Vertical Transition Slice** first, then inspect A-G. Step or play to observe the actual rebound pursuit, defensive/offensive possession outcome, outlet or live turnover, both teams' transition lanes/recovery, and return to SETUP. The engine state panel should agree with the court: target markers follow MatchState intents, and the ball owner changes only when the physical resolver records the rebound/catch/interception.

The local dev server is running on port 1424. Human visual result: **PASS**, including the rebound contact and D interception update.
