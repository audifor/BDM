# BS19 HRPG Core — implementation and certification

This is the integrated engine tranche requested on 2026-10-18. It does not certify
a complete RPG product or a green global test suite. Courtside is outside scope.

## Base and integration boundary

Base: PR #153, `b05c890f99a35b947fb59a98d4f5a758563fa6bc`.
GitHub inspection confirmed #142–153 are OPEN, and each head is an ancestor of
this integration branch. `origin/main` is an ancestor too. No foreign PR was
merged, rewritten or closed. The user's dirty Courtside checkout remains separate.

Branch: `integration/bs19-hrpg-core-20261018`.
One atomic implementation commit, one integration PR against the #153 branch.

## Implemented architecture

`Domain/hrpg` contains JSON-safe source references, individual observations and
minimal situation lifecycle records. It contains no personality, money, fit,
relationship score, sporting outcome or alternative calendar. Person identity is
resolved from real role profiles and canonical Person profile references, including
legacy Staff profiles without an inline `personId`.

`Engine/hrpg/HumanSimulationEngine` admits verified source references against
code-owned content rules, composes context on demand, validates actors/actions,
resolves common actions and delegates capability commands through injected
authorities. A new content rule can reuse the same actions, consequences,
persistence and temporal continuation without a new scenario resolver.

`Application/hrpg` owns source adapters and the shipped rule catalogue. It connects
live Inbox, completed MatchStatLog participation, verified individual Training,
StaffCareerRequest, StaffPoliticalAction, Coach Finance movements, actual Coach job
offers, effective player contracts, Governance decision events and owner-perspective
promise memories. A completed BACKGROUND match is a legitimate canonical result;
HRPG reads the applied result and logged participation, never invents possession
evidence or sporting performance.

The application day runs HRPG after the day's signing, governance, repairs and media
steps, before breakpoint evaluation and atomic publication. Both synchronous and
asynchronous day drivers use this shared process. Coach creation initializes live
legacy situations. `gameStore.decideUserHumanSituation` is the common player command;
existing BS19 store commands use `resolveHumanCompatibility` and preserve their
original result/rejection envelopes. No view or Courtside file is changed.

## Authority reuse and operational behavior

- P0–P8 remain source-backed compatibility examples, including debt, meetings,
  declined requests, dated promises, grievance/repair, real lobbying and P8 training
  feedback. Their original consequence authorities remain in place. P7's existing
  politics/cohesion/development chain is preserved; HRPG adds no sporting bonus.
- Career accepts/declines actual offers through Coach Career, preserving identity,
  employment, history and salary consequences. Promises use the real Staff request
  and obligation authority. A promise never grants an assignment or promotion.
- Generic discussion uses directed RelationshipEvents, personality-shaped morale,
  the existing memory interpretation/decay and the official TEAM_MEETING experience
  with verified age. PERSON50 compatibility shaping remains solely in the canonical
  relationship boundary. Coach/Staff personality projections stay synchronized.
- Staff human responses extend the existing Staff AI authority. They consider real
  personality, human state, directed trust, semantic compatibility and relevant
  memories. Existing professional autonomy still owns requests, offers and departures.
- NPCs decide against one immutable appraisal snapshot per wave; actions revalidate
  the latest world before execution. They cannot react instantly to another NPC's
  newly private thoughts. Processing uses two finite consequence-admission waves.
  NPC memories are committed through one canonical Memory Engine batch per wave,
  with observer-semantic deduplication and relationship impacts applied once;
  they do not each rescan and reconstruct the lifetime memory collection.
- A source fact, individual awareness and an attributed claim are separate. Rumours
  cannot mutate source truth or become verified reports. Only real coworkers can
  currently communicate through this API. Public availability is queried separately
  from an individual's explicit public observation. Merely being public does not
  grant every NPC awareness.
  Recipients can reflect autonomously on an attributed report/rumour, remembering
  its uncertainty rather than silently acquiring the underlying private truth.
- Continuity queries combine known source references and canonical owner memories.
  Promise creation, breach and repair produce development, crisis and resolution
  beats from actual evidence. Related situations can coexist. No parallel mutable
  narrative history or prescribed escalation script is introduced.
