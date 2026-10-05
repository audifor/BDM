# BS13C Staff Decision Intelligence

## 1. Baseline

Started from validated BS13B commit `6aa893653139492626f877d26b5ad90eab6719f5` on branch `bdm-stage2-bs13c-staff-decision-intelligence`.

## 2. Coach/Staff professional audit

The reader/writer trace is recorded in [BS13C_COACH_STAFF_PROFILE_CONVERGENCE_AUDIT.md](BS13C_COACH_STAFF_PROFILE_CONVERGENCE_AUDIT.md). Before this milestone, generated Coaches had duplicate 13-attribute values in `StaffPerson.professional` and `coachProfessionalProfilesByCoachId`; Staff consumers and Coach consumers could diverge.

## 3. Canonical authority decision

`StaffPerson.professional.attributes` is the one mutable professional authority. Coach is an identity/role facade pointing at its Staff profile. Coach RPG, experience, history, reputation, and personality remain separate concepts.

## 4. Migration strategy

The canonical Staff value wins whenever that profile exists. The legacy Coach map seeds a missing legacy Coach Staff profile. No averaging, timestamps, or fabricated attributes are used.

## 5. Old-save behavior

Save V1 remains schema 1. Its reader accepts the legacy Coach map and feeds it to Staff-root migration. A missing legacy map uses the existing neutral legacy Staff default. New runtime worlds have no Coach professional map.

## 6. Generation behavior

World and test-game generation create each professional profile once on Staff. Head Coach proficiency derives from the canonical `headCoach` role weights.

## 7. Import behavior

WorldDB imports populate the canonical Staff profile from source Staff attributes; the selected Coach facade points to that Staff profile. The import does not synthesize a Coach-only profile.

## 8. Role proficiency

Proficiency remains derived on demand from the 13 attributes and role registry. Head Coach uses the same canonical weights as the Staff role definition. No proficiency or overall is persisted.

## 9. Specialization

Existing role weights and eligible-role registries distinguish specialists. Specialism identifiers do not add arbitrary quality bonuses; domain context and knowledge remain owned by their consumers.

## 10. Quality model

Existing Training, Medical, Scouting, Recruiting, Tactics/opposition-scouting, and basketball-operations functions remain domain-specific. They use role proficiency, relevant attributes and context, justified personality inputs, deterministic seeded jitter where present, and bounded workload effects. There is no universal Staff rating and no shared formula rewrite.

## 11. Training result

Connected and sufficient. Scheduled execution resolves canonical Staff context and `trainingQuality`; plan, execution and PlayerDevelopment remain authoritative in their existing domains.

## 12. Medical result

Connected and sufficient. Canonical Staff professional values feed medical expertise and advice; medical/injury lifecycle remains authoritative.

## 13. Scouting result

Connected and sufficient. Staff quality affects reports/uncertainty using authorized knowledge. No scouting knowledge model changed.

## 14. Recruiting result

Connected and sufficient. Staff informs evaluation and priorities; Recruiting Engine retains contact, commitment, eligibility, NIL, and signing authority.

## 15. Market result

Connected and sufficient for current scope. Staff responsibility authorizes operational work; market and contract rules retain legality and binding authority.

## 16. Trade result

Connected and sufficient. Staff can advise or perform authorized operational steps; TradeEngine and Governance remain authoritative.

## 17. `defensiveGamePlan`

RETIRED. The existing `oppositionScouting` report already produces defensive-emphasis and pace advice, with explicit acceptance into `TeamGamePlan`. The extra registered kind duplicates this purpose without its own supported decision contract.

## 18. `offensivePreparation`

DEFERRED_TO_NON_BS13_OWNER. Tactics planning owner in a future non-BS13 tactical-planning milestone. `shotProfile` exists, but no Staff advice payload or validated accept path exists.

## 19. `matchupRecommendation`

DEFERRED_TO_NON_BS13_OWNER. Tactics/Rotation planning owner in a future non-BS13 tactical-planning milestone. Existing matchup controls are manual; there is no Staff review/acceptance validation seam.

## 20. Tactics boundary

No Tactics model or MatchEngine inputs changed. Existing accepted opposition reports continue to update only supported `TeamGamePlan` fields.

## 21. Rotation boundary

Rotation and lineup state stay with their existing owners. No Staff matchup or rotation authority was added.

## 22. MatchEngine boundary

No MatchEngine files or live decision logic changed.

## 23. Deterministic behavior

Professional generation, canonical lookup, role proficiency, and migration are deterministic. Existing quality jitter uses injected seeded streams; no `Math.random()` or new random source was added.

## 24. Explainability

The legacy conflict rule, role-derived proficiency, and tactical dispositions are documented. Existing advisory outcomes retain their structured payload and immutable evidence behavior.

## 25. Workload

Existing shared workload penalty remains bounded (maximum 20 points) and is applied by relevant consumers; this milestone adds no global Staff scan or second workload formula.

## 26. Personality boundary

Existing domain-justified personality inputs remain. No new personality-to-tactics behavior was introduced.

## 27. Relationships boundary

Existing relationship consumers remain unchanged. No favoritism or minutes mechanic was added.

## 28. Information boundary

No additional knowledge access was granted. Consumers continue to use their authorized organization/scouting/medical context.

## 29. UI

Coach UI and Staff UI now read the same Staff professional profile. No new Staff application or redesign was added.

## 30. Save

New Save V1 payloads omit the duplicate Coach professional map; old Save V1 data remains readable. Coach RPG persistence remains intact.

## 31. Performance

Coach profile lookup follows one Coach-to-Staff reference and performs no global scans. Quality remains computed at the existing consumer call sites.

## 32. P0

None identified.

## 33. P1

The two tactical responsibilities remain intentionally deferred pending an explicit Tactics/Rotation planning contract. The pre-existing broad Save V1 whole-world equality test also fails on the untouched BS13B baseline because other world fields are not round-tripped; BS13C's focused canonical-profile Save V1 round-trip and legacy migration cases pass. This broader persistence gap is outside this milestone's profile migration.

## 34. BS13D recommendation

OPTIONAL / LATER. Coaches already have experience, RPG skills, traits, career history and reputation, but this milestone found no evidence that all Staff roles need progression, potential, or aging. Revisit only if product evidence identifies a missing Staff career consequence; do not implement it as an assumed follow-up.

## 35. BS13E handoff

If BS13E proceeds, build explainable performance evidence on immutable advisory/decision history and connect it to existing Coach/Staff career and reputation records. Preserve canonical professional attributes, target-domain authority, and the explicit tactical deferrals.
