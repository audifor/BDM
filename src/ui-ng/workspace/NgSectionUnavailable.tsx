import { startMenuAppLabel, UNAVAILABLE_SECTION_MESSAGE } from '@/ui-ng/system/startMenuCatalog'
import type { WorkspaceAppId } from '@/ui-ng/workspace/workspaceApps'

export function NgSectionUnavailable({ app }: { readonly app: WorkspaceAppId }) {
  return (
    <section className="ng-workspace-unavailable" data-ng-region="section-unavailable">
      <h2 className="ng-workspace-unavailable__title">{startMenuAppLabel(app)}</h2>
      <p className="ng-workspace-unavailable__message">{UNAVAILABLE_SECTION_MESSAGE}</p>
    </section>
  )
}
