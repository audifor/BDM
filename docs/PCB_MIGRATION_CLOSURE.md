# PCB → BDMOS Migration Closure Audit (M7)

Status: **NOT CERTIFIED — remediation required**

Audit date: 2026-08-29. This is a factual handoff record, not a completion certificate.

## Blocking findings

1. **Runtime source dependency (FAIL).** `MedicalPcbPage.tsx` and
   `CompetitionPcbPage.tsx` import `../../../../renderer/src/...` and the
   renderer global stylesheet. BDMOS therefore cannot run after the renderer
   source tree is removed. M7 requires zero runtime dependencies on PCB source.
2. **Content completeness (FAIL).** M4 passes empty arrays/objects for alerts,
   objectives, fixtures, transactions, history, trophies, records and board
   objectives. M3's play creator starts with no saved plays/playbooks. These
   violate the required visible mock/temporary-state completeness.
3. **Workflow parity (NOT VERIFIED).** The 31-surface, PCB-source comparison
   has not been completed. Several M3/M4/M5/M6 actions are intentionally
   no-ops (`()=>undefined`) or local state only, so they cannot be certified as
   preserving PCB workflows.
4. **Superseded Golden reconstruction (NOT CLEANED).**
   `src/ui/screens/GoldenManagerWorkspace.tsx` remains compiled and
   `DesktopAppHost.tsx` retains `isGoldenManagerApp`. The migrated apps intercept
   first today, but the old reconstruction remains an active fallback.
5. **Repository baseline (NOT CLEAN).** The working tree contains extensive
   unrelated modified and untracked work. A migration-only diff cannot be
   certified without separating that baseline.

## Verified isolation observations

- PCB migration components live under `src/ui/pcb-migrated`.
- Search found no React/Zustand/Tauri imports in `src/domain` or `src/engine`.
- Search found no PCB mock/migration state introduced in Domain, Engine or Save.
- Temporary UI state is currently local component state/localStorage (`pcbasket.*`)
  except for the failing runtime renderer imports above.

## Surface matrix

| Milestone | Surfaces | Status |
| --- | ---: | --- |
| M1 Plantilla | 1/1 | Present; full PCB parity not audited |
| M2 Entrenamiento | 5/5 | Present; workflow parity not audited |
| M3 Tácticas | 6/6 | Present; creator/playbook persistence and all workflows require audit |
| M4 Club | 7/7 | Present; multiple views are empty due to mock inputs |
| M5 Medical | 6/6 | Present; runtime renderer dependency; workflow parity not audited |
| M6 Competición | 6/6 | Present; runtime renderer dependency; workflow parity not audited |

## Required remediation before certification

1. Copy M5/M6 source and required styles into `src/ui/pcb-migrated`; remove all
   `renderer/src` runtime imports.
2. Centralize visible fixtures/adapters under the migration UI boundary and seed
   every selected surface; do not place them in GameWorld, Save, Domain or Engine.
3. Compare each of the 31 surfaces with `PCB` source and record Content, Visual,
   Functionality and Workflow evidence, including every PCB action.
4. Replace no-op handlers where PCB had a frontend workflow; document isolated
   temporary persistence and its future canonical destination.
5. Remove or explicitly isolate the unreachable Golden reconstruction after
   proving no remaining route uses it.
6. Re-run full validation: npm test, typecheck, build, cargo fmt/check,
   `Math.random(` search, boundary search and a browser visual pass.

## Codex ↔ Cursor handoff

Continue from this document. Do not mark M7 complete or start A1 until the six
remediation items above are resolved and the 31-surface function matrix is
evidence-backed.

## M7R remediation log

- **Renderer runtime dependency: RESOLVED.** Medical and Competition now use
  local migration components and scoped CSS. Runtime source search returns no
  `renderer/src`, PCB filesystem path or donor-relative import; the two remaining
  mentions are explanatory CSS comments in M1/M2.
- **Golden fallback: RESOLVED for migrated apps.** `DesktopAppHost` no longer
  imports or branches to `GoldenManagerWorkspace`; M1–M6 each have an explicit
  migrated app host branch.
- **Club fixture completeness: IN PROGRESS.** Central deterministic UI-only
  fixtures now provide dashboard alerts/objectives/matches, transactions and
  historical datasets. Facilities, staff/roles and board interaction adapters
  still need their source-shaped fixtures and workflow evidence.
- **Play Creator seed: RESOLVED.** The temporary localStorage repository seeds a
  visible play and playbook when its club scope is empty.
- **Boundary checks: PASS.** Current source search found zero `Math.random(` in
  `src`, zero renderer/PCB runtime imports and zero React/Zustand/Tauri imports
  in Domain/Engine.
- **Global validation: PASS (interim).** `npm run typecheck` and `npm run build`
  pass after donor-removal changes. Full M7R validation and the 31-surface
  workflow matrix remain required before certification.
