/*
 * Coach · Overview icon set.
 *
 * The repository has no icon dependency, so the Overview screen carries its own tiny stroke set on
 * a 24x24 grid to stay consistent with the other NG boards. Every glyph is line art at 1.6px so it
 * reads at 14-18px without turning into noise.
 */

import type { ReactNode } from 'react'

const GLYPHS: Record<string, ReactNode> = {
  userRound: (
    <>
      <circle cx="12" cy="8.2" r="3.7" />
      <path d="M5.2 20.2a6.9 6.9 0 0 1 13.6 0" />
    </>
  ),
  brain: (
    <>
      <path d="M11 5.2a2.6 2.6 0 0 0-4.7 1.2 2.7 2.7 0 0 0-1.9 4 2.6 2.6 0 0 0 .9 4.4A2.6 2.6 0 0 0 9 19a2.6 2.6 0 0 0 2-.8Z" />
      <path d="M13 5.2a2.6 2.6 0 0 1 4.7 1.2 2.7 2.7 0 0 1 1.9 4 2.6 2.6 0 0 1-.9 4.4A2.6 2.6 0 0 1 15 19a2.6 2.6 0 0 1-2-.8Z" />
    </>
  ),
  activity: <path d="M3.6 12.4h3.6l2.4-6.2 3.3 11.6 2.4-8 1.7 2.6h3.4" />,
  shieldCheck: (
    <>
      <path d="M12 3.4 5.4 6v5.4c0 4 2.7 7.4 6.6 8.9 3.9-1.5 6.6-4.9 6.6-8.9V6Z" />
      <path d="m9.4 11.8 1.9 1.9 3.5-3.6" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3.6l1.6 4.5 4.5 1.6-4.5 1.6L12 15.8l-1.6-4.5L5.9 9.7l4.5-1.6Z" />
      <path d="M17.6 15.4l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7Z" />
    </>
  ),
  handshake: (
    <>
      <path d="M3.6 11.4 7 8l2.6 2.3 2.4-2.3L15 10.3l2.6-2.3 2.8 3.4" />
      <path d="M7 8 3.6 11.2v3.4l3.4 3.4 2.4-2.4h4.6l3.6-3.6.6-2.2" />
    </>
  ),
  flame: (
    <>
      <path d="M12 3.6c3.4 3.4 5.4 6 5.4 9a5.4 5.4 0 0 1-10.8 0c0-1.8.8-3.3 2.2-5 .3 1 .9 1.7 1.7 2.1.2-2.4.7-4.4 1.5-6.1Z" />
    </>
  ),
  mic: (
    <>
      <rect height="10.2" rx="2.6" width="5.6" x="9.2" y="3.2" />
      <path d="M6 11.4a6 6 0 0 0 12 0" />
      <path d="M12 17.4v3.4" />
    </>
  ),
  triangleAlert: (
    <>
      <path d="M12 4.2 21 19.4H3Z" />
      <path d="M12 10v4" />
      <path d="M12 17.1h.01" />
    </>
  ),
  wallet: (
    <>
      <path d="M3.6 7.4A2.2 2.2 0 0 1 5.8 5.2h11a2.2 2.2 0 0 1 2.2 2.2v9.2a2.2 2.2 0 0 1-2.2 2.2h-11a2.2 2.2 0 0 1-2.2-2.2Z" />
      <path d="M19 11.4h-3.4a1.9 1.9 0 0 0 0 3.8H19" />
    </>
  ),
  walletCards: (
    <>
      <rect height="9.4" rx="1.8" width="13" x="3.4" y="9.6" />
      <path d="M6.6 9.6V7.2a1.8 1.8 0 0 1 1.8-1.8h9.4a1.8 1.8 0 0 1 1.8 1.8v6.4" />
      <path d="M6.6 14.4h4" />
    </>
  ),
  landmark: (
    <>
      <path d="M3.4 20.4h17.2" />
      <path d="M5.4 20.4V10" />
      <path d="M9.8 20.4V10" />
      <path d="M14.2 20.4V10" />
      <path d="M18.6 20.4V10" />
      <path d="M12 3.4 20.4 8H3.6Z" />
    </>
  ),
  banknote: (
    <>
      <rect height="10.6" rx="1.8" width="17.2" x="3.4" y="6.7" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M7 12h.01M17 12h.01" />
    </>
  ),
  trendingUp: (
    <>
      <path d="M3.6 16.6 9 11.2l3.4 3.4 7.4-7.4" />
      <path d="M15.4 7.2h4.4v4.4" />
    </>
  ),
  briefcase: (
    <>
      <rect height="11" rx="1.8" width="17.2" x="3.4" y="8.4" />
      <path d="M8.6 8.4V6.6a1.8 1.8 0 0 1 1.8-1.8h3.2a1.8 1.8 0 0 1 1.8 1.8v1.8" />
      <path d="M3.4 13.2h17.2" />
    </>
  ),
  star: <path d="m12 3.8 2.6 5.4 5.9.8-4.3 4.2 1 5.9L12 17.3l-5.2 2.8 1-5.9-4.3-4.2 5.9-.8Z" />,
  users: (
    <>
      <circle cx="9.4" cy="8.4" r="3.2" />
      <path d="M3.6 19.6a5.8 5.8 0 0 1 11.6 0" />
      <path d="M16 6.2a3.2 3.2 0 0 1 0 6.2" />
      <path d="M17.4 14.6a5.8 5.8 0 0 1 3 5" />
    </>
  ),
  chartBars: (
    <>
      <path d="M3.6 20.4h16.8" />
      <path d="M6.6 20.4v-5.2" />
      <path d="M11 20.4V9.6" />
      <path d="M15.4 20.4v-7.6" />
      <path d="M19.8 20.4V6.4" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <circle cx="12" cy="12" r="4.4" />
      <path d="M12 3.8v3.4M12 16.8v3.4M3.8 12h3.4M16.8 12h3.4" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 4.6h8v5a4 4 0 0 1-8 0Z" />
      <path d="M8 6.2H5.6v1.6a2.6 2.6 0 0 0 2.6 2.6M16 6.2h2.4v1.6a2.6 2.6 0 0 1-2.6 2.6" />
      <path d="M12 13.6v3.2" />
      <path d="M8.4 20.2h7.2l-.8-3.4H9.2Z" />
    </>
  ),
  flag: (
    <>
      <path d="M6.2 20.6V4.2" />
      <path d="M6.2 5.4h11.4l-2.2 3.6 2.2 3.6H6.2" />
    </>
  ),
  chevronRight: <path d="m9.6 5.4 6.6 6.6-6.6 6.6" />,
  caretUp: <path d="M12 6.4 18.6 17H5.4Z" fill="currentColor" stroke="none" />,
  caretDown: <path d="M12 17.6 5.4 7h13.2Z" fill="currentColor" stroke="none" />,
  caretFlat: <path d="M6.5 12h11" strokeWidth="2.4" />,
  stack: (
    <>
      <path d="M12 3.6 3.8 8 12 12.4 20.2 8Z" />
      <path d="m3.8 12.6 8.2 4.4 8.2-4.4" />
      <path d="m3.8 16.8 8.2 4.4 8.2-4.4" />
    </>
  ),
}

export const COACH_OVERVIEW_GLYPH_IDS = Object.keys(GLYPHS)

export function OverviewGlyph({
  className,
  name,
  size = 16,
}: {
  readonly className?: string
  readonly name: string
  readonly size?: number
}) {
  const glyph = GLYPHS[name] ?? GLYPHS.stack
  return (
    <svg
      aria-hidden
      className={className}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox="0 0 24 24"
      width={size}
    >
      {glyph}
    </svg>
  )
}
