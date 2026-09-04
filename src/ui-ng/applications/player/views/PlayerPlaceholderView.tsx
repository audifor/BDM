import { PLAYER_VIEW_PLACEHOLDERS, type PlayerWorkspaceViewId } from '@/ui-ng/applications/player/playerStructuralData'

export function PlayerPlaceholderView({ viewId }: { readonly viewId: PlayerWorkspaceViewId }) {
  const message = PLAYER_VIEW_PLACEHOLDERS[viewId] ?? 'This workspace view is not implemented in NG yet.'

  return (
    <section className="po-placeholder" data-ng-region={`player-${viewId}`}>
      <h2 className="po-placeholder__title">{viewId.charAt(0).toUpperCase() + viewId.slice(1)}</h2>
      <p className="po-placeholder__message">{message}</p>
    </section>
  )
}
