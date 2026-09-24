# MG4A · MatchEngine V3 Canon & Authority Audit

Branch: `matchengine-v3-mg4a`
Base: `origin/main` @ `3f84e4aca22d29ef4e895c829eefe5a94f833df4`
Scope: read-only architectural audit. No production behavior changed.

> Note on prior-work claims: no MG2A/MG2B/MG2D documentation exists anywhere in this
> repository (`docs/`, `docs/autopilot/`, root). Whatever introduced `TeamLineup`,
> `LineupEngine`, rotation plans, and `saveCompletedMatch()` is real and present in
> code, but its lineage under those milestone names is unconfirmed. This audit treats
> that prior work as **found in code**, not as verified milestone history.
>
> `docs/ARCHITECTURE.md` (~1050 lines) is an accurate, currently-maintained running
> record of match-simulation decisions and was cross-checked line-by-line against
> source during this audit. `docs/autopilot/PRODUCT_GUARDRAILS.md`'s "do not
> introduce" list (rotations, fatigue, tactics, etc.) is **stale** — every item on it
> is already implemented and verified in code. It should not be trusted as current
> without cross-referencing `ARCHITECTURE.md`.

---

## 1. Executive Summary

The MatchEngine core is architecturally sound: a single deterministic simulation
(`MatchEngine.stepMatchSession`) backs Live, Instant, User, and AI matches; RNG is
fully seeded (zero unseeded `Math.random()` in `src/`); the event stream, clock, and
statistics all have single, non-duplicated authorities; the renderer and Match UI
have no gameplay authority. The two real problems are narrower than a full rewrite:

1. **Player ratings never reach the engine.** The canonical 80-key Player Truth is
   collapsed through a 35-key and then a 7-key legacy projection before touching any
   possession-resolution formula. This confirms MG4B's premise.
2. **User-configured starting lineups are silently ignored.** The canonical, persisted,
   UI-editable `TeamLineup` is never read by match preparation; a separate
   auto-pick algorithm (`selectStartingFive`) always overrides it. This is an active
   correctness bug, independent of the ratings problem.

No `CanonicalMatchInput` type exists yet; its closest equivalent (`SimulateMatchOptions`)
is well-factored and free of mid-match GameWorld reach-through, which is the most
important invariant and already holds cleanly today.

---

## 2. Current Match Architecture

```
playUserGame.ts (application layer)
  ├── prepareMatch() ─────────────► instantResult() / simulateAndApplyGame()
  │     ├── availableSquads()            (injury/eligibility filter, GameWorld read — pre-match only)
  │     ├── selectStartingFive()         (legacy-rating-driven auto lineup — see §8)
  │     ├── createMatchPlayerProfile()   (80→35→7 legacy collapse — see §6)
  │     ├── calculateTeamStrength()      (legacy, unused in possession math)
  │     ├── getEffectiveTacticalPlan() / getGamePlan()
  │     └── homeRotationPlan/awayRotationPlan resolution
  │
  └── createLiveUserMatch() ──────────► LiveMatchController
        (constructs input inline; DOES NOT call getEffectiveTacticalPlan/getGamePlan — drift vs. prepareMatch, see §5)

MatchEngine.ts
  createMatchSession()          — one-time GameWorld validation (getGame), builds MatchSessionState
  stepMatchSession()  ══════════ SINGLE SIMULATION AUTHORITY for Live, Instant, User, AI
  MatchRotationRunner.simulateMatchWithRotations()  — wraps the above with applyDueRotations

completeMatch() → applyCompletedMatch() → MatchResultApplication
  → createMatchStatLog()  (derived once from MatchEvent[], persisted)
  → GameWorld.matchStatLogsByGameId  (sole persisted match artifact)
  → PostMatchInjuries (deterministic, seeded, post-completion only)

UI (src/ui/match/**)
  CourtPresentation / CourtDynamicRenderer — purely derived/decorative, zero gameplay authority
```

All entry points (Live, Instant, user match, AI-vs-AI / background sim, `simulateUntilDate`'s
user-game branch) converge on `stepMatchSession`/`createMatchSession`, the same
`prepareMatch`-family input construction, and the same seed derivation
(`hashStringToSeed(gameId)` plus two fixed-string-keyed sub-streams). **Convergence: YES**,
with one caveat: `LiveMatchController` re-implements the rotation-loop instead of calling
`simulateMatchWithRotations` directly (duplicated logic, not a current divergence — see §5).

