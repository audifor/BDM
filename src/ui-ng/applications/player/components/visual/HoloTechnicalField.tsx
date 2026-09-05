export function HoloTechnicalField({
  variant,
}: {
  readonly variant: 'inspector' | 'profile' | 'support'
}) {
  return (
    <svg
      aria-hidden
      className={`po-holo-field po-holo-field--${variant}`}
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 360 420"
    >
      <g fill="none" strokeLinecap="round">
        <circle cx="248" cy="286" r="118" stroke="rgba(22, 217, 243, 0.28)" strokeWidth="1.1" />
        <circle cx="248" cy="286" r="78" stroke="rgba(116, 150, 168, 0.22)" strokeWidth="1" />
        <circle cx="248" cy="286" r="42" stroke="rgba(22, 217, 243, 0.16)" strokeWidth="1" />
        <path
          d="M130 286 A118 118 0 0 1 248 168"
          stroke="rgba(230, 183, 77, 0.28)"
          strokeWidth="1.1"
        />
        <line stroke="rgba(116, 150, 168, 0.22)" strokeWidth="1" x1="40" x2="340" y1="286" y2="286" />
        <line stroke="rgba(116, 150, 168, 0.22)" strokeWidth="1" x1="248" x2="248" y1="120" y2="400" />
        <path d="M28 392 L92 328" stroke="rgba(22, 217, 243, 0.2)" strokeWidth="1" />
        {variant === 'inspector' && (
          <text
            fill="rgba(135, 175, 194, 0.38)"
            fontFamily="IBM Plex Sans, sans-serif"
            fontSize="9"
            letterSpacing="2.4"
            x="28"
            y="408"
          >
            MORE THAN A GAME
          </text>
        )}
      </g>
    </svg>
  )
}
