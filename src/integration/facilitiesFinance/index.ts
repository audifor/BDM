/**
 * CFI7 — Facilities <-> Finance integration barrel.
 *
 * This directory is the ONLY place in the repository that imports both `@/domain/facilities` and
 * `@/domain/finance`. Neither domain imports the other, and `src/engine/facilities` remains exactly
 * as CFI1-CFI6a left it (Finance-free).
 *
 * The canonical `FacilityFinancialBinding` entity itself lives in `@/domain/facilities` (it is
 * normalized GameWorld state, and Domain may not depend on this layer); this layer owns only the
 * Finance-coupled behavior: orchestration commands and cross-domain queries.
 */

export * from './FacilityFinanceOrchestration'
export * from './FacilityFinanceQueries'
