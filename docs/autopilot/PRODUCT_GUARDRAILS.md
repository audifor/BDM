# BDM Autopilot Product Guardrails

This file captures only the project decisions required for the current autonomous tranche. It does not replace a fuller MASTER PROJECT PROMPT / SOURCE OF TRUTH if one exists in the repository.

## Canonical direction

- BDM is a deep basketball manager plus coach RPG plus persistent world, with balanced emphasis between those pillars.
- The universe is fictitious and unified.
- Male and female basketball use the same architecture.
- A career is intended to move freely between FIBA-like, NCAA-like and NBA-like ecosystems.
- A future youth/high-school-like layer must remain architecturally possible.
- Initial career mode is Football Manager-like.
- Long-term simulation should be very detailed, but built in layers rather than all at once.

## Match experience

- MatchEngine and MatchViewer are separate.
- The user watches and manages a match through a Football Manager-like presentation.
- Tokens/cards may represent players.
- Playback supports pause and multiple speeds.
- The user does not directly control players as in NBA 2K.

## Current simulation decisions

- Player currently has one primary position: PG, SG, SF, PF or C.
- Player source ratings currently are:
  - finishing
  - shooting
  - playmaking
  - perimeterDefense
  - interiorDefense
  - rebounding
  - athleticism
- No persisted overall exists.
- PlayerImpact is derived.
- Starting Five is derived.
- TeamStrength is derived from the Starting Five.
- MatchSimulation lineups are transient.
- Current match timing is provisional 4 x 10 minutes, with 5-minute overtime.
- Current home advantage and current rating formulas are prototype mechanics, not universal competition rules.
- MatchEngine currently simulates possessions.
- Sporting events currently include PlayerId attribution, but individual ratings do not yet alter the outcome of a possession beyond their indirect effect through TeamStrength.

## Do not introduce during this tranche unless the active milestone explicitly says so

- persisted overall
- secondary positions
- potential
- player development
- contracts/salaries
- injuries
- scouting
- substitutions/rotations
- fatigue
- tactical systems
- coach RPG systems
- competition ecosystem expansion
- save migrations

## Human checkpoint

The autonomous tranche stops after milestone 019. Rotations and fatigue require an architecture/product checkpoint before implementation.
