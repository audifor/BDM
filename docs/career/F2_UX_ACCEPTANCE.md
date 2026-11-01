# CAREER-F2 · Aceptación UX

## Criterios verificados

- Home conserva el briefing F1 y los módulos existentes.
- El centro aparece como una zona compacta, no como una segunda bandeja de entrada.
- A/B/C/D distingue urgencia, recomendación, ejecución y contexto sin crear reglas nuevas.
- La ausencia de partido, recomendación o staff produce estado vacío factual.
- El informe rival solo aparece cuando existe para el próximo `gameId`.
- Aceptar, ignorar, aplicar, abrir detalle y continuar llaman comandos o navegación existentes.
- Una recomendación aplicada deja de ofrecerse como pendiente; un override táctico existente obliga a revisar el plan.
- Las consecuencias visibles son cohesion, fatiga media, lesiones, sesiones y outcomes reales.

## Casos de borde cubiertos por diseño

No hay próximo partido; no hay recommendations; no hay staff; el usuario controla la responsabilidad; la responsabilidad está delegada/advisory; aparece un breakpoint médico; el plan manual ya existe; doble clic; Save V4 antes/después; carga de save anterior; cambio de club.

Los tres últimos dependen de las autoridades de Store/Save y no de un estado nuevo del panel. El panel se reconstruye cuando cambia `world`, por lo que no conserva referencias obsoletas.

