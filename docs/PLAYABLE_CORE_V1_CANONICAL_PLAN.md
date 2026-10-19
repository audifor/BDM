# BDM · PLAYABLE CORE V1 · PLAN CANÓNICO

- Estado: PROPUESTA PARA ADOPCIÓN, no implementación certificada.
- Fecha: 2026-10-19.
- Repositorio: `audifor/BDM`.
- Rama documental: `plan/playable-core-v1-20261019`.
- Alcance: una experiencia de club profesional FIBA con ACB 2026/27 como universo piloto.
- Prioridad: terminar el manager base antes de ampliar su profundidad.
- Autoridades vigentes: `GameWorld`, `CalendarEngine`/continuación diaria, simulador canónico de partidos, servicios de aplicación, `Save V4`, Courtside como experiencia visual; no crear versiones paralelas.

## 1. Definición de terminado

La V1 estará terminada cuando un jugador pueda crear un entrenador, elegir uno de los 18 clubes del universo piloto, gestionar plantilla, tácticas, entrenamiento, contratos y presupuesto, jugar o simular partidos, recorrer el calendario completo, terminar una temporada, iniciar la siguiente y repetir sin acciones técnicas externas. Las decisiones deben tener efectos verificables y sobrevivir al guardado y carga.

La prueba de producto será completar **dos temporadas consecutivas** en el ejecutable de Windows, con participación manual en partidos y decisiones, y un recorrido automatizado determinista reproducible. No se exigirá disponer de 190 países, NBA, NCAA o todos los niveles BS/BT/MX futuros para declarar jugable esta V1.

Una liga piloto no significa fijar una arquitectura monoliga: los datos de liga, formato, reglas y calendario se resuelven desde contratos canónicos existentes.

## 2. Política de alcance

### Obligatorio para V1

1. Inicio de partida, entrenador, club y mundo jugable.
2. Plantilla, elegibilidad, quinteto, banquillo y rotaciones persistentes.
3. Tácticas utilizables por el simulador, no solo visuales.
4. Partido completo, acta, estadísticas, resultado y consecuencias.
5. Continuación diaria con calendario real, breakpoints y acciones pendientes.
6. Entrenamiento, cansancio, lesión, recuperación y disponibilidad.
7. Búsqueda de jugadores, scouting esencial, negociación, contratos, altas y bajas.
8. Presupuesto y contabilidad económica mínima coherente.
9. Staff operativo y delegación básica.
10. Competiciones, clasificación, IA rival y finalización de temporada.
11. Objetivos y evaluación de la directiva.
12. Offseason, renovación de temporadas y continuidad de carrera.
13. UI Courtside completa para los recorridos obligatorios y Save V4.

### No bloqueante para V1

- WorldDB global y ejecutable generador universal.
- NBA con trades/draft/cap completo; NCAA con Recruiting, NIL y Portal.
- Desarrollo completo de HRPG/PERSON50, conflictos políticos y narrativa avanzada.
- Laboratorio Training granular, Pizarra Viva completa y nuevos diseñadores tácticos.
- Facilities avanzadas y simulación empresarial granular.
- Mejoras de representación 3D y repertorio de técnicas más allá del conjunto canónico verificable.
- Ecosistemas nacionales adicionales, selecciones, copas/continentales no necesarios para la liga piloto.

Estas áreas no se eliminan ni se rehacen. Permanecen en sus programas existentes y se integran después sobre el mismo núcleo.

## 3. Reglas técnicas que no se pueden negociar

