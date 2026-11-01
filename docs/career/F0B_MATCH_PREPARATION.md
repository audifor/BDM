# CAREER-F0B · Preparación del próximo partido

El flujo jugable certificado es:

1. `progressDelegatedScouting` prepara una misión acotada sobre jugadores del próximo rival.
2. `progressScoutingAssignments` produce la evidencia y el conocimiento cuando la misión termina.
3. `progressOppositionScoutingReports` construye el informe para el `gameId` siguiente usando únicamente ese conocimiento.
4. Courtside presenta calidad, amenazas conocidas, ritmo y énfasis defensivo; la falta de conocimiento se muestra como falta de evidencia.
5. El entrenador puede aceptar la recomendación, editar el plan A/B o dejar la responsabilidad en manos del staff desde Staff.
6. `acceptOppositionScoutingReport` escribe solo los campos tácticos que tienen correspondencia canónica.
7. `prepareMatchOptions` lee el override guardado y lo entrega a `MatchEngine`/MatchNext.

Los flagged players siguen siendo informativos: no se convierten automáticamente en emparejamientos o titulares.
