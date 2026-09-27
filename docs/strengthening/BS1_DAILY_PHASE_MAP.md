# BS1 · Daily Phase Map

Application pre-transition rows are `PRE_ADVANCE_VALIDATION` and `MATCH_RESOLUTION`. Calendar Engine daily phases run from `DATE_ADVANCE` through `EVENT_COLLECTION`. Application post-transition rows are `SCHEDULE_INTEGRITY` through `DAY_COMPLETE`. The two World DB phases run only on that path. Calendar Engine phases use stable IDs and preserve the existing subsystem call order. A skipped cadence phase is still traced with `ran: false` and a reason. Timing is optional diagnostic evidence and does not affect simulation.

| Phase | Owner | Cadence | Mutates | Can fail | Can create breakpoint | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `PRE_ADVANCE_VALIDATION` | Application + BS2 | Each day command | No | Yes; returns structured prevention | No | BS2 stops unresolved required/blocking candidates before mutation. |
| `MATCH_RESOLUTION` | Match application boundary | If scheduled games remain today | Yes | Yes; structured technical failure | Possible through result state; BS2 decides | Existing application match handling, before date advance. |
| `DATE_ADVANCE` | Calendar Engine | Every day | Yes | Yes; structured failure | Possible through date-driven state; BS2 decides | Advances exactly one date; retains current-season pointer migration check. |
| `ANNUAL_PLAYER_DEVELOPMENT` | Development Engine | 1 July, once per cycle | Yes | Yes; structured failure | Possible; BS2 decides | Existing annual player development. |
| `CAREER_FATIGUE_RECOVERY` | Training Engine | Every day | Yes | Yes; structured failure | Possible; BS2 decides | Matches pre-BS1 source order. |
| `EXPIRED_CONTRACT_RECONCILIATION` | Market Engine | Every day | Yes | Yes; structured failure | Possible; BS2 decides | Runs after fatigue recovery and before scheduled training, preserving pre-BS1 source order. |
| `TRAINING` | Scheduled Training Engine | Every day | Yes | Yes; structured failure | Possible; BS2 decides | Existing scheduled sessions remain the automatic training authority. |
| `RECRUITING` | Recruiting Engine | Every day | Yes | Yes; structured failure | Possible; BS2 decides | Pool, commitment, and AI lifecycle checks. |
| `ACADEMICS` | Academic Engine | 1 January and 1 July | Yes | Yes; structured failure | Possible; BS2 decides | Academic support then term resolution. |
| `NIL_LIFECYCLE` | NIL Engine | Every day | Yes | Yes; structured failure | Possible; BS2 decides | Existing expiry and lifecycle checks. |
| `MONTHLY_NIL_AUTONOMY` | NIL Engine | First of month | Yes | Yes; structured failure | Possible; BS2 decides | Existing NIL AI progression. |
| `MONTHLY_BOOSTER_AUTONOMY` | Booster Engine | First of month | Yes | Yes; structured failure | Possible; BS2 decides | Existing booster progression. |
| `COACH_FINANCE` | Coach Finance Engine | First of month | Yes | Yes; structured failure | Possible; BS2 decides | Personal coach finance, distinct from Club Finance V2. |
| `MEMORY_DECAY` | Memory Engine | First of month | Yes | Yes; structured failure | Possible; BS2 decides | Existing coach memory decay. |
| `ENFORCEMENT` | Enforcement Engine | Every day | Yes | Yes; structured failure | Possible; BS2 decides | Existing enforcement lifecycle. |
| `SCOUTING_INTAKE` | Scouting + Opposition Scouting Engines | Every day | Yes | Yes; structured failure | Possible; BS2 decides | Delegated, advisory, and opposition report intake in existing nested order. |
| `MEDICAL_AND_ROSTER_ADVISORIES` | Medical + Basketball Operations Engines | Every day | Yes | Yes; structured failure | Possible; BS2 decides | Medical advisories then basketball-operations advisories. |
| `SCOUTING_ASSIGNMENTS` | Scouting Engine | Every day | Yes | Yes; structured failure | Possible; BS2 decides | Existing scouting assignment progression. |
| `DRAFT` | Draft Engine | Every day | Yes | Yes; structured failure | Possible; BS2 decides | Opens eligible drafts and progresses AI picks/advisories. |
| `STAFF_HUMAN_STATE` | Staff Human State Pipeline | Every day | Yes | Yes; structured failure | Possible; BS2 decides | Refreshes staff human-state projection. |
| `STAFF_CONFLICTS` | Staff Conflict Engine | Every day | Yes | Yes; structured failure | Possible; BS2 decides | Existing conflict progression. |
| `STAFF_CULTURE_COHESION` | Staff Culture and Cohesion Pipeline | Every day | Yes | Yes; structured failure | Possible; BS2 decides | Existing culture and cohesion progression. |
| `STAFF_POLITICAL_CASES` | Staff Political Case Engine | Every day | Yes | Yes; structured failure | Possible; BS2 decides | Existing political case progression. |
| `STAFF_APPRAISAL` | Staff Human State Pipeline | Every day | Yes | Yes; structured failure | Possible; BS2 decides | Existing autonomy appraisal checks. |
| `STAFF_CAREER_AUTONOMY` | Staff Career Autonomy | Every day | Yes | Yes; structured failure | Possible; BS2 decides | Career market, autonomous offers, then resignations. |
| `FACILITY_CONDITION` | Facilities Deterioration Engine | First of month | Yes, when condition changes | Yes; structured failure | Possible; BS2 decides | Latest canonical component condition record through checkpoint; diagnostics include condition changes/needs. |
| `CLUB_FINANCE_V2` | Finance V2 | Not scheduled | No | No; skipped as unsupported automatic cadence | No | No generic calendar processor; phase explains required explicit inputs. |
| `GOVERNANCE` | Governance | Not scheduled | No | No; skipped as unsupported automatic cadence | No | No automatic meeting/decision resolver; no governance state is created or resolved. |
| `EVENT_COLLECTION` | Daily lifecycle coordinator | Every day | No | No | No | Collects transient phase diagnostics; persists no event stream. |
| `SCHEDULE_INTEGRITY` | Application boundary | After Calendar Engine phases | No | Yes; `INVARIANT_VIOLATION` | No | Rejects a scheduled game dated before the new current date. |
| `PRE_MATCH_MEDIA` | Media Application/Engine | When the user's next game is today | Yes, if opportunity is created | Yes; structured failure | Possible; BS2 decides | Existing pre-match media operation. |
| `BREAKPOINT_EVALUATION` | BS2 | After successful processing | No | Yes; structured failure | Projects candidates; does not create them | Sole before/after stop projection. |
| `DAY_COMPLETE` | Application boundary | Each successful day | No | No | No | Marks the successful application transition. |
| `WORLD_DB_REMATERIALIZATION` | World DB materializer | After successful World DB day | Yes, if fixture mapping changes | Yes; structured failure | Possible from resulting fixtures; BS2 reprojects | Reconciles external physical fixtures after shared lifecycle. |
| `WORLD_DB_BREAKPOINT_RECONCILIATION` | BS2 + World DB application boundary | After World DB rematerialization | No | Yes; structured failure | Projects candidates; does not create them | Ensures the outcome describes the final returned World DB world. |

Only BS2 classifies and orders candidates. “Possible” means an owning state transition may expose a new candidate when BS2 evaluates the resulting world; no phase performs breakpoint classification itself.