---

## 3. CanonicalMatchInput Audit

No type named `CanonicalMatchInput` exists (zero matches repo-wide). The de facto input is
`SimulateMatchOptions` (`src/engine/match/MatchEngine.ts:183-196`).

| Field | Status | Evidence |
|---|---|---|
| `world` | PARTIAL | Used only for one-time `getGame()` validation in `createMatchSession`, not simulation input proper. |
| `gameId` | CANONICAL | From `Game.id`; also the seed source. |
| `homeStrength`/`awayStrength` (`TeamStrength`) | LEGACY | Derived via `calculatePlayerImpact`→`legacyRatingSignals` (80→7 collapse). Confirmed **unread** inside `stepMatchSession`'s possession logic. Still used for lineup ranking and post-match Coach XP/Reputation. |
| `squads` | CANONICAL | Player-ID arrays from `getAvailablePlayersForCompetition` (injury + eligibility filtered). |
| `playerProfiles` (`MatchPlayerProfiles`) | LEGACY | Built via `legacyRatingSignals(player.basketball.ratings)` — the 7-key legacy projection, two collapse-steps from the 80-key Truth. Source comment: `"TEMPORARY_MATCH: derived read signals, never PlayerTruth or persisted data."` This is real gameplay-resolution authority. |
| `lineups` (`MatchLineups`) | PARTIAL/LEGACY | From `selectStartingFive`, an auto-pick-best-by-position algorithm using legacy `calculatePlayerImpact`. Does **not** read the canonical persisted `TeamLineup` (see §8, major finding). |
| `random`/`decisionRandom`/`actorRandom` | CANONICAL | Three independent seeded streams, deterministic from `gameId`. |
| `tacticalPlans` | CANONICAL (optional) | Backed by persisted `world.tacticalPlansByTeamId`/`world.gamePlansByKey`. |
| `defensiveMatchups` | CANONICAL (optional) | From persisted `TeamGamePlan.matchups`. |
| rotation plans | PARTIAL | Resolution order `gamePlan.rotationOverride ?? world.rotationPlansByTeamId[...] ?? createDefaultRotationPlan(...)`; fallback is a fixed clock-threshold algorithm with no fatigue-awareness. |
| Physical data (height/weight/wingspan/reach/health) | MISSING | Not present in `SimulateMatchOptions` or `MatchPlayerProfile` at all. |
| Coaching/staff attributes | MISSING | No coach-skill modulation of tactics reaches the engine. |
| Match context: clock/periods | CANONICAL | `resolveGameClockRulesForGame(world, game)` — real per-competition rules, not a global constant. |
| Home advantage | MISSING/INERT | Documented in `ARCHITECTURE.md` prose, but since `TeamStrength` is unconsumed in possession resolution, home advantage as a live mechanic is currently inert — a documentation/behavior mismatch. |

**Conclusion:** No unified `CanonicalMatchInput` type exists. The de facto input is
well-factored and boundary-clean, but its player-facing rating signal is legacy-collapsed
and its lineup source bypasses the canonical persisted lineup.

---

## 4. GameWorld Boundary Audit

Only one production GameWorld read exists inside `src/engine/match/`:
`getGame(options.world, options.gameId)` (`MatchEngine.ts:530`), called once from
`validateOptions`, itself only invoked from `createMatchSession` — strictly at
session-construction time, **never inside `stepMatchSession`**.

| File | Symbol | Data read | Risk | Classification |
|---|---|---|---|---|
| `MatchEngine.ts:530` | `validateOptions`→`getGame` | `Game` status/team IDs | None — pre-match only | **KEEP** |
| `RotationPlan.ts` (`createDefaultRotationPlan`) | `world.players` | Legacy `calculatePlayerImpact` ranking | Pre-match only, not live | **KEEP** |

**No mid-match GameWorld reach-through found.** This invariant already holds cleanly and
should be preserved as-is in V3, not re-architected.

---

## 5. Live vs Instant

