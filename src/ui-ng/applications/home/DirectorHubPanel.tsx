import { useMemo, useState } from 'react'

import { syncWorkspaceAppQuery } from '@/ui-ng/workspace/workspaceApps'
import { useGameStore } from '@/stores/gameStore'
import { buildDirectorHubModel, type DirectorHubAction, type DirectorHubItem } from './directorHubModel'

import './director-hub.css'

function runAction(action: DirectorHubAction, handlers: { readonly acceptStaff: (id: string) => void; readonly dismissStaff: (id: string) => void; readonly acceptReport: (id: string) => void; readonly resolveHuman: (situationId: string, actionId: string) => void; readonly continue: () => void }) {
  if (action.type === 'navigate') syncWorkspaceAppQuery(action.app, 'push')
  else if (action.type === 'resolve-human-situation') handlers.resolveHuman(action.situationId, action.actionId)
  else if (action.type === 'accept-staff-recommendation') handlers.acceptStaff(action.outcomeId)
  else if (action.type === 'dismiss-staff-recommendation') handlers.dismissStaff(action.outcomeId)
  else if (action.type === 'accept-opposition-report') handlers.acceptReport(action.reportId)
  else handlers.continue()
}

function HubItem({ item, onAction }: { readonly item: DirectorHubItem; readonly onAction: (action: DirectorHubAction) => void }) {
  const action = item.action
  const secondaryAction = item.secondaryAction
  return (
    <article className={`director-hub__item director-hub__item--${item.tier}`}>
      <div className="director-hub__item-main">
        <span className="director-hub__tier">{item.tier}</span>
        <div>
          <p className="director-hub__item-title">{item.title}</p>
          <p className="director-hub__item-summary">{item.summary}</p>
          {item.detail === undefined ? null : <p className="director-hub__item-detail">{item.detail}</p>}
        </div>
      </div>
      <div className="director-hub__actions">
        {action === undefined ? null : <button className="ng-canon__action director-hub__action" type="button" onClick={() => onAction(action)}>{item.actionLabel ?? 'Abrir'}</button>}
        {secondaryAction === undefined ? null : <button className="ng-canon__action director-hub__action director-hub__action--secondary" type="button" onClick={() => onAction(secondaryAction)}>{item.secondaryActionLabel ?? 'Ignorar'}</button>}
        {item.choices === undefined ? null : <div className="director-hub__choices">
          {item.choices.map((choice) => <button key={choice.action.type === 'resolve-human-situation' ? `${choice.action.situationId}:${choice.action.actionId}` : choice.label} className="ng-canon__action director-hub__action" type="button" onClick={() => onAction(choice.action)}>{choice.label}</button>)}
        </div>}
      </div>
    </article>
  )
}

export function DirectorHubPanel() {
  const world = useGameStore((state) => state.world)
  const acceptStaffRecommendation = useGameStore((state) => state.acceptStaffRecommendation)
  const dismissStaffRecommendation = useGameStore((state) => state.dismissStaffRecommendation)
  const acceptOppositionScoutingReport = useGameStore((state) => state.acceptOppositionScoutingReport)
  const decideUserHumanSituation = useGameStore((state) => state.decideUserHumanSituation)
  const continueGameAsync = useGameStore((state) => state.continueGameAsync)
  const [notice, setNotice] = useState<string | null>(null)
  const model = useMemo(() => world === null ? null : buildDirectorHubModel(world), [world])
  if (model === null) return null

  const onAction = (action: DirectorHubAction) => runAction(action, {
    acceptStaff: (id) => {
      const result = acceptStaffRecommendation(id as never)
      setNotice(result.ok ? 'Recomendación aceptada y aplicada por su autoridad canónica.' : `No se pudo aplicar: ${result.reason}.`)
    },
    dismissStaff: (id) => {
      const result = dismissStaffRecommendation(id as never)
      setNotice(result.ok ? 'Recomendación descartada; no se ha alterado el dominio recomendado.' : `No se pudo descartar: ${result.reason}.`)
    },
    acceptReport: (id) => {
      try {
        acceptOppositionScoutingReport(id)
        setNotice('Informe aplicado al plan del próximo partido.')
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'No se pudo aplicar el informe.')
      }
    },
    resolveHuman: (situationId, actionId) => {
      const result = decideUserHumanSituation(situationId, actionId)
      setNotice(result.status === 'APPLIED' ? 'Decisión profesional aplicada y registrada en la carrera.' : `No se pudo aplicar: ${result.reason}.`)
    },
    continue: () => {
      void continueGameAsync().then((result) => setNotice(result === null ? 'No se pudo continuar.' : `Continue avanzó ${result.daysAdvanced} día${result.daysAdvanced === 1 ? '' : 's'}.`))
    },
  })

  return (
    <section className="director-hub ng-holo-panel" aria-label="Centro de dirección">
      <div className="director-hub__header">
        <div>
          <p className="director-hub__eyebrow">CENTRO DE DIRECCIÓN</p>
          <h2 className="director-hub__title">Lo que requiere tu atención</h2>
        </div>
        {model.staffActivity === undefined ? null : <p className="director-hub__meta">{model.staffActivity.delegated} responsabilidades delegadas · {model.staffActivity.pending} recomendaciones abiertas</p>}
      </div>
      {notice === null ? null : <p className="director-hub__notice" role="status">{notice}</p>}
      <div className="director-hub__items">
        {model.items.map((item) => <HubItem key={item.id} item={item} onAction={onAction} />)}
      </div>
    </section>
  )
}
