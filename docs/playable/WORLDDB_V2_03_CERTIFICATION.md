**BDM WorldDB V2-03 — integración multiliga**

Base: `4c8919fef50823f422f3166d61f886e183ba6357`. Rama aislada: `playable/worlddb-v2-03`. Las carreras nativas de España, Francia e Italia superan crear partida, consultar plantilla original, disputar un partido con MatchEngine, consultar acta/clasificación, fichar con Finance/Governance, renovar y guardar/cerrar/reabrir/continuar. Las tres ligas usan el mismo adaptador. La temporada francesa completa queda bloqueada, con evidencia separada; el PASS de jugabilidad inicial no implica continuidad ilimitada.

**Implementación y procedencia**

`src/data/worlddb-v2/competitions.json` es el catálogo compartido por NEW GAME, TypeScript y el puente Python. Rust lo incorpora al ejecutable, evitando depender del árbol de código fuente durante la ejecución. Conserva los identificadores PBM de competición de origen, clubes y personas. Las identidades deportivas de edición y ecosistema proceden del bundle correspondiente. No se han duplicado WorldDbV2Game ni los motores.

- Liga Endesa: `pbm:DYN_championnat:5`, 18 clubes, `competition:ESP:liga-endesa`.
- Betclic Élite: `pbm:DYN_championnat:2`, 16 clubes, `competition:FRA:betclic-elite`.
- LBA Serie A: `pbm:DYN_championnat:10`, 16 clubes, `competition:ITA:serie-a`.

Se reutilizan Runtime V1, el bundle inmutable, WorldDbSession, ScheduleGenerator, WorldCompetitionCalendar, standings, MatchEngine, las autoridades F3 y Save V4. La política contractual ficticia ya existente se extrae de AcbDemoSalaryRules a GeneratedProfessionalSalaryRules; el módulo anterior conserva sus exportaciones. No son reglas económicas reales francesas o italianas. Finance recibe una autoridad explícita EUR para las organizaciones de estas carreras; no se convierten salarios ni importes PBM. Las plantillas iniciales reciben contratos generados identificados; los contratos PBM permanecen como referencia.

El pool selecciona como máximo 60 personas originales PBM por carrera: hombres vivos, no retirados, sin club, nacionalidad del país seleccionado, edad válida 18–40 en la fecha elegida, orden SHA-256 de semilla e identidad. Los perfiles deportivos usan los generadores certificados existentes. No se cargan los 53.183 agentes libres globales ni se crean personas para rellenar el pool. Las pruebas comparan los identificadores proyectados con las filas originales.

La referencia temporal PBM es 1 de julio de 2025. Elegir otra fecha inicializa una edición ficticia desde ese estado, sin resultados históricos ni traslados históricos de plantilla. España conserva su política de calendario existente. Francia e Italia usan las ventanas derivadas del formato y la cadencia por defecto de los motores existentes, dentro de una ventana ficticia de un año desde la fecha elegida. No se ha reutilizado un calendario ACB con otro nombre ni se certifican fechas oficiales francesas/italianas. El payload italiano declara `ASYMMETRIC` para la vuelta, mientras el generador existente dispone la vuelta reflejada: el calendario obtenido es de simulación y no reproduce ese orden oficial.

**Certificación deportiva independiente**

- España, semilla `worlddb-v2-season-03`: 306 partidos regulares, 34 por club; 20 de playoffs; Saski Baskonia (`pbm:DYN_equipe:42`) campeón. Las 326 actas corresponden a resultados completos, sin IDs repetidos ni referencias de jugador/club nuevas inválidas. La nueva edición contiene 306 encuentros. Este resultado no sustituye al campeón ni a los guardados certificados en V2-02: es otra carrera y semilla.
- Italia, misma semilla: 240 regulares, 30 por club; 29 de playoffs; Bertram Derthona Tortona (`pbm:DYN_equipe:2072`) campeón. Las 269 actas corresponden a resultados completos, sin IDs repetidos ni referencias de jugador/club nuevas inválidas. La nueva edición contiene 240 encuentros. Los cuartos, semifinales y final usan el formato LBA existente, series al mejor de cinco con patrón HHAAH.
- Francia: 232/240 regulares completados. El 20 de enero de 2026, PRE_MATCH_SELF_HEALING devuelve `Competition format requires exactly one rank-based playoff qualification rule: edition:FRA:betclic-elite:2025-26`. No hay campeón, cierre ni segunda edición certificados. La prueba larga verifica deliberadamente esta frontera y conserva `before-failure.json`; su resultado técnico satisfactorio no se cuenta como temporada francesa PASS.