| Layer | Live | Instant | Shared? |
|---|---|---|---|
| Input construction | Inline in `createLiveUserMatch` | `prepareMatch` | **NOT the same function** — Live omits `getEffectiveTacticalPlan`/`getGamePlan`/`defensiveMatchups` wiring that Instant has. Real, verifiable drift. |
| RNG seeds | Identical derivation strings | Identical derivation strings | YES |
| Simulation core | `createMatchSession` + manual step loop in `LiveMatchController` | `simulateMatchWithRotations` | YES (same underlying primitives, duplicated orchestration wrapper) |
| Rotations | `applyDueRotations` called manually per step | Same, inside `simulateMatchWithRotations` | YES |
| Mid-match tactics | `LiveMatchController.applyTactics()` is a **stub** (no-op, explicitly "disabled until the interaction model is reintroduced safely") | N/A | Live's stub means it behaves like Instant anyway today |
| Manual substitutions | `LiveMatchController.applyManualSubstitutions()` is a **stub** | N/A | Same |
| Clock | Same `resolveGameClockRulesForGame` | Same | YES |
| Stats | Same `calculateMatchPlayerStats` | Same | YES |
| Events | Same `MatchEvent` union, same producer | Same | YES |
| Persistence | Same `completeMatch`/`applyCompletedMatch` | Same | YES |

**Verdict:** substantially shared. Two confirmed gaps: (a) Live's input construction skips
per-game tactical/matchup overrides that Instant honors; (b) Live coaching interaction is
stubbed, so live user decisions currently have no effect — which paradoxically guarantees
Live≈Instant today, but means "Match UI sends valid decisions" is not yet a real capability.

---

## 6. Player Rating Authority

Three-tier model confirmed in `src/domain/player/Player.ts` / `PlayerTruthCatalog.ts`:

- **80-key `PlayerTruthRatings`** — canonical, persisted, validated 1-100 per key.
- **35-key `LegacyCanonicalPlayerRatings`** — derived via `legacyCanonicalRatingSignals()`,
  attached as non-enumerable compatibility properties.
- **7-key `LegacyPlayerRatings`** — derived from the 35-key via `legacyRatingSignals()`,
  also non-enumerable.

**Every gameplay consumer uses the 7-key legacy projection, not the 80-key Truth:**

1. `MatchPlayerProfile.createMatchPlayerProfile()` — feeds every possession-resolution
   formula (shot, turnover, rebound, assist, defensive attribution, matchups).
2. `calculatePlayerImpact()` (`TeamEvaluation.ts`) — feeds `selectStartingFive` and the
   now-inert `TeamStrength`.

**The 80→35→7 collapse is total for gameplay resolution.** No code path lets the 80-key
Truth directly drive shot/turnover/rebound/assist probability. This is explicitly
labeled `TEMPORARY_MATCH` in code and acknowledged in `ARCHITECTURE.md`'s "Player-driven
offense" section as a deliberate temporary decision, not an oversight.

No persisted "overall" exists anywhere; no 80→strength/overall conversion exists beyond
the paths above.

**Tendencies** (80-key `PlayerTruthTendencies`, 40-key catalog, 21-key legacy) follow an
identical three-tier compatibility pattern but are **not consumed by MatchEngine at all** —
zero production references inside `src/engine/match/**`. This is a second, separate
MISSING-authority gap, distinct from the ratings problem.

---

## 7. Physical Truth

Comprehensive search across `src/engine/match/**` and `src/engine/team/**` returns **zero**
production hits for height/weight/wingspan/standingReach. `ARCHITECTURE.md` states directly:
*"Height, weight, and age do not affect MatchEngine, MatchPlayerProfile, ratings, fatigue,
or team strength in this milestone"* — confirmed still true.

| Datum | In input? | Reaches engine? | Consumed? |
|---|---|---|---|
| Height/weight/wingspan/reach | Yes (`Player.bio`) | No | UI/scouting/bio-generation only |
| Speed/acceleration/strength/vertical (as rating keys) | Yes | Yes, via legacy collapse | Folded into offense/defense legacy signals, not a distinct spatial mechanic |
| Stamina/fatigue | N/A (separate mechanic) | Yes | `Fatigue.ts` is a fully live, engine-native, deterministic 0-100 transient mechanic applying a real probability penalty. Does **not** derive from `STAMINA`/`ENDURANCE` ratings — constants are universal per player. |
| Injury/availability | Yes (`InjuryRecord`) | Gates eligibility pre-match only | Engine itself has no medical knowledge — correct boundary per `ARCHITECTURE.md`. |

