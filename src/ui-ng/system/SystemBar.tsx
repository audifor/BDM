import './SystemBar.css'

const SYSTEM_BAR_ITEMS = [
  'BDM',
  'Club Context',
  'Competition / Season',
  'Game Date',
  'Search',
  'Inbox',
  'Notifications',
  'Simulation',
] as const

export function SystemBar() {
  return (
    <header className="ng-system-bar" data-ng-region="system-bar">
      <div className="ng-system-bar__brand">BDM</div>
      <nav aria-label="Global system actions" className="ng-system-bar__items">
        {SYSTEM_BAR_ITEMS.slice(1).map((item) => (
          <span className="ng-system-bar__item" key={item}>
            {item}
          </span>
        ))}
      </nav>
    </header>
  )
}
