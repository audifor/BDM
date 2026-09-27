# BS4 · Self-Healing World

## Repair policy

BS4 repairs legitimate, evidenced gameplay states at bounded lifecycle boundaries. It does not catch arbitrary exceptions or select an authority when canonical state conflicts. Each attempt returns a transient `WorldRepairReport` with a classification (`RECOVERABLE`, `UNRECOVERABLE`, `NOT_APPLICABLE`, or `ALREADY_VALID`), source, target, before/after summaries, action, diagnostics, mutation flag, and whether user action remains necessary. No duplicate repair history is persisted.

## Roster and contract integrity

`Team.rosterPlayerIds` remains the canonical roster. Active `PlayerContract.teamId` is checked against it. Matching state is valid. Mismatches and multiple claims are unrecoverable unless the transaction history proves the exact completed release/expiry and subsequent signing. An active contract without roster membership is restored only when its exact `signedFreeAgent` transaction proves the team and contract. A professional roster without an active or scheduled contract is diagnosed; BS4 does not invent a contract. NCAA-like contexts without a professional contract requirement are not applicable. A player in multiple rosters remains a hard GameWorld invariant failure.

## Minimum roster repair

The existing minimum playable roster is five players. At supported repair boundaries, AI teams may sign same-gender free agents selected by existing valuation and deterministic salary/value/player-ID ordering, subject to existing affordability rules. Repair stops at five and reports unresolved team IDs when no legal candidate exists. User teams are never auto-signed; they receive a manual-action report and BS2 owns the breakpoint classification. No players are fabricated.

## Lineups

Before a match, saved starters unavailable through the existing roster/eligibility/injury rules are replaced only in the affected slots. Available saved starters are preserved; replacements use position first, then existing player-impact ranking, then player ID. A default lineup uses the existing deterministic lineup authority. Too few eligible players is an error; malformed/corrupt lineup data is not swallowed. Lineup recovery is transient for match preparation. Contract expiry, release, ecosystem movement, and trades clear stale saved assignments.

## Other domains

- **Registration and eligibility:** there is no separate persisted registration projection to rebuild. Competition availability is derived from canonical roster and existing eligibility rules. BS4 does not override suspensions, NCAA restrictions, roster limits, or foreign-player rules.
- **Staff:** no existing deterministic AI staff-hiring repair policy was found. Vacancies remain owned by staff/gameplay systems; BS4 does not create or move staff.
- **Schedule and fixtures:** incomplete or conflicting schedules cannot be regenerated safely without authoritative format/source inputs. BS4 does not shift dates, delete games, or invent external fixtures. BS3 remains the competition lifecycle authority.
- **Venue and facilities:** no canonical fixture venue fallback or automatic facilities maintenance rule exists. No venues/projects are created.
- **Finance:** no canonical automatic emergency response was found. BS4 does not inject money, borrow, forgive debt, or rewrite contracts.
- **Competition:** BS3 owns season and linked-cup lifecycle. BS4 does not synthesize participants, qualification rules, external World DB data, or lifecycle artifacts outside existing idempotent authority.

## Lifecycle and breakpoints

The repair coordinator dispatches to domain-owned roster/contract and AI-roster strategies; it does not own their business rules. It runs for teams with matches before match validity is required, after daily contract/roster transitions when affected teams can be identified, and after season contract reconciliation. CalendarEngine remains BS1's phase-order authority. Repair reports are returned transiently in day/season transition results and included in lifecycle diagnostics. BS2 remains the only breakpoint authority: successful repair removes the issue before breakpoint evaluation; unresolved user roster shortages are surfaced through the supported Market action path, while unrecoverable integrity failures remain blocking.

## Unresolved gaps

Automatic registration, staff, schedule, venue/facilities, and finance repairs are not applicable with today's domain authority. AI roster repair can remain unresolved when there is no affordable same-gender free agent. User roster repair requires the user to sign. Ambiguous roster/contract claims and malformed lineups fail safely rather than being masked.
