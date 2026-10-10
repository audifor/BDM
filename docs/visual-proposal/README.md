# Propuesta visual BDM OS NG · Courtside

Maquetas HTML renderizadas a PNG de las aplicaciones centrales de BDM OS NG, en la dirección **Courtside** (titulares gigantes en Barlow Condensed, bloques de color, formas redondeadas). No es una implementación: sirve para decidir antes de tocar `src/ui-ng`.

- Índice de imágenes: [CATALOG.md](CATALOG.md)
- Catálogo navegable (artifact privado): https://claude.ai/artifact/SZH82cTKUziJ82vgBTPrPL
- `png/courtside/{dark,light}/{desktop,tablet,mobile}` y `png/actual` (capturas de hoy)

## Decisiones de producto aplicadas

1. **Sin barra lateral.** Barra del sistema arriba, workspace, barra de tareas abajo y menú de inicio (`src/ui-ng/system`).
2. **Sin valoración global.** `docs/autopilot/PRODUCT_GUARDRAILS.md` y `docs/ARCHITECTURE.md` establecen que no existe overall persistido (ni potencial como sistema activo). La maqueta no muestra OVR ni POT: la plantilla usa las siete columnas reales de ratings (FIN, SHO, PMK, PDE, IDE, REB, ATL), cada jugador muestra su mejor atributo y su perfil derivado, y el techo en Jugador es un rango estimado por el scout, no un valor fijo. Las valoraciones de partido (p. ej. 8.8) son por encuentro, no globales.
3. **Barra de tareas fija, estilo Windows.** Alto 68 px, iconos 48 px, solo iconos (el nombre sale al pasar el ratón). Nunca crece: el exceso pasa a «…» con el número.
   - Una app aparece al abrirla y desaparece al cerrarla, salvo que esté anclada.
   - Clic central cierra; clic derecho abre el menú de la app (Activar, Cerrar, Desanclar, Mover); los iconos se reordenan arrastrando.
   - Desde el menú de inicio se ancla por menú contextual o arrastrando una app a la barra o a «Fijadas».
4. **Módulos de talla fija en escritorio.** Un módulo toma una talla del sistema (220, 320, 440, 560, 720, 920 px); con 5 o con 10 elementos ocupa lo mismo y el contenido hace scroll interno. Ver `layoutModules()` en `src/app.js`.
5. **Responsivo por puntos de ruptura.** Escritorio ≥ 1280 px, tablet 700–1279 px, móvil < 700 px.
6. **Dos temas por tokens** (`b.css`).

## Ver en vivo

```
cd docs/visual-proposal/src
python -m http.server 8765
```

`http://localhost:8765/index.html?dir=b&theme=dark&screen=system&tab=arrastrar`

`screen`: system, home, roster, player, tactics, match, schedule, competition, training, staff, finances. `tab`: id de `export const tabs` en cada fichero de `screens/`. `theme`: dark | light.

## Notas

- Datos ilustrativos (Virelia Horizon League, Dunmere Orbits). El dominio financiero existe; las cifras del mockup no están verificadas contra el sembrado. Ver `qa/CERTIFICATION.md` (auditoría de datos).
- Retratos y escudos son SVG generados por código.
- La primera ronda (dirección A, `a.css`) está descartada y no se versiona; la de Courtside es `b.css`.
- Certificación visual de escritorio y scripts en `qa/`. Tablet y móvil están aparcados y sus PNG son anteriores a las correcciones.
- Las fuentes ya estaban en el repo y se copiaron a `src/fonts`.
- `png/` pesa unos 60 MB; si no se quiere versionar binario, dejarlo fuera de git o usar Git LFS.
