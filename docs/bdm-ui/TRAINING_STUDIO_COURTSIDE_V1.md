# Training Studio · Courtside V1 (integración inicial)

Rama: `feat/bdm-ui-courtside`. No modifica `main`.

## Implementado

- Entrada principal Training Studio con cinco pestañas: Planificador, Individual, Desarrollo, Mentoring y Resultados.
- Microciclo semanal con sesiones reales; navegación mensual y temporada.
- Macrociclos, mesociclos, objetivos personales y grupos de mentoring persistidos en `GameWorld` y Save V4.
- Generación de sesiones de mesociclo mediante módulos de `TRAINING_CATALOG`, con validación de fecha, calendario, colisión y autorización canónicas. No sobreescribe sesiones existentes.
- Gestión directa de sesiones, módulo individual y personalización de fases.
- Resultados basados en sesiones ejecutadas, historial real y fatiga.
- Todas las funciones anteriores de Training accesibles desde Módulos / Staff y Gestión detallada.
- Mentoring desaparece del menú; `app=mentoring` sigue abriendo la nueva pestaña por compatibilidad.

## Límites y pasos imprescindibles antes de certificar

- El árbol visual del legado está implementado como registro persistente de vínculos. registra ahora interacciones profesionales mensuales y mejoras acotadas de hábitos/persona cuando el mentor tiene suficiente ventaja. No transfiere atributos deportivos ni integra aprendizaje táctico con MatchEngine.
- Objetivos individuales fijan una meta de dirección, **no alteran** los límites de potencial ni el motor de desarrollo.
- El generador de temporada es determinista por regla martes/jueves; no optimiza cuantitativamente microciclos ni crea sesiones en días de partido. No programa individual/mentoring automáticamente.
- Pizarra Viva y Laboratorio requieren integración bidireccional con Playbook y MatchEngine; no se ha fingido esa conexión.
- Faltan typecheck/build/Vitest desde una instalación local del repositorio, ejecución real Save/Load, revisión de temas y captura visual. Este commit **no** equivale a certificación.
- La lógica antigua de Training y Mentoring no se elimina, para conservar comportamiento NG/Legacy y compatibilidad; el acceso canónico se unifica en Training Studio.
- Verificar estilos heredados al abrir el panel avanzado y las prioridades de densidad en diferentes resoluciones.

## Corrección de información sobre lesiones

El catálogo anterior incluía una anotación obsoleta: el riesgo relativo de lesión **sí** alimenta `trainingInjuryProbability` desde `ScheduledTrainingEngine`. La UI nunca debe convertir `injuryRiskWeight` en probabilidad porcentual de lesión. Se corrigieron comentario y etiqueta de catálogo.

## Mentoring V1 / impacto jugable

`progressTrainingMentoring` se ejecuta dentro de la fase `TRAINING` de `CalendarEngine`. Usa checkpoints de cuatro semanas, solo jugadores del club, relaciones bidireccionales y eventos deterministas. Aporta, como máximo, 1 punto de una dimensión de personalidad por checkpoint cuando existe ventaja suficiente del mentor. Bajo conflicto de temperamentos, registra fricción sin mejora. Los eventos se almacenan en `relationshipsByKey` y bloquean ejecución duplicada el mismo día. Los atributos deportivos y el potencial no se modifican. Falta validación en partidas largas y Save/Load antes del PASS global.

## Conexión de planificación con la Pizarra

Los mesociclos pueden asociar por ID una jugada real guardada desde Tactics Designer. El vínculo se guarda en el mismo Save V4. Se puede abrir la Pizarra y seleccionar la jugada desde el editor de mesociclos. El laboratorio muestra factores reales de estímulo, fatiga y carga para un ejercicio, nunca predicciones ni porcentajes de lesión. **El vínculo de jugada no modifica todavía la familiaridad del MatchEngine; requiere certificación del puente Tactics/MatchEngine antes de activarlo.**
