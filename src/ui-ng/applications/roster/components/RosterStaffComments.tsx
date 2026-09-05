import type { RosterStaffCommentsModel } from '@/ui-ng/applications/roster/buildRosterStaffComments'

export function RosterStaffComments({
  model,
  embedded = false,
}: {
  readonly model: RosterStaffCommentsModel
  readonly embedded?: boolean
}) {
  if (model.groups.length === 0) return null

  const body = (
    <div className="canonical-roster__staff-comments-groups">
      {model.groups.map((group) => (
        <section className="canonical-roster__staff-comments-group" key={group.level}>
          <h3 className="canonical-roster__staff-comments-level">{group.level}</h3>
          <ul className="canonical-roster__staff-comments-list">
            {group.comments.map((comment) => (
              <li className="canonical-roster__staff-comments-item" key={comment.id}>
                <div className="canonical-roster__staff-comments-who">
                  <strong>{comment.staffName}</strong>
                  {comment.roleLabel === undefined ? null : <span>{comment.roleLabel}</span>}
                  <time>{comment.dateLabel}</time>
                </div>
                <p className="canonical-roster__staff-comments-title-line">{comment.title}</p>
                {comment.body === '' ? null : (
                  <p className="canonical-roster__staff-comments-body">{comment.body}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )

  if (embedded) return body

  return (
    <aside
      aria-label="Comentarios del staff"
      className="canonical-roster__staff-comments"
      data-ng-region="roster-staff-comments"
    >
      <header className="canonical-roster__staff-comments-head">
        <h2 className="canonical-roster__staff-comments-title">Staff</h2>
      </header>
      {body}
    </aside>
  )
}
