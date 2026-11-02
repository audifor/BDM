# CAREER-F1 · Arrival flow

## Flujo jugable

```text
New Game / Load Save V4
        ↓
CoachCreator o CoachCareerAppointment
        ↓
Coach + Person + StaffProfile + Employment + CareerHistory
        ↓
queueFirstStaffMeeting (solo si existe un assistant real elegible)
        ↓
Home Courtside: Career arrival briefing
        ↓
contexto de club → responsabilidades → siguiente partido → decisión
        ↓
decideUserCoachStaffMeeting
        ↓
Relationship + Morale + Memory + HRPG + Inbox archivado
        ↓
el briefing deja de ser obligatorio; el jugador puede abrir Staff/Tactics/Training/Match
```

## Qué se presenta

El briefing muestra, cuando existe en el `GameWorld`: identidad y puesto, club, competición/temporada, objetivos Board en curso, número de staff empleado, instalaciones con relación de uso, estado financiero derivado, vacantes abiertas, responsabilidades y titulares, sesiones programadas, próximo rival, disponibilidad del informe de scouting y si el plan táctico tiene override aplicado.

La ausencia de un dato se presenta como no disponible, sin cero decorativo ni persona ficticia. Si el club no tiene assistant elegible, `queueFirstStaffMeeting` no inventa una reunión y el briefing no ofrece una decisión inexistente.

## Primera decisión

Las opciones son las ya definidas por `StaffTrustMeeting`:

- `Ask for input` / `seekInput`.
- `Set direction` / `setDirection`.

La pantalla no escribe relaciones, morale, memorias o HRPG directamente. Usa el action de Zustand que adapta a `resolveHumanCompatibility` y al comando `decideFirstStaffMeeting`.

Tras la decisión, el inbox se archiva, las memorias de ambos participantes quedan registradas y el sistema no puede volver a resolver la misma reunión después de Save V4.

## Relación con F0B

La llegada no sustituye la gestión de F0B. Scouting, Training y Tactics siguen siendo sus espacios de profundidad. La propuesta del rival se genera por `OppositionScoutingReportEngine` durante el calendario; aceptar el informe continúa escribiendo únicamente el `TeamGamePlan` existente, que después consume MatchEngine.
