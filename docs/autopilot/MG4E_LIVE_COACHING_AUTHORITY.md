# MG4E · Live Coaching Authority

## Scope

MG4E enables live tactical plan changes and manual substitutions through the existing match runtime. It does not add a coaching subsystem or change the MatchViewer interaction model.

## Runtime authority

`LiveMatchController` owns the transient `MatchSession` for a live game. `applyTactics` delegates to `applyTacticalPlanChange`, which validates the team and plan against the session squad, updates `coachingState`, and records a `tacticalChange` event. The next `stepMatchSession` reads that current coaching state for possession pace, shot selection, defense, and featured-player usage.

`applyManualSubstitutions` delegates to the existing batch helper. The helper validates the whole batch against a draft active lineup and squad before applying any substitution, so an invalid batch leaves the controller session unchanged. Valid changes update the runtime active five and emit manual substitution events. The next gameplay step consumes the session's updated active lineups. `replacementCandidates` now exposes eligible squad members who are not in the active five, and returns no candidates for an invalid team, inactive outgoing player, or completed game.

## Validation and determinism

Invalid tactical plans and substitution batches are rejected by the existing engine validators without mutating the runtime state. Tactics and substitutions do not consume random values or advance game time. Event sequence changes are deterministic, and the focused controller tests compare identical tactical commands across replay sessions.

Automatic rotation scheduling remains in place and continues to run at its configured step thresholds. Live coaching changes are synchronous between simulation steps. Instant match preparation, persisted world data, and MatchViewer presentation are unchanged.

## Verification

`LiveMatchController.test.ts` covers accepted tactical changes and their next-step effect, invalid tactics without mutation, valid substitution and active-five use on the next gameplay step, and atomic rejection of an invalid substitution batch.
