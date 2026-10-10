# BS17E-P2 V1 · Approved cost and governance principles

**Status:** `APPROVED_PRINCIPLE` for exactly SIM-01–SIM-05 and GOV-01–GOV-04; implementation details remain `DETAIL_PENDING`.
**Base:** `aabf0d0384ab1e754d75c81c49d8989f367ba71e`.
**Execution:** `BS17E EXECUTION: BLOCKED_BY_BS16_COMPLETE`.

This record formalizes the nine product principles expressly approved for BS17E-P2 V1. It does not approve any economic implementation, price, formula, supplier, organization, actor, appointment, grant, financial transition, schema, or production behavior. The supporting proposals and decision matrix remain the sources for unresolved alternatives and design detail.

## Approved principles

| ID | Status | Ratified principle | Boundary and pending detail |
|---|---|---|---|
| SIM-01 | `APPROVED_PRINCIPLE` | Use a hybrid cost source model: prefer legitimate documented costs; permit simulated offers only through an approved canonical model; return `UNKNOWN_COST` when evidence is insufficient. | A club budget is never an automatic source of an intervention price. Source authority and model rules remain `DETAIL_PENDING`. |
| SIM-02 | `APPROVED_PRINCIPLE` | A canonical versioned reference-cost catalog for Facilities interventions may distinguish operation nature/scope, source, and version. | No numerical values, formulas, multipliers, regional coefficients, units, or calibration methods are approved. Catalog ownership, sources and calibration remain `DETAIL_PENDING`. |
| SIM-03 | `APPROVED_PRINCIPLE` | An issued offer has stable identity, operation/scope, provenance, model version and parameter/source evidence, issue date, explicit validity, sourced amount/currency where supported, and persistent history. | Calendar advancement and Save/reload do not mutate an issued offer. No arbitrary expiry duration is approved; validity source, representation, expiry and renewal remain `DETAIL_PENDING`. |
| SIM-04 | `APPROVED_PRINCIPLE` | Keep estimate, offer, selection, contractual acceptance, Finance commitment, recognition, and settlement distinct. | An estimate is nonbinding and selection alone creates no obligation. Contractual acceptance requires applicable Governance and Finance authorization. Exact commands and transition points remain `DETAIL_PENDING`. |
| SIM-05 | `APPROVED_PRINCIPLE` | Canonical synthetic counterparties explicitly labeled simulated may exist in the simulated world. | No counterparty is created by this approval. Identity, provenance, count, distribution, specialty, territory, capacity, offer selection, and continuity/disappearance policy remain `DETAIL_PENDING`. |
| GOV-01 | `APPROVED_PRINCIPLE` | Different templates may be defined for organization archetypes actually supported by the domain. | No organigram, topology, or equivalence between archetypes is approved. Coverage and concrete templates remain `DETAIL_PENDING`. |
| GOV-02 | `APPROVED_PRINCIPLE` | Authority must trace to a legitimate body, identified actor, valid appointment, effective grant, concrete right, applicable scope/date, and verifiable provenance. | This does not create people, appointments, or grants. Templates, competencies, role rights, scope/date rules, validity, and revocation remain `DETAIL_PENDING`; no universal manager authority is allowed. |
| GOV-03 | `APPROVED_PRINCIPLE` | User and AI use the same Governance authorities, commands, effective rights, Finance rules, and Facilities restrictions. | AI has no bypass or automatic investment authority. Actor mapping remains `DETAIL_PENDING`; parity does not create an actor or grant. |
| GOV-04 | `APPROVED_PRINCIPLE` | A clearly labeled simulated administrative structure may be used for a real organization with insufficient institutional source data, distinct from documented facts and unverified authority. | It must not overwrite documented facts or itself confer authority. Bootstrap eligibility, structure and provenance rules remain `DETAIL_PENDING`; no people or grants are created. |

These nine entries are the complete set of principles ratified by this record. In particular, approving a principle does not implicitly approve a proposed implementation detail in a supporting contract.

## Policies not ratified

The following remain `DETAIL_PENDING` or `PROPOSED_NOT_APPROVED`, as applicable:

- Cost source eligibility and precedence, economic values, units, formulas, calibration, applicability, currency handling, and offer validity.
- Synthetic counterparty generation, identity and provenance, count/distribution, specialties, territory, capacity, selection, and continuity.
- Organization-specific Governance templates, bootstrap eligibility, bodies, actors, appointments, competencies, rights, scope, effective dates, provenance and revocation.
- Exact offer, contract, commitment, recognition and settlement commands and lifecycle transitions.
- E-P03 and E-P05–E-P10 remain `PROPOSED_NOT_APPROVED`; no recommendation in their proposals becomes policy through this ratification.

BS16 Finance remains the exclusive authority for financial obligations, liquidity, reservations, payments, accounting, and canonical money/source facts. Governance remains the authority for institutional permission. Facilities owns physical work and scope. The approved principles introduce no parallel authority and authorize no changes to those systems.

## Dependencies and conditions for implementation

Implementation remains `BLOCKED_BY_BS16_COMPLETE`. BS16 global closure and an explicitly selected certified integration base are prerequisites. Before any BS17E economic vertical slice, the pending cost and Governance subcontracts must be ratified, E-P03 and E-P05–E-P10 must be resolved against the certified BS16 contract, and any proposed operation must have legitimate source evidence and effective authority. Unsupported worlds remain unknown or unverified.

The pre-implementation design work is tracked in [BS17E implementation plan](BS17E_IMPLEMENTATION_PLAN.md): (A) cost catalog sources/calibration; (B) synthetic counterparty identity/generation; (C) archetype templates and Governance bootstrap; and (D) E-P03/E-P05–E-P10 against the certified global BS16 contract. These are design gates, not permission to implement.

At the Finance status inspection recorded during this P2 work, the canonical BS16 roadmap marked BS16M PASS and BS16N as the final certification still pending. BS16 global was therefore not complete. Recheck the certified state before future implementation; no Finance worktree or commit is imported by this documentary ratification.

## Traceability

- E-P01, E-P02 and E-P04 principle decisions were recorded in [BS17E-P V1](BS17E_P_V1_APPROVED_POLICY.md); this P2 record adds exactly SIM-01–SIM-05 and GOV-01–GOV-04 without replacing those earlier decisions.
- Detailed cost and Governance requirements remain in [the simulated cost contract proposal](BS17E_P2_SIMULATED_COST_CONTRACT_PROPOSAL.md) and [the Governance bootstrap contract proposal](BS17E_P2_GOVERNANCE_BOOTSTRAP_CONTRACT_PROPOSAL.md).
- The corresponding statuses and unresolved choices are tracked in [the P2 product decision matrix](BS17E_P2_PRODUCT_DECISION_MATRIX.md).
- No historical certification is amended by this document.