El bloqueo francés está en `WorldCompetitionPostseason.selectQualifiedEntries`: el formato tiene tres salidas por rango desde la fase regular (clasificación directa y dos entradas al play-in), mientras esa autoridad exige una. La conexión necesita además resolver los contratos SINGLE_GAME/LOSER del play-in y las sedes: el formato existente declara HIGHER_SEED pero no patrones explícitos de series, exigidos por la evaluación SERIES. La fuente normalizada PGM también conserva esa autoridad de ventaja de campo, sin aportar los patrones ausentes. No se han eliminado el play-in, copiado patrones ACB ni inventado reglas. Esta entrega no declara temporada completa francesa.

Las pruebas largas guardan y recargan apertura, mitad de temporada, cierre regular, cierre deportivo y sucesor; verifican clasificación, victorias/derrotas, parejas dirigidas únicas, actas, integridad y conservación de clubes. Resuelven las decisiones canónicas de retorno de lesión, ofertas de entrenador y medios. No desactivan breakpoints.

Los certificados `continuity-ITA.json` y `continuity-ESP.json` parten del sucesor guardado: conservan historia/campeón, partidos anteriores e identidades PBM, ejecutan el ciclo anual existente, juegan la primera jornada real de la segunda edición (8 partidos italianos y 9 españoles), verifican clasificación y actas, vuelven a guardar/cargar y avanzan otro día. Las fechas finales son 3 de julio de 2026 en Italia y 12 de octubre de 2026 en España. Francia queda excluida de este PASS.

Esos mismos estados se recuperan después en el ejecutable Windows, copiándolos a perfiles QA nuevos y usando CONTINUE: clasificación e historial visibles, igualdad canónica al cargar, avance de día, guardado, cierre de proceso, segunda apertura y otro avance. Hay tres pasos PASS por país y capturas en `native-continuity-ITA` y `native-continuity-ESP`. El script V2-02 de aceptación de continuidad se hace reutilizable mediante `BDM_WORLDDB_NATIVE_SUCCESSOR`, sin fechas ni cantidades españolas fijas. Los perfiles resultantes son `qa-continuity-03-ITA-1793023164953` y `qa-continuity-03-ESP-1793023244537`.

**Aceptación Windows y mercado**

Se usa el ejecutable de esta rama, con frontend incorporado y perfiles de guardado exclusivos. `scripts/playable/worlddb-v2-03-windows.mjs` pulsa controles DOM reales mediante CDP; no inyecta GameWorld, no altera la verdad del mercado y no llama comandos de juego simulados. Cada país tiene seis pasos PASS y capturas en `evidence/worlddb-v2-03/native-<país>/`:

1. NEW GAME → WorldDB V2 → competición → club PBM → entrenador creado → Courtside.
2. Plantilla original.
3. Visor real de partido → simular final → acta → clasificación.
4. Buscar agente libre → contacto → respuesta → oferta → aprobación Finance/Governance → firma y plantilla/contrato.
5. Renovación mediante negociación, aprobación y contrato sucesor.
6. Guardar → cerrar proceso → abrir → CONTINUE → igualdad de estado canónico → avanzar día y guardar.

Francia usa Élan Chalon y ficha a Quentin Klingelschmitt; Italia usa Trapani Shark y ficha a Luca Vesnaver. Los certificados españoles identifican su club y fichaje exactos. No se declaran nuevas pruebas nativas de traspaso o liberación por país: los cinco escenarios PBM existentes (firma, renovación, liberación, traspaso, rechazos) se conservan y pasan en la regresión focal española. Las nuevas pruebas de cada liga verifican firma canónica y persistencia. Un consumidor adicional recupera el guardado producido por Windows de cada liga, alinea al fichado mediante el control existente, ejecuta el siguiente partido con MatchEngine, exige segundos jugados y vuelve a verificar Save V4; sus actas están en `signed-player-played.json`. Esta última prueba es de dominio sobre el guardado nativo, no una interacción Windows adicional.

**Cobertura de 102 competiciones**

`scripts/playable/worlddb-v2-compatibility.py` consulta WorldDB/Runtime en solo lectura y genera `evidence/worlddb-v2-03/compatibility.json`. Resultado: 3 PLAYABLE, 0 READY_TO_CONNECT, 99 NEEDS_MAPPING, 0 BLOCKED al nivel de selección de carrera. El bloqueo de cierre francés figura en el campo lifecycle, separado de su jugabilidad inicial. No se interpreta ausencia de certificación como ausencia de reglamento.

Cada fila conserva participantes, IDs, tamaños originales de plantilla, registros de fase PBM sin descodificar sus códigos y candidatos PGM por país/nombre, explícitamente no verificados. Las similitudes sirven para investigar correspondencias; los documentos COMPLETE son fuentes de autoría cuya ejecución debe validarse. La matriz mantiene esas evidencias separadas de la certificación jugable.

El inventario cubre el bundle de BDM, 488 competiciones de PGM, 408 fichas de investigación y tres documentos de autoría ESP/BRA/ARG, con rutas y hashes. Las fichas son metadatos, no reglas. La base PGM contiene 486 ediciones, 303 nodos estructurales y contratos deportivos parciales; se consulta inmutable y se comprueba su hash tras la lectura.

