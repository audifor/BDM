# BDM · PLAYABLE CORE V1 · PLAN CANÓNICO DE EJECUCIÓN

**Fecha:** 2026-10-19  
**Estado:** propuesto en PR documental, sin cambios de implementación en `main`.  
**Objetivo:** terminar un manager de baloncesto funcional antes de ampliar la simulación.

## 1. Resultado final, sin ambigüedad

BDM V1 debe permitir desde un **único ejecutable de Windows**:
1. Crear entrenador, elegir club y comenzar una partida ACB 2026/27 con 18 clubes.
2. Consultar y gestionar plantilla, quintetos, rotaciones, tácticas y entrenamientos.
3. Jugar o simular encuentros, ver acta y estadísticas, y comprobar el resultado y clasificación reales.
4. Avanzar el tiempo, resolver avisos, lesiones y disponibilidad, y delegar funciones básicas.
5. Buscar, evaluar, fichar, renovar y liberar jugadores, respetando contratos y presupuestos.
6. Gestionar staff, finanzas y objetivos de la directiva en sus decisiones esenciales.
7. Terminar la temporada, iniciar la siguiente y continuar la carrera.
8. Guardar, cerrar, cargar y seguir sin perder decisiones ni alterar resultados.

**Prueba final:** completar dos temporadas seguidas y comenzar una tercera, con simulación determinista automatizada y prueba jugable por interfaz. No se requiere NBA, NCAA, WorldDB global ni RPG avanzado para ese PASS.

La liga ACB es el **universo piloto**, no un motor monoliga. Reglas, calendarios, formatos y equipos se leen desde estructuras canónicas existentes. Se admite población sintética identificada para probar si los datos reales siguen incompletos; nunca se mostrará como información real.

## 2. Regla absoluta de ejecución

**SOLO F0, F1, F2, F3, F4, F5 y F6. Sin PC0-A/B, P0.1, D5A ni ningún nuevo identificador de subfase.**

- **Una fase = un resultado verificable, una rama, una PR, una prueba de aceptación.** Los desarrollos, ajustes y regresiones necesarios se resuelven en esa misma fase.
- Antes de tocar código, hacer un reconocimiento **acotado** del `main` actual: qué piezas ya funcionan, cuál es la autoridad canónica, cuál es el fallo reproducible y qué archivos hay que modificar. Ese reconocimiento **forma parte de la fase**, no genera otra fase ni un proyecto de auditoría.
- Dentro de la PR se permiten tantos commits y tests como sean necesarios. **No se abre otra PR por un fallo de la propia fase** salvo bloqueo técnico demostrado que exija un arreglo independiente del repositorio; en ese caso, se documenta el bloqueo y se retoma la misma fase, sin inventar fases nuevas.
- **No implementar nada que ya esté completo.** Conectar primero las piezas existentes. Cada nueva entidad/servicio debe justificar por qué no sirve la autoridad actual.
- **Probar por Courtside en la misma fase.** La interfaz no se deja para F6. F6 solo cierra defectos globales, empaquetado y certificación.
- Usar un solo `GameWorld`, avance canónico diario, motor de partidos vigente, servicios `Application` y `Save V4`. No crear motor paralelo, segundo calendario, capa de mocks productivos ni sistema universal de plugins.
- Integrar con `main` únicamente tras CI y prueba funcional de la fase. Mantener `main` verde; no silenciar suites, no ocultar fallos, no declarar PASS técnico como PASS jugable.
- Si una condición de aceptación falla, **la fase sigue abierta y se repara ahí mismo**. No se anuncia «terminado» ni se propone una nueva subfase para completarla.
- Si aparece una dependencia verdaderamente externa e irresoluble, registrar **bloqueo específico con evidencia y solución mínima**; no empezar otros sistemas arbitrarios ni rebautizarla.
- La referencia vigente es siempre el **HEAD real de main al iniciar la fase**, no una auditoría antigua ni una lista histórica de ramas.

## 3. Las siete fases

