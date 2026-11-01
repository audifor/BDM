# CAREER-F2 · Centro de dirección contextual

## Contrato

`buildDirectorHubModel` es un read-model de Home. No crea una cola de decisiones, no persiste derivados y no ejecuta simulación. Solo proyecta `GameWorld` y las queries/comandos canónicos.

La presentación mantiene la jerarquía de dirección:

- **A · Decisión:** breakpoint que realmente detiene Continue, incluido el partido del usuario.
- **B · Recomendación:** advisory del staff o informe de oposición del próximo rival. Solo aparece si existe el registro real.
- **C · Trabajo ejecutado:** sesión de entrenamiento completada o outcome de staff aplicado.
- **D · Contexto:** próximo partido, cohesión, fatiga media y lesiones activas.

## Acciones

Las acciones del panel se limitan a seams existentes:

- Aceptar o ignorar un advisory usa `acceptStaffRecommendation` / `dismissStaffRecommendation`.
- Aplicar scouting usa `acceptOppositionScoutingReport`; si ya existe override se ofrece revisar Tactics para evitar una segunda aplicación ciega.
- Resolver, modificar o delegar abre la superficie especializada existente.
- Continuar usa `continueGameAsync` y conserva `ContinueFlow` como autoridad temporal.

Los clics repetidos son idempotentes por los comandos existentes y, tras el primer cambio, el modelo deja de ofrecer la misma acción o muestra el rechazo canónico.

## Archivos

- `src/ui-ng/applications/home/directorHubModel.ts`
- `src/ui-ng/applications/home/DirectorHubPanel.tsx`
- `src/ui-ng/applications/home/director-hub.css`
- montaje en `HomeWorkspace.tsx`