1. **Reutilizar antes de construir.** Buscar autoridad, dominio, servicio, proyección y test existentes antes de añadir código.
2. **Una fuente de verdad.** UI -> Application -> Engine -> Domain. Zustand no crea reglas ni estados duplicados.
3. **Partido real.** El camino jugable usa el simulador canónico existente. No fabricar resultados/estadísticas para desbloquear pantallas.
4. **Datos reales de la partida.** Los datos sintéticos identificados del piloto son válidos; los arrays hardcoded presentados como datos del mundo no lo son.
5. **Persistencia real.** Cada acción relevante se guarda y recarga mediante Save V4, sin formatos alternativos ad hoc.
6. **Courtside es la capa visual final.** Migrar solo con paridad funcional. Mantener NG únicamente como referencia temporal de funcionalidad, no como navegación obligatoria en el producto certificado.
7. **No crear otro framework transversal.** Sin nuevo plugin loader, motor RPG, eventos paralelos, scheduler paralelo ni configuración de docenas de niveles.
8. **Separación de proyectos.** Los generadores WorldDB avanzan en BDM-DB. Playable Core solo define y certifica su entrada compatible; no bloquea el juego esperando su cierre global.
9. **Integración pequeña y continua.** Una PR por entrega jugable con pruebas; CI global debe permanecer verde.
10. **Evidencia antes de PASS.** Un test unitario no equivale a una experiencia jugable: exigir observación en UI y resultado canónico.

## 4. Ejecución por fases

### F0 · Base certificable y universo piloto

**Propósito:** disponer de un estado de `main` reproducible en el que puedan integrarse recorridos completos.

Implementar o reparar:
- Confirmar HEAD actual, CI global, estado real de PR #160 y regresiones de Courtside y Save V4; reparar sin desactivar suites.
- Hacer inventario de rutas del usuario y contratos canónicos de Home, Roster, Tactics, Match, Calendar, Competition, Training, Medical, Market, Finance, Staff, Board, Save.
- Declarar para cada ruta: REAL, PARCIAL o HARDCODED, con dueño de servicio y test.
- Crear o fijar una fixture de partida jugable ACB 2026/27 con 18 clubes, plantillas elegibles, entrenadores/staff mínimos, contratos, presupuesto y calendario consistente. Usar importación real o datos sintéticos explícitos; no inventar jugadores reales.
- Garantizar que abrir dicha partida y guardarla no requiere WorldDB-DB global ni scripts manuales del usuario.

PRs previstas: `PC0-A` baseline/CI, `PC0-B` universo piloto, `PC0-C` mapa de rutas y reparación de bloqueos de inicio.

**Gate F0:** suite global PASS; `create -> load GameWorld -> enter Courtside -> save -> reload` PASS; 18 clubes y partidos programados válidos, sin datos ficticios camuflados.

### F1 · Un partido completo

**Propósito:** primera experiencia jugable de 10-20 minutos.

Implementar o conectar:
- Elegir equipo, abrir plantilla, seleccionar quinteto elegible y rotación, y conservar la selección.
- Abrir Tactics con exactamente la misma selección. Aplicar plan táctico canónico al encuentro.
- Preparar el próximo partido, iniciarlo, visualizarlo o simularlo, aplicar resultado una sola vez.
- Publicar acta, estadísticas, resultado, historial y cambio de clasificación en Competition y Home.
- Persistir antes/después del encuentro con Save V4 y comprobar identidad de estado.

PRs: `PC1-A` arranque club/roster, `PC1-B` roster-tactics-match, `PC1-C` match-results-competition, `PC1-D` save post-match.

**Gate F1:** una prueba manual y una E2E automatizada `start -> choose lineup -> play -> view table -> save/reload`; el resultado y clasificación coinciden exactamente después de recargar. No se acepta una tabla que lee fixtures de PCB/hardcode. Reutilizar el alcance de issue #22 si falta reparar.

### F2 · Una semana de gestión

**Propósito:** ciclo cotidiano repetible y comprensible.

Implementar o conectar:
- Continue/advance day sin dobles ejecuciones y con breakpoints relevantes navegables.
- Calendario de encuentros, entrenamientos y decisiones; avisos o Inbox sobre eventos reales.
- Entrenamiento colectivo e individual programable y ejecutado en el día correcto.
- Disponibilidad, lesión, recuperación y fatiga relevantes para selección/partido, sin afirmar efectos no implementados.
- Responsables de staff, delegación de entrenamiento y recomendaciones mínimas.
- Inicio de partido sucesivo usando los cambios realizados en los días previos.

PRs: `PC2-A` daily progression/alerts, `PC2-B` training/medical continuity, `PC2-C` staff delegation and observable outcomes.