Fatigue is real, tested, gameplay-authoritative — the exception to an otherwise unwired
physical-data layer.

---

## 8. Lineup / Substitution Authority

**Major finding: two independent, non-communicating lineup systems.**

1. **`TeamLineup`/`world.lineupsByTeamId`** (`src/domain/tactics/TeamLineup.ts`) — canonical,
   persisted, user-editable via the Plantilla/Tactics UI. Its own docstring: *"The single
   canonical persisted match-squad lineup for a team... never a UI-local or localStorage
   concept."*
2. **`selectStartingFive`** (`src/engine/team/TeamEvaluation.ts`) — auto-pick-best-5-by-position
   using legacy `calculatePlayerImpact`, called by every match-preparation path.

**These never intersect.** `world.lineupsByTeamId` is never read by any match-preparation
code. A user who sets a custom starting five in the UI has **zero effect** on who actually
starts — the engine always overrides with its own auto-derived five. This is a concrete,
code-grounded correctness bug, independent of the ratings problem.

Bench/rotation: `RotationPlan.ts` builds a static Q1-Q4 threshold rotation from
`selectStartingFive`'s output, separate again from `TeamLineup`'s bench slots (B1-B7).
Neither drives the other.

Authority by phase:

| Phase | Authority | Correct? |
|---|---|---|
| Pre-match starters | `selectStartingFive` algorithm | **NO** — ignores user's `TeamLineup` |
| Tip-off / live possession | `MatchSessionState.activeLineups`, engine-owned | YES |
| Substitution validation | Engine `applySubstitution`, correctly checks `activeLineups`/`squads` | YES (engine-side) |
| Manual live substitutions | `applyManualSubstitutions` primitive works and is tested | **Unreachable** — `LiveMatchController` stub discards the call |
| End of period/OT | Active lineups persist across `finishPeriod`, no special handling | YES (no-op is correct here) |

---

## 9. Tactical Authority

`MatchTacticalPlan` — confirmed **REAL GAMEPLAY AUTHORITY**, wired into `stepMatchSession`:

| Field | Mechanism | Wired? |
|---|---|---|
| `pace` | `applyPaceToPossessionDuration` — shortens/lengthens possession RNG draw | YES |
| `shotProfile.{rim,midRange,threePoint}` | `applyShotProfile` — reweights shot-zone selection | YES |
| `defense.{interior,perimeter}` | `calculateTacticalDefenseModifier` — adjusts effective defense | YES |
| `featuredPlayerId` | `tacticalUsageWeight` — 1.25x usage multiplier | YES |
| `DefensiveMatchupOverride` | Consumed in `calculateDefensiveAssignments` | YES |

Live tactical changes: engine primitive `applyTacticalPlanChange` exists and is tested, but
`LiveMatchController.applyTactics()` is a stub. **Classification: engine-side REAL
AUTHORITY; application/UI-side currently STUB.**

No timeout mechanic exists anywhere (no event type, no clock-stop logic). No playcalling
beyond the 5-lever tactical plan. Matches `ARCHITECTURE.md`'s documented scope.

---

## 10. Possession / Resolution Pipeline

```
stepMatchSession()
  → applyPaceToPossessionDuration(random.nextInt(...), pace) → possessionDuration
  → [if exceeds clock] finishPeriod()
  → chooseWeighted(offensive actor by usage × tacticalUsageWeight)          [decisionRandom]
  → calculateDefensiveAssignments() → primaryDefenderId                     [pure, no RNG]
  → calculateTurnoverProbability(ballHandler, defender, fatigue)
      → choosePossessionOutcome(random)
      → branch: shootingFoul | fieldGoalAttempt | turnover
          shootingFoul: foul event → free throws (random.chance 0.75 each) → possession flips
          fieldGoalAttempt:
            → applyShotProfile(calculateShotZoneWeights(shooter), tacticalPlan)
                → chooseWeighted(zone)                                      [decisionRandom]
            → calculateShotMakeProbability(zone, shooter, defender, fatigue, tacticalDefenseModifier)
                → random.chance
            made:   assist roll [actorRandom] → shotMade event → possession flips
            missed: block roll [actorRandom] → shotMissed event
                    → calculateOffensiveReboundProbability() → random.chance → reboundType
                    → selectRebounder() [actorRandom, weighted by rebounding.impact] → rebound event
          turnover: steal roll [actorRandom] → turnover event → possession flips
  → updateSessionFatigue()                                                  [no RNG]
  → [if clock hit 0] finishPeriod() else continue loop
```

