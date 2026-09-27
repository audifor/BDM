# BS3 Competition and Season Lifecycle

## Transition contract

Daily time remains owned by the BS1 Calendar Engine. The competition coordinator only responds to a completed, finalized edition; it never changes `currentDate` or `currentSeasonId`.

For each latest season of a competition, the coordinator now:

1. waits for completion and an immutable history record;
2. waits for required FIBA tier-movement dependencies to resolve against both historical editions;
3. derives the next participants from the source season snapshot and any resolution keyed to that source season;
4. creates a new `Season`, rolling its calendar and linked edition identifiers where configured;
5. generates the supported primary schedule and leaves prior games/history untouched;
6. runs existing annual setup hooks and returns a transient transition summary with source/target season, participant source, fixture count, linked editions, hooks and diagnostics.

`currentSeasonId` remains a gameplay/UI selection pointer. Per-competition latest editions and their season dates remain authoritative for lifecycle work. No daily orchestration path was added.

## Ecosystems supported

The matrix in [BS3_COMPETITION_LIFECYCLE_MATRIX.md](./BS3_COMPETITION_LIFECYCLE_MATRIX.md) classifies each family. Repeated primary seasons are supported for valid FIBA-like round-robin leagues, NBA-like closed leagues and NCAA-like leagues with valid populated conference snapshots. Tier movement waits until both editions have history and the resolution exists, then both divisions roll using the resolution keyed to those historical seasons.

## NCAA-like continuation

The prior coordinator rejected every NCAA-like season. It now supports a season when at least two participants belong to at least two populated conferences. The next `Season` carries a new conference-membership snapshot whose memberships point to the new season ID; the old snapshot is unchanged. `generateNcaaLikeSchedule` then generates that edition's conference and non-conference games. Missing or malformed conference membership remains unsupported and continues to produce the BS2 blocking lifecycle candidate.

NCAA annual setup calls existing idempotent rules/profile initializers for eligibility, academics, NIL, boosters and enforcement. Eligibility participation is consumed by `finalizeSeason`; BS3 does not reset eligibility years or academic standing because the current domain has no annual reset rule. It also does not add scholarships, redshirting, portal or other NCAA rules.

## Recruiting rollover and player identity

Every generated NCAA season receives one recruiting cycle through the existing `initializeRecruitingCycle` operation. Its deterministic key includes the ecosystem and source season, and initialization is idempotent. When a source edition's successor is materialized, the cycle's `targetSeasonId` and any existing signings that still point at the `${sourceSeasonId}:next` placeholder are bound to the actual successor season ID. This lets the existing daily arrival hook recognize the class when `currentSeasonId` reaches that season.

BS0's old comments described duplicate recruit-player IDs in some date windows. Current generation constructs IDs as `recruit:${cycle.id}:${poolIndex}` and derives each cycle ID from its unique source season; a focused two-cycle regression test confirms deterministic IDs remain distinct. A targeted open-window date simulation did not reproduce the reported exception. The old comments have been corrected; the BS0 report is treated as stale evidence rather than a confirmed current collision. Random IDs were not introduced.

## FIBA-like and promotion/relegation

Existing FIBA round-robin continuation, calendar derivation and source history remain intact. Participant derivation consumes `Season.participantTeamIds` when present and applies only promotion/relegation resolutions whose source season ID matches that edition. The resolver records movement after both linked seasons have history. To avoid losing a late resolution, the lifecycle coordinator defers either tier's rollover until both latest tier editions are finalized and the matching resolution exists. The resulting new seasons use the historical movement output; source participants, games, standings and history remain unchanged.

## NBA-like continuation

The closed league uses the existing participant snapshot, year-shift/calendar derivation and round-robin schedule. Draft creation remains owned by source-season finalization and retains its existing once-per-season key; selections and rookie contract behavior remain with their current Draft/Salary boundaries. Salary-cap rules continue to resolve from the date/season context already used by those systems. BS3 does not retire players or create a population controller, so repeated seasons can accumulate rosters/prospects; population balancing is a BS15/BS22 concern.

## Dependent competitions and World DB

Linked editions are discovered through the primary season's `specialCompetitionWindows`; their next edition IDs and calendar windows are rolled atomically with the primary. Repeating a rollover for the same completed source returns the existing successor set without creating duplicate seasons or schedules. The primary's mutable competition list is not used as historical qualification truth.

For a linked cup whose format declares `RANK_BASED` selection, `source_competition_season_id`, `reference_point` (currently `AFTER_MATCHDAY_N`), and rank bounds are authoritative. The engine finds that exact source Season edition, waits until every scheduled game in the configured matchday range is complete, derives standings from those games, and selects the configured ranks. It does not use the mutable Competition membership list as a fallback. Until qualification is ready the cup stays non-playable and its postseason state reports `QUALIFICATION_PENDING`. Once ready, the existing single-elimination bracket engine updates the cup Season participant snapshot and materializes the bracket's next fixtures using the cup's declared nodes, neutral-site rule and existing season calendar windows. These are ordinary playable Games linked to the successor cup Season.

Missing source editions, absent regular-season stages, invalid team/rank bounds, or structurally incomplete scheduled matchdays return `INVALID_QUALIFICATION` in the derived postseason lifecycle diagnostic and leave the cup without a bracket. A valid source whose scheduled games or reference matchday have not completed reports `QUALIFICATION_PENDING`. No teams or games are invented to recover invalid configuration. This support covers the currently represented rank-based, eight-entry single-game knockout path; other selection methods and unsupported knockout shapes remain unsupported until their owning competition-format engine supports them.

World DB keeps source competition-season IDs on the season format, and the planner binds loaded source fixture IDs to runtime games. Finalizing a loaded edition releases that edition from active runtime planning while old game/fixture bindings and season history remain. BS3 rolls the local successor identifiers and never copies or duplicates old external fixtures. It does not fetch external fixture data for an unprovided future World DB edition; new source editions must pass through the existing World DB materialization boundary. Generated schedules for non-linked primary competitions remain deterministic local schedules.

## History, results and breakpoints

Creating a next edition appends new seasons and games. It does not rewrite old games, match logs, season history, season participant snapshots or promotion/relegation resolutions. A successful transition result is transient and reports source/target IDs, competition, participant derivation, fixture count, linked editions and executed hooks; it is not persisted as duplicate derived history.

After valid NCAA support is added, its completed season no longer classifies as unsupported and no `unsupportedCompetitionLifecycle` BS2 candidate is emitted. Fewer than two participants or invalid NCAA conference configuration remains `UNSUPPORTED_FUTURE_LIFECYCLE` and remains blocking. Other integrity/lifecycle breakpoints are unchanged.

## Remaining boundaries

- **BS4:** repair of malformed memberships, impossible configurations or missing schedules is not included. BS3 preserves the existing blocking path rather than fabricating teams or games.
- **BS15:** retirement, newgens, youth systems, player population balancing and general roster renewal are not included.
- **BS22:** long-horizon certification and multi-decade population/finance/performance risks are not included. The existing 20/25-season World DB tests were not run for BS3.
- Linked cups using qualification methods other than the supported `RANK_BASED` path, or knockout formats outside the supported single-game bracket shape, still need their format-owned materialization.
- External World DB future editions still require source data through the existing World DB materialization boundary; BS3 does not fetch or invent those fixtures.