La candidata siguiente sin redactar reglas nuevas es Novo Basquete Brasil (`pbm:DYN_championnat:109`): 20 clubes PBM y documento existente COMPLETE con 20 equipos, cuadro y series HAAHH. Aún debe pasar la normalización/exportación existente y verificarse el contrato de sedes/selección del motor; por ello sigue NEEDS_MAPPING, no READY_TO_CONNECT. NBA tiene bundle pero requiere proyección de conferencias/play-in y calendario específico; NCAA I agrega 353 clubes y necesita correspondencias reales con conferencias; Argentina tiene documento pero IDs sin reconciliar y rutas múltiples/sedes pendientes; ProA alemana tiene evidencia PGM con final a dos partidos por agregado, que no debe reemplazarse por una serie. Élite 2 tiene identidad y estructura PGM, sin conexión ejecutable verificada. No se ha programado ningún reglamento adicional.

**Pruebas y protección**

Los resultados y comandos completos se registran en `evidence/worlddb-v2-03/certification.json` y sus logs. La suite global finaliza con 776 archivos PASS, 48 omitidos, 5.730 pruebas PASS, 56 omitidas y cero fallos, en 2.799,68 segundos. La regresión focal completa tiene 12 pruebas PASS; el consumidor de los fichajes nativos tiene otras tres PASS. Rust: 18 PASS. Typecheck, formato Rust, cargo check offline y construcción Windows con frontend incorporado pasan. Los recorridos deportivos y la continuidad se ejecutan aparte de la suite global porque son opt-in y requieren los datos locales. El bloqueo francés se registra como límite demostrado, no como temporada PASS.

WorldDB V2 mantiene SHA-256 `f1624039945c253a6bee2d5c793f58fb753443c5f03b549eba9acd4826dec58f`. Las 54 verificaciones de fuentes/Runtime/bundle pasan. `protection.json` registra guardados anteriores, ejecutables previos y el estado de F4: la rama original conserva sus 27 entradas pendientes. Las partidas propias usan `qa-multileague-*`; no se reemplaza ningún guardado anterior. La arquitectura de persistencia continúa siendo un Save V4 independiente por perfil, con manifiesto PBM/semilla y estado canónico propio. No se modifica el diseño de Courtside.

`initialization-issues.json` conserva las incidencias heredadas notificadas por Runtime: 488 detalles huérfanos en DYN_joueur_attributes, 10.656 en DYN_joueur_langue y uno en DYN_joueur_cursus. Runtime los conserva en la maestra y excluye de la selección; no se convierten en personas ni en errores nuevos. No aparece una relación indispensable rota en estas tres inicializaciones. Los contadores Runtime se distinguen de la activación posterior del pool acotado de agentes libres.

**Ejecutar en Windows**

En PowerShell, desde este equipo:

```powershell
$env:BDM_SAVE_PROFILE = 'worlddb-v2-03-mi-carrera'
& 'C:\BDM-worktrees\worlddb-v2-03\artifacts\bdm.exe'
```

En NEW GAME elegir WorldDB V2, indicar la carpeta fuente (`C:\BDM_DB\WORLDDB_PBM` en este equipo), fecha, semilla, competición y club. La ruta fuente se configura en la interfaz; no está impuesta por el adaptador. Para recuperar Francia certificada usar el perfil `qa-multileague-FRA-1793021230900`; Italia `qa-multileague-ITA-1793021442290`; España `qa-multileague-ESP-1793021831632`, y pulsar CONTINUE. Los guardados ya creados no necesitan volver a importar WorldDB.

Para construir y verificar desde el repositorio:

```powershell
npm run typecheck
npm test -- src/app/game/WorldDbV2Multileague.test.ts src/app/game/WorldDbV2Playable.test.ts src/app/game/WorldDbV2Market.test.ts --maxWorkers=2
python -B scripts/playable/worlddb-v2-verify-sources.py
python -B scripts/playable/worlddb-v2-compatibility.py
npm run tauri build -- --debug --no-bundle --config src-tauri/tauri.worlddb-v2.conf.json
```

Las dependencias siguen siendo las ya usadas por V2-02, incluido Python accesible mediante `python` o `BDM_PYTHON`. Para repetir temporada, establecer `BDM_WORLDDB_SEASON=1` y `BDM_WORLDDB_COMPETITION` al identificador PBM y ejecutar únicamente WorldDbV2Season.test.ts. Para repetir continuidad, establecer `BDM_WORLDDB_CONTINUITY=1` y `BDM_WORLDDB_SUCCESSOR` a su `successor.json`, y ejecutar WorldDbV2Continuity.test.ts. No activar esos flags en la suite global ni crear otra ejecución simultánea del mismo escenario.
