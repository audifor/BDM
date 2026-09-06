import {
  STANDINGS_ZONE_LABELS,
  type StandingsZone,
  type StandingsZoneBands,
} from '@/ui-ng/applications/competition/standingsZones'

export function StandingsZoneLegend({ bands }: { readonly bands: StandingsZoneBands }) {
  const items: Array<Exclude<StandingsZone, 'midtable'>> = []
  if (bands.playoffThrough > 0) items.push('playoff')
  if (bands.promotionThrough > 0) items.push('promotion')
  if (bands.relegationFrom !== null) items.push('relegation')
  if (items.length === 0) return null

  return (
    <p aria-label="Leyenda de zonas" className="competition-standings__legend">
      {items.map((zone) => (
        <span className={`is-zone-${zone}`} key={zone}>
          {STANDINGS_ZONE_LABELS[zone]}
        </span>
      ))}
    </p>
  )
}