| Fase | Entrega única | Prueba determinante |
|---|---|---|
| **F0** | Base estable y partida piloto válida | Crear partida ACB 18 clubes, entrar en Courtside, guardar y cargar. CI verde |
| **F1** | Partido jugable e integrado | Plantilla -> tácticas -> partido -> estadísticas -> clasificación -> Save V4 |
| **F2** | Gestión diaria funcional | 30 días, entrenamientos, staff, lesiones, avisos y encuentros consecutivos sin errores |
| **F3** | Gestión de mercado y dinero | Fichar, renovar, liberar y rechazar operaciones inválidas con consecuencias económicas y deportivas |
| **F4** | Temporada completa | Todos los clubes compiten, clasificación correcta, campeón, IA y Board funcionales |
| **F5** | Carrera y continuidad | Dos temporadas terminadas, tercera iniciada, contratos, plantillas, históricos y guardados coherentes |
| **F6** | Producto Windows certificado | Recorrido íntegro desde Courtside, sin acciones técnicas externas ni UI ficticia |

### F0 · Partida piloto y base estable

**Trabajo incluido:** comprobar `main` y CI; solucionar regresiones de Courtside y Save V4; usar o adaptar el universo ACB 2026/27 con 18 equipos, rosters elegibles, contratos, staff mínimo, calendario y reglas; conectar su arranque y guardado. El inventario se limita a detectar bloqueos del recorrido, no a auditar todo el juego otra vez.

**PASS:** CI global verde. Abrir el ejecutable, crear entrenador, elegir un club, iniciar el mundo piloto, entrar en Home, guardar y cargar. Sin datos de ejemplo falsamente presentados como datos de la partida. **No depender de terminar BDM-DB.**

### F1 · Partido jugable completo

**Trabajo incluido:** selección de quinteto y rotaciones compartida entre Roster y Tactics; plan táctico que alcance al simulador; iniciar encuentro; jugar o simular; acta y estadísticas reales; resultado aplicado una sola vez; calendario, Home y Competition actualizados desde `GameWorld`; Save V4.

