export function RosterUnknownMark({ label }: { readonly label?: string }) {
  return (
    <span
      aria-label="Unknown"
      className="canonical-roster__rating canonical-roster__rating--unknown"
      title={label === undefined ? 'Unknown' : `${label} unknown`}
    >
      <i />
    </span>
  )
}
