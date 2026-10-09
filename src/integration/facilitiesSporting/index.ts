/**
 * CFI8 — Facilities <-> Sporting systems integration barrel.
 *
 * This directory is the ONLY place in the repository that imports both `@/domain/facilities` and a
 * sporting domain (`@/domain/training`, `@/engine/development`, `@/domain/injury`, etc.). Neither
 * `src/domain/facilities` nor `src/engine/facilities` imports any sporting domain. BS17D-P0
 * consumers may reference the pure physical-attempt descriptor for historical evidence;
 * operation resolution remains in this adapter, never in UI or the Facilities outcome engine.
 *
 * `TeamSportingFacilityContext` is derived, never persisted: there is no GameWorld collection and
 * no Save field for it. Sporting systems (Training, Player Development, Medical, Recovery, ...)
 * remain the sole authority over training outcomes, development, injuries, and match performance;
 * this layer only answers what physical infrastructure a Team can currently reach.
 */

export * from './SportingFacilityContext'
export * from './SportingOperationResolver'
