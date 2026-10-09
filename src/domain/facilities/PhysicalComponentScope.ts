import type { FacilityComponent } from './FacilityComponent'
/** Requesting a whole component also consumes its contained physical parts. */
export function physicalComponentsOverlap(components: Readonly<Record<string, FacilityComponent>>, a: string, b: string): boolean {
  const ancestors = (id: string) => {
    const found = new Set<string>()
    let current: string | null = id
    while (current !== null && !found.has(current)) { found.add(current); current = components[current]?.parentComponentId ?? null }
    return found
  }
  return ancestors(a).has(b) || ancestors(b).has(a)
}