**Gate F2:** avanzar al menos 30 días con varios encuentros, entrenamiento ejecutado y un escenario controlado de lesión; sin partidos repetidos, sin pérdida de estado, sin operaciones ocultas; salvar y recargar a mitad del periodo.

### F3 · Un mes de gestión económica y deportiva

**Propósito:** decisiones de fichajes con consecuencias en roster y finanzas.

Implementar o conectar:
- Mercado global con filtros básicos: posición, nivel, contrato, disponibilidad, presupuesto.
- Scouting con conocimiento observado, sin revelar rating oculto de un externo no conocido.
- Oferta/negociación/aceptación/rechazo mediante autoridad contractual existente.
- Alta y baja en plantilla, elegibilidad, masa salarial y dinero comprometido reflejados.
- Presupuesto de fichajes y salarios visible al decidir; gastos e ingresos reales de fuentes canónicas, sin ceros engañosos.
- Contratación/delegación básica de staff con coste y autoridad existentes.

PRs: `PC3-A` search-scout-offer, `PC3-B` signed-player-roster-budget, `PC3-C` finance-staff minimum product UX.

**Gate F3:** fichar, liberar y renovar al menos un jugador, además de rechazar una operación inválida por fondos/reglas; comprobar los cambios en roster, finanzas, competición y Save V4. Clubes IA pueden mantener plantillas viables sin intervenciones manuales.

### F4 · Una temporada completa

**Propósito:** que el universo se comporte como una competición deportiva.

Implementar o conectar:
- Calendario de los 18 clubes consistente, resultados de IA y clasificatorias desde fuentes canónicas.
- Tabla, desempates y clasificación final según reglas del piloto; fase final/playoffs solo si el formato cargado los requiere.
- IA rival mínima suficiente para quintetos, bajas, contratos y continuidad competitiva.
- Objetivos Board, evaluación y decisiones básicas del entrenador durante el curso.
- Consecuencias del partido y decisiones aplicadas al estado de plantilla, entrenamiento, finanzas y moral que ya soporte el canon.

PRs: `PC4-A` Competition/season schedule, `PC4-B` autonomous clubs, `PC4-C` board & season finalization.

**Gate F4:** desde el día inicial hasta el último encuentro, todos los clubes completan su temporada, no hay partidos sin resolución injustificada, aparece un campeón y la clasificación es reproducible con la misma seed. UI y GameWorld coinciden.

### F5 · Segunda temporada y continuidad

**Propósito:** pasar de simulador de una temporada a manager de carrera.

Implementar o conectar:
- Rollover del año una sola vez: historial inmutable, campeones, contratos vencidos/renovaciones.
- Mantenimiento de plantillas y personal por IA, altas y bajas, reemplazos válidos cuando proceda.
- Nuevo calendario y edición de competición usando las autoridades de formato existentes.
- Evaluación profesional, continuidad o salida del entrenador, y selección de siguiente etapa cuando proceda.
- Compatibilidad de guardados creados antes y después del salto.

PRs: `PC5-A` offseason contract lifecycle, `PC5-B` next season/AI roster, `PC5-C` coach career + Save lifecycle.

**Gate F5:** completar dos temporadas y arrancar una tercera con plantillas legales, temporadas diferenciadas, históricos preservados, clasificación reiniciada para la nueva edición y sin duplicar efectos financieros o anuales. Guardado/carga durante offseason PASS.

### F6 · Courtside de producto y release jugable

**Propósito:** que el usuario use toda la V1 desde un solo ejecutable.

Implementar o conectar:
- Todas las rutas críticas exclusivamente en Courtside; sin acciones muertas, contenidos demo no marcados ni pantallas NG obligatorias.
- Corregir contraste modo claro/oscuro, truncados, densidad excesiva, scroll redundante y navegación principal.
- Errores recuperables y explicados para falta de fondos, disponibilidad de jugadores, juego guardado corrupto o datos de entrada insuficientes.
- Ejecutable Windows Tauri con creación/continuación de partida y guardado real.
- Prueba automatizada determinista de dos temporadas + prueba manual completa por usuario + regresión visual de vistas críticas.
- Registrar rendimiento observable, pero sin comprometer límites inventados antes de medir el build en máquina de referencia.

