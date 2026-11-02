# CAREER-F2 · Certificación A/B/C

## Diseño

Se reutiliza el arnés `src/app/game/testSupport/PlayableF2Support.ts`, con `createF2Day0`, `runF2Window`, semillas deterministas por partido y checkpoints Save V4. Las tres carreras parten del mismo día 0, calendario y semilla.

- **A:** responsabilidades iniciales, sin intervención.
- **B:** delegación explícita y aceptación de recomendaciones por comandos existentes.
- **C:** gestión activa y plan táctico del entrenador.

Se miden días, partidos, sesiones ejecutadas, staff ejecutor, estímulo, fatiga, cohesión, scouting, planes consumidos, decisiones y round-trip de persistencia. Los marcadores se reportan como observaciones; no se atribuyen victorias a una acción sin una cadena causal verificable.

## Resultado base reutilizado

El commit F0B ya certificó 4/4 casos de `PlayableF0B.test.ts` y su informe registra las diferencias funcionales: A no ejecuta sesiones del club sin delegación; B ejecuta entrenamiento/scouting y persiste el plan; C mantiene la gestión manual y el plan del entrenador. F2 conserva esas autoridades y añade la observación Home.

En este run `PlayableF0B.test.ts` pasó 4/4 tras 350.97 s. La prueba focal F1/F2 y el lote de regresión contextual también pasaron. La suite global se inició, pero fue interrumpida después de aproximadamente 16 minutos sin resumen de Vitest; se mantiene como no concluyente y no se usa para declarar PASS.