**PASS:** desde Courtside, seleccionar quinteto, cambiar táctica, jugar el siguiente partido, ver acta y nueva clasificación, cerrar y recargar. Los mismos resultados se conservan. Se reutiliza la solución de [issue #22](https://github.com/audifor/BDM/issues/22) donde todavía haga falta.

### F2 · Gestión de 30 días

**Trabajo incluido:** avanzar días; calendario/inbox de hechos canónicos; entrenamiento colectivo e individual y su ejecución; lesiones, recuperación y disponibilidad; staff/delegación básica; próximo partido coherente con las decisiones previas.

**PASS:** recorrer 30 días con varios partidos, ejecutar al menos un entrenamiento y un escenario controlado de lesión, usar una delegación y guardar/cargar a mitad del recorrido. Sin días, eventos o partidos duplicados; las decisiones producen efectos verificables.

### F3 · Mercado, contratos y finanzas operativas

**Trabajo incluido:** búsqueda y filtros, conocimiento de scouting real, ofertas, negociación, firma, renovaciones, bajas, elegibilidad, presupuesto de fichajes/salarios e ingresos/gastos existentes; staff contratacional mínimo. No crear otra economía ni revelar habilidades ocultas.

**PASS:** fichar, renovar y liberar; intentar una operación inválida por presupuesto o regulación y verla rechazada con explicación. El dinero, roster, elegibilidad y Save V4 coinciden después de cada operación.

### F4 · Temporada completa

**Trabajo incluido:** partidos de los 18 clubes y resultados IA; reglas de tabla, desempates y cierre de competición; plantillas IA viables; objetivos y evaluación Board; campeón e históricos al finalizar.

**PASS:** la temporada 2026/27 acaba desde un estado inicial reproducible sin editar datos ni saltar jornadas. Ningún club presenta partidos por resolver sin justificación. Tabla, resultados, campeón e historial coinciden con `GameWorld` y son deterministas con la misma seed.

### F5 · Carrera y segundo año

**Trabajo incluido:** contratos al vencer, renovaciones y movimientos de IA, recambio válido de plantillas cuando haga falta, nueva edición y calendario, histórico de temporadas, evaluación laboral del entrenador y persistencia durante el cambio de año.

**PASS:** cerrar dos temporadas consecutivas, iniciar tercera y recargar un guardado creado antes, durante y después del cierre anual sin duplicar transacciones, eventos o campeones. Plantillas y calendarios siguen siendo válidos.

### F6 · Producto completo, no más sistemas

**Trabajo incluido:** corregir huecos de navegación Courtside, compatibilidad visual, errores recuperables, funcionamiento del ejecutable Tauri y regresiones detectadas en el recorrido total. No introducir nuevas mecánicas de profundidad.

**PASS:** un usuario puede completar el recorrido V1 **solo desde el ejecutable**, sin consola, SQL, logs ni GitHub; CI verde, pruebas automatizadas de dos temporadas, smoke visual y Save V4 verificados.

## 4. Qué NO vamos a implementar para cerrar V1

- Generación universal de 190 países ni mundo completo de BDM-DB.
- Todos los formatos NBA, NCAA, NIL, Portal, Draft, trades y salary cap NBA.
- Profundización adicional de PERSON50/HRPG, política del staff o nuevos sistemas de interacción.
- Pizarra Viva avanzada, Practice Lab total, sistemas completos de Facilities o nueva versión de MatchEngine.
- Más pantallas sin comportamiento real o rediseños globales que no resuelvan bloqueos.
- Marcos de validación, capas de abstracción o programas transversales nuevos.

**Conservar** todos los módulos avanzados que ya existen. No borrarlos ni romper su Save. Quedan disponibles para ampliarse una vez termine la V1.

## 5. Contrato mínimo para ampliar módulos después

Toda ampliación:
- Usa `GameWorld`, calendario y eventos existentes.
- Añade comportamiento mediante servicios de aplicación y autoridades de dominio existentes, sin duplicarlas.
- Conserva compatibilidad Save V4 mediante evolución aditiva/migración controlada.
- Se integra con Courtside y aporta una acción o información útil al usuario.
- No es obligatoria para jugar la V1 cuando su ecosistema no esté activo.
- Se integra con test del flujo real afectado.

Los generadores de `audifor/BDM-DB` podrán exportar universos válidos para el mismo contrato de arranque del juego, sin rehacer el manager.

## 6. Operativa GitHub sin burocracia

- **Una rama y una PR por fase:** `playable/f0`, `playable/f1`, ... `playable/f6`, siempre basadas en el `main` vigente al empezar.
- No crear issues, subfases ni PRs por cada pantalla, servicio, incidencia o test. **Trabajar hasta pasar el alcance completo de la fase actual.**
- Cada PR debe adjuntar únicamente: alcance realmente conectado, servicios reutilizados, prueba E2E del recorrido, CI, Save V4, evidencia Courtside y limitaciones reales.
- Estado de una fase: **PENDIENTE / EN CURSO / BLOQUEADA / PASS JUGABLE**. Sin estados intermedios que confundan progreso con entrega.
- No ejecutar trabajo de la fase siguiente hasta cerrar la actual, salvo preparación inocua y estrictamente necesaria.
- Cada fase se fusiona a `main` únicamente cuando su PASS sea verificable.

## 7. Primera orden de implementación

**EMPEZAR F0.** Sobre el HEAD actual de `main`:
1. Verificar CI global y los efectos actuales de [PR #160](https://github.com/audifor/BDM/pull/160).
2. Arreglar solo los bloqueos de arranque, Courtside, persistencia y validez del universo piloto.
3. Completar **dentro de la misma rama F0** el flujo `crear -> seleccionar club -> Courtside -> guardar -> cargar`.
4. Probarlo en ejecutable, certificar CI y fusionar la única PR de F0 si PASS.

**Después, una única fase F1** hasta completar y certificar `plantilla -> tácticas -> partido -> clasificación -> guardado`. Sin pedir al usuario una nueva autorización para inventar desgloses.

## 8. Referencias reutilizables

- [Arquitectura](https://github.com/audifor/BDM/blob/main/docs/ARCHITECTURE.md)
- [BS0 Gameplay Manifestation Matrix](https://github.com/audifor/BDM/blob/main/docs/strengthening/reviewed/BS0_GAMEPLAY_MANIFESTATION_MATRIX.md) (snapshot histórico; verificar estado en main)
- [Competition/GameWorld #22](https://github.com/audifor/BDM/issues/22)
- [Training Studio #126](https://github.com/audifor/BDM/issues/126)
- [PLAYER Match Next #139](https://github.com/audifor/BDM/issues/139)
- [Regresiones Courtside PR #160](https://github.com/audifor/BDM/pull/160)

**El objetivo no es cerrar la máxima cantidad de tickets. Es lograr siete entregas jugables y detener la fragmentación.**