Three independent, purpose-separated RNG streams (`random`/`decisionRandom`/`actorRandom`)
are a deliberate anti-spoiler/determinism design, correctly implemented and documented in
`ARCHITECTURE.md`.

---

## 11. RNG / Determinism Audit

**No unseeded `Math.random()` calls exist anywhere in `src/` production code** — full-repo
grep found only comments documenting the prohibition, no violations. The "no Math.random()
in src/" rule appears genuinely enforced repo-wide, not just in MatchEngine.

All match RNG flows through seeded `SeededRandomSource` (Mulberry32), deterministically
keyed off `gameId`:

- `random` — sporting outcomes: `hashStringToSeed(gameId)`
- `decisionRandom` — actor/zone selection: `hashStringToSeed('match-decisions-v1:' + gameId)`
- `actorRandom` — assist/steal/block/rebounder: `hashStringToSeed('match-actors-v1:' + gameId)`
- Post-match injuries: four independent per-player streams, deterministically keyed.

**Classification: fully SEEDED, no gaps.** One non-blocking note: the seed derives purely
from `gameId` string identity rather than an explicit persisted seed field — `playUserGame.ts`
labels this "provisional until career RNG state is persisted." This does not violate the
stated determinism invariant (`input + seed + decisions → same result`) since `gameId`
effectively is the seed, but seed provenance is worth formalizing in V3.

---

## 12. Clock Authority

Single authority: `resolveGameClockRulesForGame(world, game)`, resolved once in
`createMatchSession`, giving real per-competition `periodCount`/`periodSeconds`/
`overtimeSeconds` (not a global constant — `MATCH_RULES_V2` is an explicit, documented
fallback used only for tests/legacy fixtures). No shot clock exists. UI-layer
`MatchPresentationSegment.ts` derives display clock by pure interpolation over already-
resolved event data — no independent clock authority. **No duplication found.**

---

## 13. Event Authority

One canonical discriminated-union `MatchEvent` type
(`periodStart/periodEnd/shotMade/shotMissed/turnover/foul/freeThrowMade/freeThrowMissed/
rebound/substitution/tacticalChange/gameEnd`), every variant carrying `sequence`, `period`,
`clockSecondsRemaining`, `homeScore`, `awayScore`.

| Consumer | Reads events for |
|---|---|
| `PlayerMatchStats.calculateMatchPlayerStats` | Full boxscore, pure derivation |
| `Fatigue.calculateFatigueAtEvents` | Live fatigue reconstruction for viewer display |
| `MatchCoachingState.calculateTacticalPlanAtEvents` | Tactical plan at any point |
| `MatchEngine.calculateActiveLineups` | Active five from substitution events |
| `MatchPresentationSegment`/`CourtPresentation` (UI) | Presentation only |
| `MatchStatLog` (persisted) | One frozen snapshot per completed game |

**Persistence:** `MatchEvent[]`/`MatchSimulation` are **not persisted** anywhere in
GameWorld/Save — only the already-aggregated `MatchStatLog` is. This is a deliberate,
documented decision, not an oversight.

**Is there already a single event stream?** Yes — exactly one `MatchEvent` producer, and
all derived systems (stats, fatigue-reconstruction, lineup-reconstruction, tactics-
reconstruction, court presentation) correctly derive from that same stream rather than
maintaining independent state. **No competing/duplicated event system exists.** The gap
for V3 purposes is durability (events vanish once session state is discarded), not
multiplicity.

---

## 14. Statistics Authority

**Classification: DERIVED FROM EVENTS**, cleanly, for both live and historical stats.

