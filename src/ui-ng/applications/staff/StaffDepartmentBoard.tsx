import { STAFF_DEPARTMENT_LABELS, STAFF_PROFESSIONAL_ATTRIBUTE_LABELS, STAFF_ROLE_LABELS } from '@/ui/staffPresentation'

import type {
  StaffDepartmentAttributeComparison,
  StaffDepartmentBoardModel,
  StaffDepartmentCard,
  StaffDepartmentRoleRow,
} from '@/ui-ng/applications/staff/buildStaffDepartmentBoardModel'

const ROLE_DOT_COLORS = ['#7dd3fc', '#a78bfa', '#facc15', '#34d399', '#fb923c', '#f472b6', '#60a5fa', '#4ade80'] as const

function RoleDots({ filled, target }: { readonly filled: number; readonly target: number }) {
  const total = Math.max(filled, target)
  const dots = Array.from({ length: total }, (_, index) => index < filled)
  return (
    <span className="staff-department-card__dots" aria-hidden>
      {dots.map((isFilled, index) => (
        <span
          className={isFilled ? 'staff-department-card__dot is-filled' : 'staff-department-card__dot'}
          key={index}
          style={isFilled ? { '--dot-color': ROLE_DOT_COLORS[index % ROLE_DOT_COLORS.length] } as never : undefined}
        />
      ))}
    </span>
  )
}

function DepartmentRoleList({ roles }: { readonly roles: readonly StaffDepartmentRoleRow[] }) {
  if (roles.length === 0) {
    return <p className="staff-workspace__note">No roles configured for this department.</p>
  }
  return (
    <ul className="staff-department-card__role-list">
      {roles.map((row) => (
        <li className={row.filled < row.target ? 'is-understaffed' : undefined} key={row.role}>
          <span className="staff-department-card__role-ratio">
            {row.filled}/{row.target}
          </span>
          <span className="staff-department-card__role-name">{STAFF_ROLE_LABELS[row.role]}</span>
        </li>
      ))}
    </ul>
  )
}

function ComparisonBar({ comparison }: { readonly comparison: StaffDepartmentAttributeComparison }) {
  const { leagueLow, leagueHigh, teamValue } = comparison
  const span = Math.max(leagueHigh - leagueLow, 1)
  const fillPercent = Math.round(((leagueHigh - leagueLow) / 100) * 100)
  const markerPercent = teamValue === undefined ? undefined : Math.min(100, Math.max(0, ((teamValue - leagueLow) / span) * 100))

  return (
    <div className="staff-department-chart__column">
      <div className="staff-department-chart__track">
        <div className="staff-department-chart__range" style={{ height: `${fillPercent}%` }} />
        {markerPercent !== undefined ? (
          <div className="staff-department-chart__marker" style={{ bottom: `${markerPercent}%` }} title={`Your team: ${teamValue}`} />
        ) : null}
      </div>
      <span className="staff-department-chart__label">{STAFF_PROFESSIONAL_ATTRIBUTE_LABELS[comparison.attribute]}</span>
    </div>
  )
}

function DepartmentComparisonChart({ comparisons }: { readonly comparisons: readonly StaffDepartmentAttributeComparison[] }) {
  const leagueHigh = Math.max(...comparisons.map((item) => item.leagueHigh))
  const leagueLow = Math.min(...comparisons.map((item) => item.leagueLow))

  return (
    <div className="staff-department-chart">
      <p className="staff-department-chart__caption">Highest in the league ({leagueHigh})</p>
      <div className="staff-department-chart__grid">
        {comparisons.map((comparison) => (
          <ComparisonBar comparison={comparison} key={comparison.attribute} />
        ))}
      </div>
      <p className="staff-department-chart__caption staff-department-chart__caption--low">Lowest in the league ({leagueLow})</p>
    </div>
  )
}

function DepartmentCard({ card, onOpenDepartment }: { readonly card: StaffDepartmentCard; readonly onOpenDepartment: (department: StaffDepartmentCard['department']) => void }) {
  return (
    <article className="staff-department-card ng-holo-panel">
      <header className="staff-department-card__header">
        <button className="staff-department-card__title-link" onClick={() => onOpenDepartment(card.department)} type="button">
          {STAFF_DEPARTMENT_LABELS[card.department]} ›
        </button>
        <p className="staff-department-card__subtitle">
          <span className="ng-type-numeric">{card.employeeCount}</span> employee{card.employeeCount === 1 ? '' : 's'}
        </p>
      </header>

      <div className="staff-department-card__roles">
        <RoleDots filled={card.employeeCount} target={card.roles.reduce((sum, row) => sum + row.target, 0)} />
        <DepartmentRoleList roles={card.roles} />
      </div>
      <DepartmentComparisonChart comparisons={card.comparisons} />
    </article>
  )
}

export function StaffDepartmentBoard({
  model,
  onOpenDepartment,
}: {
  readonly model: StaffDepartmentBoardModel
  readonly onOpenDepartment: (department: StaffDepartmentCard['department']) => void
}) {
  return (
    <div className="staff-department-board">
      {model.cards.map((card) => (
        <DepartmentCard card={card} key={card.department} onOpenDepartment={onOpenDepartment} />
      ))}
    </div>
  )
}
