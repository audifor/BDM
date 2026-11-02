/**
 * F3 · the outcome of the last Market / Contracts command, in the manager's words. Commands used to be silent when the authorities
 * refused them (Finance, Governance, lifecycle); the user now always learns what happened and why. Pure presentation of canonical
 * statuses and reason codes: no rule lives here.
 */
export interface MarketNotice {
  readonly kind: 'info' | 'error'
  readonly text: string
}

const REFUSAL_TEXT: Readonly<Record<string, string>> = Object.freeze({
  FINANCIAL_BLOCK: 'Finance rechaza la operación: falta autorización o capacidad económica para su partida. El margen salarial, las compensaciones y la caja se comprueban por separado.',
  STALE_PLAN_OR_PROPOSAL: 'La propuesta ya no está vigente; vuelve a evaluar al jugador.',
  PLAYER_NOT_FREE_AGENT: 'El jugador ya no es agente libre.',
  NO_EXECUTION_OWNER: 'Nadie tiene autoridad para ejecutar esta operación.',
  NO_AUTHORITY: 'No tienes autoridad institucional para esta operación.',
  REQUIRES_APPROVAL: 'Falta la aprobación de Governance antes de poder firmar.',
  NOT_ACCEPTED: 'El jugador aún no ha aceptado las condiciones.',
  CONTACT_NOT_POSITIVE: 'El jugador no ha aceptado hablar con el club.',
  NOT_READY: 'La oferta aún no está preparada: falta información.',
  LIFECYCLE_CONFLICT: 'Ya existe una negociación en curso para este jugador.',
  ACTIVE_NEGOTIATION_EXISTS: 'Ya existe una negociación en curso para este jugador.',
  RETENTION_WINDOW_CLOSED: 'La ventana de renovación de este contrato no está abierta.',
  EFFECTIVE_CONTRACT_RULES_UNAVAILABLE: 'No hay reglas salariales vigentes para validar el nuevo contrato.',
  COOLDOWN_ACTIVE: 'Hay un periodo de espera tras la última negociación de este contrato.',
  OPEN_NEGOTIATION_EXISTS: 'Ya hay una renovación en curso para este contrato.',
  CONTRACT_TERM_NOT_LEGAL: 'La duración propuesta no es legal según las reglas vigentes.',
  PLAYER_NOT_CONTRACTED: 'El jugador no tiene contrato con ningún club: es un agente libre.',
  OWN_PLAYER: 'El jugador ya pertenece a tu club.',
  NOT_FOUND: 'No se encuentra la operación.',
  NOT_AGREED: 'Faltan acuerdos: tienen que estar de acuerdo el club vendedor y el jugador.',
  GOVERNANCE_DENIED: 'El consejo ha denegado la autorización: no se mueve nada.',
  GOVERNANCE_REQUIRED: 'Falta la autorización del consejo antes de completar el traspaso.',
  CONTRACT_CHANGED: 'El contrato del jugador con su club ya no es el que se negoció.',
  INTEGRITY_INVALID: 'La plantilla o el contrato del jugador no están en un estado coherente: no se mueve nada.',
  ROSTER_MINIMUM: 'El club vendedor se quedaría por debajo de su plantilla mínima.',
  FINANCE_REJECTED: 'Finance rechaza el traspaso: no hay autorización o liquidez suficiente. No se ha movido ni cobrado nada.',
  INVALID_TERMS: 'Las condiciones propuestas no son válidas (salario y años deben ser enteros positivos).',
  BLOCKED: 'La operación está bloqueada.',
  UNKNOWN: 'La autoridad necesaria no está definida para esta operación.',
})

export const marketInfo = (text: string): MarketNotice => Object.freeze({ kind: 'info', text })
export const marketRefusal = (status: string, reason?: string): MarketNotice => Object.freeze({
  kind: 'error',
  text: `${REFUSAL_TEXT[status] ?? `Operación no realizada (${status}).`}${reason === undefined || reason === '' ? '' : ` Motivo: ${reason}.`}`,
})