- Live boxscore: `calculateMatchPlayerStats(simulation, revealedEventsSubset)` — pure
  function over an explicit event-prefix parameter, engine-side contract supports
  anti-spoiler slicing correctly. (UI-layer call-site slicing itself was not exhaustively
  traced — mark as UNKNOWN at that specific layer, though the API contract is sound.)
- Historical: `createMatchStatLog` calls the same function once at completion, then
  **cross-validates** summed player points against `simulation.finalScore` before
  persisting — an enforced invariant preventing stat/score divergence at the persistence
  boundary.

No mutated-directly or independently-recomputed stat paths found. Team stats are a pure
roll-up of player stats. **No divergence risk between PBP and stats** — they share one
source array.

---

## 15. Visual / Court Authority

All of `src/ui/match/court/**` and `CourtPresentation.ts` are **DERIVED / FAKE-DECORATIVE
VISUALIZATION**, confirmed by source reading. Court `x`/`y` coordinates are synthesized from
a fixed role-position table plus a cosmetic sine-wave wobble; "focus" player is determined
by scanning backward through events. There is no real spatial/possession model underneath —
positions are not simulated, they are a decorative FM-style abstraction, consistent with
`ARCHITECTURE.md`'s explicit design statement that court coordinates are "presentation-only
UI slots... never data on Player, Team, MatchSimulation, or GameWorld."

**No gameplay decisions are made in this layer** — confirmed no calls into any
resolution/probability function from the court/UI layer. This invariant already holds
cleanly and requires no V3 change.

---

## 16. Persistence

`GameWorld.matchStatLogsByGameId` is the sole canonical persisted match artifact, written
atomically alongside game-completion in `applyCompletedMatch` (which also records
eligibility participation and triggers season finalization in the same atomic step).

**Persisted:** final score, per-player full boxscore lines, competition/season/date/game IDs.
**Not persisted:** raw `MatchEvent[]`, RNG seed/state, `MatchSimulation`/`MatchLineups`/
`MatchSquads` snapshot, mid-match session state, tactical-plan-at-each-point, fatigue
timeline. This is deliberate and documented, not an oversight — but it means **there is
currently no replay/debug capability**. A completed match cannot be reconstructed
event-by-event after the fact, only its final boxscore. `gameId` deterministically
reproduces the same seed, so a *theoretical* replay is possible if historical
roster/ratings/tactics inputs were frozen and re-supplied — but no mechanism captures
those historical inputs today, so practical replay is not actually available.

Live and Instant persist identically (both funnel through the same
`completeMatch`→`applyCompletedMatch` path). No in-place mutation of stats after creation.

---

## 17. Legacy Inventory

| Surface | Disposition | Evidence / Reason |
|---|---|---|
| `LegacyPlayerRatings` (7-key) + `legacyRatingSignals()` | **ADAPT** | Not truly legacy yet — it's the actual load-bearing gameplay input today. Cannot be removed without replacing `MatchPlayerProfile`'s construction with a direct 80-key mapping. This is the real MG4B target. |
| `LegacyCanonicalPlayerRatings` (35-key) | **ADAPT / REMOVE LATER** | Intermediate compatibility layer, not directly consumed by MatchEngine (only via the derived 7-key path); collapsible once the 7-key path is replaced. |
| `TeamStrength` / `calculatePlayerImpact` | **REMOVE LATER** (from possession-resolution surface) | Confirmed unused in `stepMatchSession`; still used for lineup/starter ranking and post-match Coach XP/Reputation — those downstream uses need re-deriving before full removal. |
| `calculateFatigueAdjustedTeamStrength` | **DEAD CODE** | Exported, tested, zero production callers. Remove or wire in. |
| `PlayerTendencies` (80/40/21-key layers) | **KEEP data model, MISSING engine wiring** | Canonical but entirely unconsumed by MatchEngine — candidate for a future milestone after the ratings-authority fix. |
| `TeamLineup`/`world.lineupsByTeamId` | **KEEP model, urgent WIRING gap** | Not legacy — actively wrong (silently ignores user data). See §8. |
| `LiveMatchController.applyTactics/applyManualSubstitutions` stubs | **KEEP stub, flag** | Explicitly documented as deliberately disabled pending "the interaction model," not abandoned. Real gap for the UI-decision invariant. |
| `MATCH_RULES_V2` prototype constants | **KEEP as documented fallback** | Explicitly scoped to legacy/test fixtures only; real games use `resolveGameClockRulesForGame`. Not a risk. |
| `docs/autopilot/PRODUCT_GUARDRAILS.md` "do not introduce" list | **STALE — needs annotation** | Every listed item is already implemented per `ARCHITECTURE.md`'s later sections and verified in code. Risk of misleading future agents who read guardrails without cross-checking `ARCHITECTURE.md`. |

