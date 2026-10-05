# BS13B · Responsibility & Delegation Convergence

## 1. Baseline

BS13A completed at `f4370be` on `bdm-stage2-bs13a-staff-intelligence-audit`. BS13B preserves
the generic Responsibility authority and resolves the six registered kinds that had no live
end-to-end consumer. The row-by-row trace and rationale are in the
[decision register](BS13B_RESPONSIBILITY_DECISION_REGISTER.md).

## 2. Six-responsibility audit

All six definitions, eligible roles, modes, capacity costs, consumers, UI exposure, persistence,
duplication risks, and target owners were reviewed. Registry presence alone did not authorize
gameplay.

## 3. Decision register

The register assigns exactly one status to each kind. No kind remains ambiguous or merely
"disconnected" in the active UI.

## 4. Connected responsibilities

None of the six is connected in BS13B. Existing connected Training, Medical, scouting, market,
trade, recruiting, and advisory responsibility paths continue unchanged.

## 5. Retired responsibilities

`manageRecovery`, `recommendWorkloadChange`, and `rotationPlanning` are retired. Their declarations
remain in the canonical registry to parse old saves, but cannot be assigned, resolved, charged to
workload, created in new-world enrichment, or shown as active Staff controls.

## 6. Deferred responsibilities

`defensiveGamePlan`, `offensivePreparation`, and `matchupRecommendation` are deferred to **BS13C ·
Staff Decision Intelligence**, coordinating with Tactics and Rotation as target owners. There is no
current Staff advisory acceptance path for them.

## 7. Rationale for each

- `manageRecovery`: Training selects scheduled recovery; Medical owns clinical treatment, injury
  recovery, risk, and RTP. A second recovery responsibility duplicates both domains.
- `recommendWorkloadChange`: Training planning already considers fatigue, schedule congestion and
  session load. This kind has no canonical acceptance seam for schedule or load changes.
- `defensiveGamePlan`: Tactics owns pre-match state, but there is no defined Staff recommendation
  contract or acceptance route.
- `offensivePreparation`: same boundary as defense; no live Staff consumer or accepted-output path.
- `rotationPlanning`: direct Coach/Rotation pathways already own rotation, while this declaration is
  Head-Coach-only and has no caller.
- `matchupRecommendation`: a concept exists in `TeamGamePlan`, but there is no safe accepted Staff
  recommendation path. It must not assign a live matchup by implication.

## 8. Delegation behavior

The generic `resolveDelegatedResponsibility` gate remains canonical for connected kinds. A valid
holder and a calling consumer are both required; a registry row does not schedule work.

## 9. Advisory behavior

Existing advisory consumers continue to record unapplied outcomes and rely on their canonical
acceptance services. No new tactical advice is generated or auto-applied.

## 10. Vacancy behavior

Vacant or unresolved connected assignments keep their target-domain fallback. No hiring or
universal responsibility-repair loop is introduced.

## 11. AI-club behavior

No universal Staff AI or world-wide Staff scan was added. Domain-specific cadence remains unchanged.
No AI processing changes Responsibility ownership for the user club.

## 12. User-club behavior

No automatic reassignment was added. Inactive responsibility kinds cannot be assigned through the
Staff application service. Existing user choices on connected kinds remain user-controlled.

## 13. Workload

`calculateStaffWorkload` remains the single derived workload authority. Inert legacy rows for
retired/deferred kinds no longer add capacity cost.

## 14. Quality

Connected consumers continue to use existing quality functions and context. No Staff overall score,
new quality formula, hidden decision score, or progression was added.

## 15. Training boundary

Training retains session planning, recovery module selection, load and fatigue consequences.
Staff does not write Player fatigue from a recommendation.

## 16. Medical boundary

Medical retains injury, treatment and RTP transitions. `manageRecovery` does not clear injuries or
duplicate clinical recommendations.

## 17. Tactics boundary

Tactics retains canonical plans and game-specific tactical state. Deferred Staff kinds do not create
a second tactics model or mutate target state.

## 18. Rotation boundary

Direct Coach/Rotation pathways remain responsible for lineup and rotation state. The redundant
generic `rotationPlanning` declaration is retired.

## 19. MatchEngine boundary

No MatchEngine code or live possession behavior changed. Deferred tactical responsibilities do not
select live coverages, player actions, or matchups.

## 20. Persistence

No persisted shape changed. Existing rows are retained and validated as before, and inactive kinds
remain readable for compatibility. New worlds omit inactive kinds; old rows are inert rather than
deleted. Save code was not changed.

## 21. UI

The Staff Responsibilities surface now lists only connected registry kinds. It is not redesigned;
inactive definitions remain in the registry for compatibility and documentation.

## 22. P0

No P0 finding identified.

## 23. P1

Coach professional profile values still have the unresolved `StaffPerson.professional` versus
`coachProfessionalProfilesByCoachId` seam. BS13B does not synchronize or migrate those values.

## 24. BS13C handoff

BS13C may define whether defensive preparation, offensive preparation, and matchup advice represent
useful Staff decisions, their deterministic quality/evidence, and their explicit acceptance flow.
Tactics/Rotation remain the target owners; BS13C must not grant Staff direct target-domain authority.
