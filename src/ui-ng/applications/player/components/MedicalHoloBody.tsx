import { useId } from 'react'

export function MedicalHoloBody({ className }: { readonly className?: string }) {
  const glowFilterId = useId()

  return (
    <svg
      aria-hidden
      className={className}
      fill="none"
      viewBox="0 0 120 200"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter height="140%" id={glowFilterId} width="140%" x="-20%" y="-20%">
          <feGaussianBlur result="blur" stdDeviation="1.1" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g filter={`url(#${glowFilterId})`} stroke="currentColor">
        <g opacity="0.18" strokeWidth="0.75">
          <line x1="0" x2="120" y1="36" y2="36" />
          <line x1="6" x2="114" y1="72" y2="72" />
          <line x1="0" x2="120" y1="108" y2="108" />
          <line x1="8" x2="112" y1="144" y2="144" />
        </g>

        <line opacity="0.45" strokeWidth="1" x1="60" x2="60" y1="10" y2="176" />

        <path
          d="M60 12
             C69 12 72 18 72 26
             C72 32 68 36 60 38
             C52 36 48 32 48 26
             C48 18 51 12 60 12Z
             M44 44
             L36 78
             M76 44
             L84 78
             M52 44
             L48 104
             L50 140
             L52 172
             M68 44
             L72 104
             L70 140
             L68 172
             M48 104
             L72 104
             M50 140
             L70 140"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.6"
        />

        <g fill="currentColor" stroke="none">
          <circle cx="44" cy="44" r="2.2" />
          <circle cx="76" cy="44" r="2.2" />
          <circle cx="36" cy="78" r="2" />
          <circle cx="84" cy="78" r="2" />
          <circle cx="48" cy="104" r="2.2" />
          <circle cx="72" cy="104" r="2.2" />
          <circle cx="50" cy="140" r="2" />
          <circle cx="70" cy="140" r="2" />
          <circle cx="52" cy="172" r="1.8" />
          <circle cx="68" cy="172" r="1.8" />
        </g>

        <g opacity="0.35" strokeWidth="0.9">
          <path d="M46 56 C60 60 74 56 74 56" />
          <path d="M47 72 C60 76 73 72 73 72" />
          <path d="M48 88 C60 92 72 88 72 88" />
          <path d="M49 118 C60 122 71 118 71 118" />
          <path d="M50 154 C60 157 70 154 70 154" />
        </g>

        <ellipse cx="60" cy="186" opacity="0.35" rx="26" ry="5.5" strokeWidth="1" />
        <ellipse cx="60" cy="186" opacity="0.55" rx="16" ry="3.5" strokeWidth="1" />
      </g>
    </svg>
  )
}