---

## 18. V3 Authority Map

| Domain | Current Authority | Duplicate Authorities | V3 Target Authority |
|---|---|---|---|
| Match input | `SimulateMatchOptions`, assembled ad hoc in `playUserGame.ts` | Live vs Instant construct it via two separate code paths with minor drift (§5) | Single `CanonicalMatchInput` builder used by both |
| Player ratings (gameplay) | 7-key `LegacyPlayerRatings` via `legacyRatingSignals()` | 80-key Truth exists but is bypassed | 80-key Truth direct into `MatchPlayerProfile` |
| Physical data | None (UI/bio-gen only) | N/A | Deliberate decision needed: stays cosmetic, or gets a real hook |
| Starting five | `selectStartingFive` algorithm | `TeamLineup`/`lineupsByTeamId` (persisted, user-facing, ignored) | `TeamLineup` as source of truth; algorithm as fallback only |
| Active lineup (live) | `MatchSessionState.activeLineups`, engine-owned | None found | Same (already correct) |
| Substitutions | Engine `applySubstitution`/`applyManualSubstitutions`, correct | `LiveMatchController` stub blocks reachability | Wire the stub to the working primitive |
| Tactics | `MatchTacticalPlan`, real engine authority, persisted pre-match | `LiveMatchController.applyTactics` stub blocks live changes | Wire the stub |
| Possession | `stepMatchSession`, single engine authority | None | Same |
| Action selection | `chooseWeighted` over legacy-derived signals + tactical modifiers | None (single decisionRandom stream) | Same, once ratings fixed |
| Resolution | `ShotResolution`/`TurnoverResolution`/`ReboundResolution`/`AssistResolution`/`DefensiveAttribution`, single authority | None | Same |
| RNG | 3-stream seeded `SeededRandomSource`, deterministic by `gameId` | None; no unseeded Math.random found | Same, possibly formalize seed provenance beyond gameId-string |
| Clock | `resolveGameClockRulesForGame`, single authority | None | Same |
| Events | `MatchEvent` union, single producer | None | Same, add persistence for replay if desired |
| Statistics | `calculateMatchPlayerStats`, pure derivation from events | None | Same |
| PBP | Same event stream, UI-consumed | None | Same |
| Visual state | `CourtPresentation`/`CourtDynamicRenderer`, purely derived/decorative | None | Same (already correct) |
| Renderer | Canvas draw layer, zero gameplay logic | None | Same (already correct) |
| Persistence | `MatchStatLog` only; no event/seed/input snapshot persisted | None | Add optional event-stream/seed/input persistence if replay capability is wanted |

---

## 19. Missing Contracts

| Contract | Status | Evidence |
|---|---|---|
| `MatchRuntimeState` | EXISTS (as `MatchSessionState`) | `MatchEngine.ts:199-225`, immutable, well-structured |
| `CanonicalMatchEvent` | EXISTS (as `MatchEvent`) | `MatchEngine.ts:67-159`, single producer, no duplication |
| `MatchDecision` | PARTIAL | Substitution and tactical-change primitives exist and are engine-validated; no unified envelope type; Live application layer doesn't currently dispatch them (stubbed) |
| `MatchAction` | PARTIAL (by design) | Possession outcomes exist as a closed internal union (`PossessionOutcome`), not exposed as a UI-influenceable contract — consistent with the non-spatial, non-NBA2K design |
| `SpatialState` | MISSING (by design) | No real spatial/positional simulation exists; consistent with the stated FM-like design — not a gap unless a future milestone wants real spatial simulation |
| `PossessionState` | EXISTS (implicitly, as fields on `MatchSessionState`) | `attackingTeamId`, clock, score — fully represented, just not a separately named type |
| `PhysicalMatchState` | MISSING | Fatigue is the only live "physical" state; height/weight/wingspan/stamina-rating have no live representation |
| `TacticalMatchState` | EXISTS (as `MatchCoachingState`) | `coaching/MatchCoachingState.ts` |
| `MatchClockState` | EXISTS (implicit in `MatchSessionState` + `ResolvedGameClockRules`) | Fully represented, single authority, just not a separately named type |

