export type CourtSidelineMark = {
  readonly text: string
  readonly side: 'home' | 'away' | 'near' | 'far'
  readonly opacity: number
}

export type CourtBrandingProfile = {
  readonly primaryColor: string
  readonly secondaryColor: string
  readonly tertiaryColor?: string

  readonly centerMark: CanvasImageSource | null
  readonly centerMonogram: string | null
  readonly centerWordmark: string | null
  readonly centerLogoScale: number
  readonly centerLogoOpacity: number

  readonly baselineHome: string
  readonly baselineAway: string
  readonly baselineOpacity: number
  readonly baselineTrackingEm: number
  readonly baselineScale: number

  readonly sidelineMarks: readonly CourtSidelineMark[]
  readonly basketPaddingMark: string | null
  readonly ledAccent: string
  readonly scorerLabel: string

  /** Presentation variants derived from club colors (canonical brand untouched). */
  readonly palette: CourtPresentationPalette
}

export type CourtPresentationPalette = {
  readonly brand: string
  readonly dark: string
  readonly surface: string
  readonly paint: string
  readonly muted: string
  readonly accent: string
  readonly apron: string
  readonly padding: string
  readonly seat: string
  readonly restricted: string
  readonly center: string
}
