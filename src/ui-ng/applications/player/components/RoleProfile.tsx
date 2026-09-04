import { usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'

export function RoleProfile() {
  const { model } = usePlayerWorkspace()
  if (model === null) return null

  const { roleProfile } = model
  const positionLine =
    roleProfile.secondaryPositions.length > 0
      ? `${roleProfile.primaryPosition} / ${roleProfile.secondaryPositions.join(' / ')}`
      : roleProfile.primaryPosition

  return (
    <div className="po-role">
      <div className="po-role__primary">
        <span className="po-role__label">Position Profile</span>
        <strong className="po-role__value">{positionLine}</strong>
      </div>
      <div className="po-role__derived">
        <span className="po-role__label">Derived strengths</span>
        <ul className="po-role__secondary">
          {roleProfile.derivedHighlights.map((role) => (
            <li key={role}>{role}</li>
          ))}
        </ul>
        <span className="po-role__note">Derived from canonical ratings · not a tactical role assignment</span>
      </div>
    </div>
  )
}