---

## 20. Blockers

Real, code-confirmed blockers only:

1. **Player ratings authority gap** (§6) — 80-key Truth has zero gameplay resolution
   authority. Confirms MG4B's premise.
2. **Starting-five duplicated/broken authority** (§8) — user's `TeamLineup` is silently
   ignored; an active correctness bug affecting a shipped UI feature, independent of
   ratings.
3. **Live coaching interaction stubbed** (§5, §9) — engine primitives work and are tested,
   but the Live application layer's `applyTactics`/`applyManualSubstitutions` are no-ops.
   Blocks the "Match UI sends valid decisions" invariant in practice (though it currently
   guarantees Live≈Instant, which is not itself harmful).
4. **Live vs Instant input-construction drift** (§5) — `createLiveUserMatch` skips
   `getEffectiveTacticalPlan`/`getGamePlan` overrides that `prepareMatch` applies.
5. **Tendencies layer fully unconsumed** (§6) — canonical, persisted, zero gameplay effect.
   Separate from the ratings problem; likely its own future milestone.
6. **No match replay/debug capability** (§16) — by design, not a bug, but worth flagging
   if V3 wants it.
7. **Stale `PRODUCT_GUARDRAILS.md`** (§17) — real risk of misleading future agents who
   don't cross-check `ARCHITECTURE.md`.

Explicitly ruled out as blockers (verified absent): unseeded RNG, duplicate clock/event/
stats systems, renderer gameplay authority, mid-match GameWorld reach-through, and a
divergent Live-vs-Instant simulation core (they share it).

---

## 21. Recommended MG4B Scope

**MG4B's stated premise — wiring the 80-rating Player Truth model into the engine — is
confirmed as the correct next bottleneck**, with a scope refinement based on what this
audit found:

**Primary scope (confirmed target):** Replace
`MatchPlayerProfile.createMatchPlayerProfile()`'s `legacyRatingSignals(...)` call with
direct aggregation from the 80-key `PlayerTruthRatings` (e.g. `SHOT_TOUCH` /
`THREE_POINT_STATIC` / `CONTESTED_SHOOTING` → `offense.shooting`; `RIM_FINISHING` /
`CONTACT_FINISHING` / `DUNKING` → `offense.rimAttack`, and equivalents for
defense/rebounding). The engine's consumption contract (`MatchPlayerProfile` interface
shape) does not need to change — only its construction. Isolated to one file's internals,
low blast radius.

**Should be included in the same milestone (same root cause, found during this audit):**
- Fix `selectStartingFive`/`calculatePlayerImpact` (`TeamEvaluation.ts`) to also read from
  80-key ratings. Fixing `MatchPlayerProfile.ts` while leaving `TeamEvaluation.ts` on the
  7-key path would produce a visible inconsistency (a player who is good by 80-key Truth
  correctly resolves better shot/turnover math but is not correctly selected as a starter).
- Decide explicitly whether to retire `TeamStrength` from `SimulateMatchOptions`/
  `MatchSessionState` now that it's confirmed dead in possession math — or document why it
  stays (its Coach-XP/Reputation downstream use still needs *a* number).

**Explicitly out of MG4B scope, as separate follow-ups:**
- The `TeamLineup` disconnect (§8) — a different bug class (application wiring, not ratings
  modeling); an active correctness bug on a shipped feature, arguably deserves its own
  small milestone ahead of or alongside MG4B.
- `LiveMatchController` stub reactivation — a UX/interaction-model decision, not a ratings
  concern.
- Tendencies-layer wiring — same shape of problem as ratings but a distinct data layer;
  bundling both risks scope creep against the "keep scope narrow" rule in `AGENTS.md`.

---

*Audit performed via read-only static analysis. Zero production code changes made.*
