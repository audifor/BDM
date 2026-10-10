# BDM UI · Contrato conceptual de barras globales Courtside V1

Estado: **propuesta arquitectónica y visual para aprobación**, sin despliegue global. HOME V2 ya utiliza la primera candidata en `feat/bdm-ui-home-redesign`.

## 1. Premisa

Las barras superior e inferior de Courtside son el **marco persistente de toda la experiencia BDM UI**, independientemente de la aplicación abierta. No pertenecen a HOME y no deben montarse por cada página. Solo el contenido central del workspace cambia.

- **Identidad visual**: `docs/visual-proposal/src/app.js`, `src/b.css` (estilo B, barra fija posterior a las reglas antiguas de dock flotante) y `src/art.js` (iconos canónicos).
- **Conducta funcional**: `src/ui-ng/system/SystemBar.tsx`, `Taskbar.tsx`, navegación `NgWorkspaceNavigationProvider.tsx`, `NgStartMenu` y controles de simulación actuales.
- **Límites**: ninguna nueva barra lateral, ningún dock flotante, ninguna reescritura de GameWorld/engine ni sustitución prematura de NG/Legacy.

## 2. Barra superior persistente (SystemBar)

Reproducir **Courtside 1:1**: marca BDM naranja Barlow Condensed, identidad del club y escudo, rol del usuario, chips de competición y temporada, fecha prominente; acciones `Simular hasta…` y `Continuar` contextual con sus estados. Los colores exactos, separación, tipografía, bordes y proporciones salen de Courtside. Sus datos y acciones siguen conectados a NG.

- Una instancia global: no desaparece ni se reinicia al abrir o cambiar aplicaciones.
- El botón principal muestra siempre la acción canónica del breakpoint actual (partido, prensa, nueva temporada, continuar o bloqueado con diagnóstico); no aparenta continuar si no hay destino.
- `Simular hasta…` reutiliza el mismo selector/modal, fechas y cancelación real.
- Mensajes de bloqueo y alertas se muestran sin esconder información crítica para satisfacer una maqueta.
- Los escudos han de provenir de los datos disponibles, no de un club inventado; mientras no exista un asset, marcador de posición explícito.
- Adaptación responsive fiel a las variantes disponibles; los PNG tablet/mobile de `docs/visual-proposal` están pendientes de recertificación.

## 3. Barra de tareas inferior persistente (Taskbar, o barra de inicio)

**Referencia fija y no negociable para escritorio**: barra a lo ancho inferior de 68 px de altura, iconos de 48 px, separación de 6 px, solo iconos (nombre por tooltip), inicio a la izquierda, estado de simulación a la derecha; naranja para aplicación activa y punto bajo las abiertas, apagadas para las fijadas cerradas. Las aplicaciones no hacen crecer la barra: el exceso se agrupa en `…`.

Comportamientos del modelo Courtside+NG:
- Botón de inicio abre/cierra el menú de aplicaciones y categorías, con búsqueda, fijadas y recientes.
- Clic abre/activa; clic central cierra una abierta, si es cerrable.
- Clic derecho ofrece opciones coherentes con el estado: abrir/activar, cerrar, anclar, desanclar y mover.
- Las ancladas permanecen aunque se cierren; las no ancladas desaparecen al cerrarse.
- Arrastrar permite reordenar iconos y fijar desde inicio (pendiente de implementación funcional; no simular un comportamiento inexistente).
- La aplicación activa es única; no duplicar iconos; `…` conserva el acceso a todas las apps excedentes.
- El estado de simulación es real y compartido; no emplear etiquetas estáticas.

## 4. Arquitectura de ejecución prevista (aun no implementada globalmente)

```text
BDM UI Shell persistente
├── SystemBar Courtside (1 instancia / global)
├── Workspace central (app activa: HOME, Roster, Player, ...)
└── Taskbar Courtside (1 instancia / global)
    └── Menú Inicio Courtside (superposición)
```

Usar la navegación existente como autoridad de aplicación abierta/activa, sin perder contextos ni deep-links. Si se desea personalizar fijadas y orden, la persistencia debería especificarse y acordarse primero; hoy el candidato HOME solo tiene anclados por defecto y no implementa el ciclo completo de drag/pin.

El estado visual no debe depender de `app==='home'` en la versión definitiva: migrar posteriormente a un shell BDM UI propio e independiente. Durante la transición coexistirá con NG, nunca se habilitará para todas las aplicaciones NG accidentalmente.

## 5. Criterios de aceptación

1. Capturas de barra superior, barra fija e Inicio comparadas a 1920 px y variantes claro/oscuro con imágenes Courtside oficiales; 1:1, no aproximadas.
2. La misma barra aparece y mantiene estado al transitar entre HOME, Plantilla, Jugador, Staff, Partido y demás secciones.
3. Paridad de abrir/cerrar, pin, reordenar, overflow, menú derecho, clic central, búsqueda, navegación y atajos.
4. Simulación, interrupciones y diagnósticos usan GameWorld en tiempo real.
5. Sin alteraciones en dominio, engine, Save, otras ramas o main.
6. Ensayos desktop, tablet y móvil, incluido teclado y accesibilidad básica.
7. Aprobación visual explícita antes de integración.

## 6. Alcance de esta iteración

- **Implementado solo para HOME**: primera apariencia Courtside y barra inferior fija; iconos copiados del original, datos reales NG.
- **Pendiente**: convertirlo en shell global de BDM UI, completar interacciones del menú y gestión pin/drag, implementar tema claro y certificar visualmente. Nada de ello se da por PASS todavía.
- **HOME V2 aprobada**: clasificación columna izquierda completa; próximo partido fila 1 de las dos columnas derechas; Dinámicas filas 2-3 columna central; Próximos fila 2 derecha; Finanzas fila 3 derecha; Líderes (4) fila 4 central; Objetivos fila 4 derecha.
