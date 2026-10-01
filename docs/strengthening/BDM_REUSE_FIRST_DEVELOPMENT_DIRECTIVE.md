# BDM Reuse-First Development Directive

This is the permanent preflight required for every future BDM strengthening milestone. A milestone may not claim a capability is missing until this check is complete.

## PHASE 0 · MASTER CAPABILITY REUSE CHECK

Before implementation, include a short, evidence-linked section that:

1. Consults `BDM_MASTER_CAPABILITY_REGISTRY.md` for the capability and adjacent systems.
2. Inspects relevant historical specifications, implementation reports, tests, Git history/branches and current source; do not inspect only the visible macroarea.
3. Names the canonical domain authority, engine/mutation boundary, application action boundary and persisted source.
4. Identifies capabilities that are hidden, dormant, disconnected, produced-but-unconsumed, or calculated then discarded.
5. Identifies reusable legacy UI, workflows, tests, calculations and data, and states which are superseded or unsafe to revive.
6. Identifies specified-but-unimplemented work and preserves every unresolved `DECIDED`, `TO DECIDE`, `POR DECIDIR` boundary without converting proposals into rules.
7. States which authorities must not be duplicated and how the milestone will preserve them.
8. States exactly what existing work will be **CONNECTED**.
9. States exactly what existing work will be **SURFACED** to the user or AI actor.
10. States what is **ACTUALLY NEW**, with evidence that no suitable current or historical capability already exists.

If evidence is insufficient, record `UNKNOWN` and name the inspection needed. Do not label the capability missing based only on an absent UI route or filename.

## Gameplay definition of DONE

For each applicable dimension, the milestone records completion evidence or explicitly defers it:

- Truth / canonical authority
- Lifecycle and cadence
- AI and other actor perception, decision and action
- User visibility and user agency
- Cross-system effects and consequence
- Events/history
- Persistence and migration
- Breakpoints for user-owned pending actions
- Observability / diagnostics
- Long-horizon coherence
- No duplicate authority
- No valuable existing capability left disconnected without explicit deferral

`N/A` is valid when justified. A domain model plus engine plus Save plus tests alone does not prove a gameplay system is complete. Completion also does not require every possible extension to be implemented; omissions must be explicit and respect product scope.

## Review and evidence

- Cite code paths, tests, certifications, Save schemas, user surfaces, and historical references where they support a claim.
- Use focused tests only to verify a disputed execution path; don't rerun historical certification suites without need.
- Never change production behavior as part of a reuse audit.
- Keep MatchEngine vs MatchViewer, Engine vs UI state, truth vs knowledge, and world state vs Save migration boundaries explicit.
- Reconcile this registry when a milestone changes a capability's authority, persistence, lifecycle, actor usage or manifestation.
