import type { ReactNode } from 'react'

import type { CoachPerkId, CoachSkillId } from '@/domain/ids'

/**
 * Bespoke line-art glyphs for the Coach development board. BDM ships no icon component library, so
 * each canonical skill/perk gets a dedicated minimal glyph instead of a generic placeholder.
 */

function Glyph({ children }: { readonly children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      className="ng-coach-dev__glyph-svg"
      fill="none"
      height="22"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.4"
      viewBox="0 0 24 24"
      width="22"
    >
      {children}
    </svg>
  )
}

const FALLBACK = (
  <>
    <circle cx="12" cy="12" r="7.5" />
    <path d="M12 8.5v7M8.5 12h7" />
  </>
)

const SKILL_GLYPHS: Readonly<Record<string, ReactNode>> = {
  gamePreparation: (
    <>
      <rect height="16.5" rx="1.5" width="14" x="5" y="4" />
      <path d="M9 4.5h6v2.5H9z" />
      <path d="M8.5 12.5h7M8.5 16h4.5" />
    </>
  ),
  inGameAdjustment: (
    <>
      <path d="M4.5 8.5h15M4.5 15.5h15" />
      <circle cx="9.5" cy="8.5" r="2.2" />
      <circle cx="14.5" cy="15.5" r="2.2" />
    </>
  ),
  practiceDesign: (
    <>
      <path d="M12 3.5v9M9.5 12.5h5" />
      <path d="M9.5 12.5 12 20.5l2.5-8" />
      <circle cx="18" cy="6.5" r="2.4" />
    </>
  ),
  individualDevelopmentPlanning: (
    <>
      <circle cx="9" cy="7.5" r="3" />
      <path d="M4 20c0-3.1 2.2-5.5 5-5.5s5 2.4 5 5.5" />
      <path d="M18 19.5V9M15.5 11.5 18 9l2.5 2.5" />
    </>
  ),
  lockerRoomCommunication: (
    <>
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h-1A2.5 2.5 0 0 1 4 13.5z" />
      <path d="M8.5 8.5h7M8.5 11.5h4.5" />
    </>
  ),
  pressureLeadership: (
    <>
      <path d="M6.5 3v18" />
      <path d="M6.5 4.5h11l-2.4 3.5 2.4 3.5h-11" />
    </>
  ),
  opponentStudy: (
    <>
      <circle cx="10.5" cy="10.5" r="5.5" />
      <path d="M14.5 14.5 20 20" />
      <path d="M8.5 9.5h4M8.5 12h2.5" />
    </>
  ),
  performanceReview: (
    <>
      <path d="M4 20h16" />
      <path d="M7 20v-4.5M11 20v-8.5M15 20v-6M19 20V9" />
    </>
  ),
  delegation: (
    <>
      <circle cx="6" cy="7.5" r="2.5" />
      <circle cx="18" cy="16.5" r="2.5" />
      <path d="M8.5 7.5h7l-3-3M15.5 16.5h-7l3 3" />
    </>
  ),
  staffCoordination: (
    <>
      <circle cx="12" cy="5" r="2.5" />
      <circle cx="5" cy="18" r="2.5" />
      <circle cx="19" cy="18" r="2.5" />
      <path d="M12 7.5v4M12 11.5 6.3 15.8M12 11.5l5.7 4.3" />
    </>
  ),
}

const PERK_GLYPHS: Readonly<Record<string, ReactNode>> = {
  filmRoomSpecialist: (
    <>
      <rect height="14" rx="2" width="17" x="3.5" y="5" />
      <path d="M3.5 9h17M8 5v4M16 5v4" />
      <path d="M11 11.8 14.2 14 11 16.2z" />
    </>
  ),
  individualDevelopmentPlans: (
    <>
      <path d="M6 3.5h8l4 4v13H6z" />
      <path d="M14 3.5V8h4" />
      <path d="M12 17.5v-5M9.5 15 12 12.5l2.5 2.5" />
    </>
  ),
  secondUnitArchitect: (
    <>
      <rect height="6" rx="1" width="10" x="7" y="3.5" />
      <rect height="6.5" rx="1" width="7" x="3.5" y="14" />
      <rect height="6.5" rx="1" width="7" x="13.5" y="14" />
      <path d="M12 9.5v2.5M7 14v-2h10v2" />
    </>
  ),
  delegatedDevelopment: (
    <>
      <circle cx="5.5" cy="12" r="2.5" />
      <circle cx="18.5" cy="6.5" r="2.5" />
      <circle cx="18.5" cy="17.5" r="2.5" />
      <path d="M8 11 15.9 7.2M8 13l7.9 3.8" />
    </>
  ),
  tacticalMastery: (
    <>
      <rect height="15" rx="1.5" width="17" x="3.5" y="4.5" />
      <path d="M12 4.5v15" />
      <path d="M7.2 9.2l3.1 4M10.3 9.2l-3.1 4" />
      <circle cx="16.2" cy="15.8" r="2.1" />
    </>
  ),
  playerDevelopmentFocus: (
    <>
      <path d="M4 19.5h16" />
      <path d="M4.5 15.5 9 11l3 3 7.5-7.5" />
      <path d="M19.5 10.5v-4h-4" />
    </>
  ),
  cultureBuilder: (
    <>
      <path d="M12 3.5 19.5 6v6c0 4-3 7-7.5 8.5C7.5 19 4.5 16 4.5 12V6z" />
      <path d="M9.2 12l2 2 3.6-4.2" />
    </>
  ),
  organizationBuilder: (
    <>
      <path d="M4 20.5h16" />
      <path d="M6.5 20.5V8.5L12 4.5l5.5 4v12" />
      <path d="M10 20.5v-5h4v5" />
      <path d="M10 11h4" />
    </>
  ),
}

export function CoachSkillGlyph({ skillId }: { readonly skillId: CoachSkillId }) {
  return <Glyph>{SKILL_GLYPHS[skillId] ?? FALLBACK}</Glyph>
}

export function CoachPerkGlyph({ perkId }: { readonly perkId: CoachPerkId }) {
  return <Glyph>{PERK_GLYPHS[perkId] ?? FALLBACK}</Glyph>
}