- Generic reflection can schedule one dated aftermath review. The review records a
  distinct later memory once. Canonical monthly memory decay and reinforcement
  queries remain authoritative. Existing legacy opportunities acquire no invented
  deadline. Real promises and offer validity retain their own authorities.

## Persistence and growth

Save V4 adds optional `humanSimulation`. Older saves start with no inferred HRPG
history. Current unresolved opportunities are handed off when the game resumes.
Loading validates keys, source references, Person/role links, dates, knowledge basis,
ancestry and configured limits. Code, actions, context projections and indexes are
never serialized. Active state, subjective claims, resolved actions and parent links
round-trip exactly.

Changed source collections are compared once per transition, never once per NPC;
unchanged collections are skipped. Effective contract/Governance dates use cached
date indexes. Finance movement and person/communication queries use collection
indexes. This is not an O(1) event bus: comparing a changed historical collection
still walks that collection. A large-world production benchmark remains necessary.

Limits: four active situations per actor, 4,096 globally, 32 observers/participants
per source and one aftermath level. Generic categories admit at most one episode
per actor/month. Terminal runtime records and their observations retire after 90
days, retaining ancestors until descendants retire; historical canonical memories
and source records are preserved. Skipped monthly facts do not duplicate knowledge.
Awareness supported by an owner's canonical HRPG memories is reconstructed even
after the runtime observation retires; remembered rumours retain their basis.
Capacity suppression is exposed in daily diagnostics and never deletes source facts.

## Technical validation

Certification commands and final results are recorded in the integration PR.
Final local focused results: 161 TypeScript tests passed across 19 files (72 core,
legacy and training; 51 politics/memory; 33 persistence/career; 5 targeted WorldDB
cases). The 19 new HRPG tests and one new Memory batch test are included in that total. The targeted WorldDB run
explicitly skipped 32 unrelated cases; it is not a full WorldDB certification.
Typecheck, production build, Rust format/check and all 14 native Rust unit tests
passed. The first native test link exhausted disk space; deleting two generated
build artifacts and retrying produced a successful `cargo test` exit code of zero.
No Math.random call or production React/Zustand/Tauri import was found in the
required boundaries. The full global run was interrupted after observed failures
and is not counted as passed or complete.

The focused suite covers real match/training/finance/career sources, private versus
public awareness, false rumours, valid/invalid commands, NPC choices, directed
relationships, PERSON50, promise-breach continuity, delayed consequences, exact
Save V4, legacy loading, real application day advancement and deterministic replay.
An additional five-calendar-year test processes actual Finance operations and
bounded HRPG histories. It is not five complete sporting seasons or Y30 gameplay.

The global suite was also attempted with its ordinary timeout. Known failures
already reproduced at the unmodified #153 base include:

- `StaffScreen.test.tsx`, “Dynamics works with employed Staff”: 5,000 ms timeout
  at line 808 on both base and integration branch.
- `MatchSession.test.ts`, competition clock rules at line 1074: expected object
  omits the existing `foulRules` field; base result is 65 passed / 1 failed.

These are not repaired by changing unrelated sporting rules, Courtside, or removing
coverage. No global PASS is claimed. A full-suite failure is not concealed by the
separate focused CI workflow.

## Verified limits and work remaining

This first core does not implement every operation of personal life or B11's full
economy: family/households, crime/enforcement, free-text conversation interpretation,
media leak campaigns, access beyond current coworkers and new commercial negotiations
remain outside the shipped capabilities. It does not infer salaries, severance,
offers, creditors, biographies, injuries or historical encounters.

Some sources currently support reflection/continuity rather than a new business
operation (Governance and effective player contracts, for example). Their own
existing decision APIs remain authoritative. The source/content catalogue is
extensible; it is not an assertion that every domain has exhaustive human content.

Not yet certified: all global tests, thousands of actors over decades, full sporting
season rollover with HRPG for 30 years, complete human behavior/content coverage,
Tauri packaged-app runtime and a playable Courtside presentation. The latter is
deliberately deferred by the owner's “NO TOCAR COURTSIDE” directive.

Integration risk: this PR depends on the still-open cumulative #142–153 stack and
its canonical PERSON50/save changes. Merging only the new commit onto an older
`main` without those dependencies is unsupported. No source-of-truth PROPOSAL or
pending product choice is promoted to DECIDED by this implementation.
