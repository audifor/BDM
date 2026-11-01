# CAREER-F0B · Autonomía efectiva del staff

La autonomía de F0B es una extensión acotada de los motores existentes:

- `userControlled` sigue sin crear sesiones automáticamente.
- `createTeamTrainingPlan` delegada permite que el planificador semanal existente incluya el equipo del entrenador.
- La planificación conserva sesiones manuales existentes y solo usa fechas elegibles del calendario.
- La ejecución sigue siendo la autoridad única de `ScheduledTrainingEngine`; el staff aporta decisión, asignación y calidad, no un segundo motor de entrenamiento.
- Scouting sigue limitado al próximo rival y a los evaluadores reales del club.
- `oppositionScouting` permanece `advisory`; genera información y no altera tácticas hasta una acción explícita del entrenador.

La corrección de F0B es deliberadamente pequeña: eliminar la exclusión incondicional del equipo del usuario y sustituirla por una comprobación de delegación canónica.