PRs: `PC6-A` Courtside parity, `PC6-B` release/error handling, `PC6-C` full acceptance and packaging.

**Gate F6:** todas las condiciones de la definición de terminado se ejecutan por UI sin GitHub, scripts, SQL ni acciones manuales sobre ficheros. `main` PASS global y ejecutable certificado.

## 5. Contrato de expansión posterior

Una ampliación es compatible cuando:
- Aprovecha entidades/autoridades existentes o añade campos versionados mediante cambios aditivos.
- Consume el calendario y GameWorld existentes; no crea un segundo reloj ni segunda fuente de datos.
- Expone reads/commands mediante Application y respeta guardados anteriores.
- Ofrece UI Courtside propia o extensión controlada de una pantalla existente.
- Su ausencia no rompe F0-F6 y sus casos de prueba no degradan el núcleo.
- Se activa por compatibilidad/datos/contexto del universo, no por un ecosistema de plugins inventado.

Orden de incorporación orientativo: WorldDB completo por importación; NBA/trades/draft; NCAA/recruiting/NIL; ecosistemas FIBA adicionales; expansión HRPG/PERSON50; profundización Training/Tactics/MatchEngine; Facilities/Finance avanzados.

## 6. Gestión en GitHub

- Este archivo es la propuesta de fuente única para **Playability V1** una vez aceptado y fusionado.
- Crear una issue principal `PLAYABLE CORE V1` con fases F0-F6 y 7 hitos, enlazando issues actuales en vez de duplicarlos.
- Trabajar con ramas `playable/pcN-<scope>` desde `main`. Sin una rama gigante de integración de todo el programa.
- PR con: recorrido de usuario, autoridad reutilizada, cambio efectivo, tests, captura o evidencia visual, Save V4, efectos cruzados y rollback.
- Todo trabajo requiere `typecheck`, `build`, tests focales, CI global aplicable y smoke manual de Courtside. Los tests E2E de fase son obligatorios.
- Estados de entrega: `NOT_STARTED`, `IN_PROGRESS`, `TECH_PASS`, `PLAYABLE_PASS`, `BLOCKED`. `TECH_PASS` no equivale a `PLAYABLE_PASS`.
- En caso de conflicto entre nueva profundidad de un módulo y cierre del ciclo jugable, prevalece la entrega que habilita F0-F6.

## 7. Primera tanda ejecutable

1. `PC0-A`: verificar el estado real de `main`, CI y PR #160 y cerrar regresiones sin silenciar suites.
2. `PC0-B`: fixture reproducible de ACB 2026/27 válida como `GameWorld` con guardado/carga.
3. `PC1-A/B`: entrenador/club/roster y quinteto táctico compartido.
4. `PC1-C`: partido real -> estadísticas -> clasificación y próximo partido de Home.
5. `PC1-D`: Save V4 antes/después de partido; smoke manual con el ejecutable Windows.

No iniciar mejoras de sistemas avanzados mientras el recorrido F1 no cumpla su gate.

## 8. Anclajes existentes (verificar estado actual antes de actuar)

- `docs/ARCHITECTURE.md`: fronteras canónicas.
- `docs/strengthening/reviewed/BS0_GAMEPLAY_MANIFESTATION_MATRIX.md`: manifestación por sistema, revisar por su antigüedad.
- [Issue #22](https://github.com/audifor/BDM/issues/22): Competition UI frente a GameWorld.
- [Issue #126](https://github.com/audifor/BDM/issues/126): Training Studio P0.
- [Issue #139](https://github.com/audifor/BDM/issues/139): Player técnicas/Match Next.
- [PR #160](https://github.com/audifor/BDM/pull/160): regresiones tras Courtside, verificar merge y validación.
- Proyecto paralelo `audifor/BDM-DB`: generadores y WorldDB V2; dependencia de datos opcional hasta que su salida esté certificada.

El roadmap solo fija fases de entrega, no certifica como pendiente todo lo mencionado. Cada subentrega empieza auditando qué funciona **actualmente en main** y solo implementa la diferencia necesaria para pasar el gate.
