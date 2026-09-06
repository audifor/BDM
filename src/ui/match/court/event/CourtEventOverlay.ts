export type CourtEventKind =
  | 'NONE'
  | 'PLAYOFFS'
  | 'FINALS'
  | 'COPA'
  | 'FINAL_FOUR'
  | 'NCAA_TOURNAMENT'
  | 'ALL_STAR'
  | 'CUSTOM'

export type CourtEventOverlay = {
  readonly kind: CourtEventKind
  readonly label: string | null
  readonly competitionMark: string | null
  readonly sidelineLogos: readonly string[]
  readonly paintDecal: string | null
  readonly sponsorSlots: readonly string[]
  readonly centerSecondaryMark: string | null
  readonly opacity: number
}

export function createEventOverlay(
  kind: CourtEventKind,
  overrides: Partial<CourtEventOverlay> = {},
): CourtEventOverlay | undefined {
  if (kind === 'NONE') return undefined
  const labels: Record<Exclude<CourtEventKind, 'NONE'>, string> = {
    PLAYOFFS: 'PLAYOFFS',
    FINALS: 'FINALS',
    COPA: 'COPA',
    FINAL_FOUR: 'FINAL FOUR',
    NCAA_TOURNAMENT: 'NCAA',
    ALL_STAR: 'ALL-STAR',
    CUSTOM: overrides.label ?? 'EVENT',
  }
  return {
    kind,
    label: labels[kind],
    competitionMark: labels[kind],
    sidelineLogos: [],
    paintDecal: null,
    sponsorSlots: [],
    centerSecondaryMark: labels[kind],
    opacity: 0.35,
    ...overrides,
  }
}
