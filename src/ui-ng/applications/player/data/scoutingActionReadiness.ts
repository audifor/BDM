/**
 * PLAYER Scouting Report readiness explanation.
 * This is presentation only: domain authorization remains in requestPlayerScouting.
 * Never widen addressability or grant evaluator capacity from the UI.
 */
export type ScoutingReadinessCode =
  | 'NO_TEAM'
  | 'ASSIGNMENT_IN_PROGRESS'
  | 'NOT_ADDRESSABLE'
  | 'NO_ELIGIBLE_SCOUT'
  | 'READY'

export interface ScoutingReadinessInput {
  readonly hasUserTeam: boolean
  readonly activeMissionLabel: string | null
  readonly addressable: boolean
  readonly hasQuickScout: boolean
  readonly hasFullScout: boolean
}

export function getScoutingActionReadiness(input: ScoutingReadinessInput): {
  readonly code: ScoutingReadinessCode
  readonly canRequest: boolean
  readonly recommendedMission: 'QUICK_LOOK' | 'FULL_REPORT' | null
  readonly title: string
  readonly description: string
} {
  if (!input.hasUserTeam) {
    return {
      code: 'NO_TEAM', canRequest: false, recommendedMission: null,
      title: 'Sin club gestionado',
      description: 'Necesitas un equipo controlado por tu entrenador para crear asignaciones de scouting.',
    }
  }
  if (input.activeMissionLabel !== null) {
    return {
      code: 'ASSIGNMENT_IN_PROGRESS', canRequest: false, recommendedMission: null,
      title: 'Evaluación en curso',
      description: input.activeMissionLabel + '. Avanza los días de juego para que el scout produzca el informe. Puedes cambiar la prioridad o cancelar la asignación.',
    }
  }
  if (!input.addressable) {
    return {
      code: 'NOT_ADDRESSABLE', canRequest: false, recommendedMission: null,
      title: 'Jugador todavía no investigable',
      description: 'Este jugador no está entre las identidades accesibles para tu club. Un rival visible en su ficha no siempre está habilitado para scouting: revisa próximos rivales, jugadores conocidos, mercado y descubrimientos en el centro de Scouting.',
    }
  }
  if (!input.hasQuickScout && !input.hasFullScout) {
    return {
      code: 'NO_ELIGIBLE_SCOUT', canRequest: false, recommendedMission: null,
      title: 'Sin scout elegible o con capacidad',
      description: 'Ningún empleado asignado a scouting tiene capacidad para Quick Look o Full Report. Revisa Staff, asignaciones y carga de trabajo antes de solicitar el informe.',
    }
  }
  return {
    code: 'READY', canRequest: true,
    recommendedMission: input.hasQuickScout ? 'QUICK_LOOK' : 'FULL_REPORT',
    title: 'Listo para evaluar',
    description: 'Puedes crear una misión de scouting real. El conocimiento llegará al completarse el informe tras avanzar los días de juego.',
  }
}
