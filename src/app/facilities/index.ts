/**
 * MX0.6 — Facilities application boundary.
 *
 * Product-facing read + command orchestration over the canonical Facilities System Truth. Nothing in
 * this directory persists derived state or invents a business rule: reads go through the canonical
 * domain/integration queries, commands through the canonical engine/integration commands.
 */

export * from './ClubFacilitiesReadModel'
export * from './FacilityProjectCommands'
