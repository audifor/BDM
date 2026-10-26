**WorldDB V2-03F — cierre del bloqueo francés en PR #169**

Rama existente `playable/worlddb-v2-03`, continuación de `dfbf71326413ec672db75e15284470d20a4f5f6e`. Esta certificación sustituye el estado francés bloqueado del informe V2-03. No se reconstruyen WorldDB, Runtime ni el adaptador multiliga.

**Resultado deportivo**

Francia completa 240 partidos regulares, tres de play-in y 22 de playoffs: 265 actas. Boulazac Basket Dordogne (`pbm:DYN_equipe:20`) es campeón por las series disputadas. La edición se cierra y crea otros 240 encuentros. La primera jornada de la segunda edición ejecuta ocho partidos con MatchEngine, conserva historia e identidades PBM y supera guardar/cargar/continuar.

La siguiente edición usa la autoridad existente `seasonSnapshot` para sus participantes. No se certifica aquí un intercambio con Élite 2 ni plazas europeas: esas competiciones no tienen una proyección conectada en esta carrera. No se inventa un sustituto del club descendido ni se amplía el universo para simular otra liga.

Se parte de `season-03-FRA-1793020875866/before-failure.json`, el guardado certificado con 232/240 regulares, y se ejecuta la última jornada y el resto de la temporada con las autoridades canónicas. Los 232 resultados y actas anteriores se comparan íntegramente con el cierre nuevo y permanecen idénticos. No se vuelven a importar personas ni clubes, ni se repite la liga completa anterior. La fecha elegida sigue inicializando un universo ficticio desde el estado PBM de julio de 2025; no se presentan estos resultados como historia real.

España e Italia conservan sus formatos. Desde sus cierres regulares guardados se vuelven a ejecutar playoffs y transición: España mantiene exactamente sus 326 partidos (306+20), e Italia sus 269 (240+29), incluidos IDs, fechas, sedes y marcadores. Los cinco escenarios PBM de mercado existentes pasan; la prueba del adaptador común crea, juega, ficha y persiste en las tres ligas.

**Causa exacta de 232/240**

La reproducción anterior a los cambios está en `evidence/worlddb-v2-03f/original-failure-reproduction.json`, con stack y fases. Antes de avanzar hay 232 partidos completos, ocho pendientes y `areRegularSeasonGamesComplete(...) === false`. La reparación de plantillas no falla ni modifica ese mundo.

El lote de resultados aplica los ocho encuentros restantes. Al incorporar el último resultado, `MatchResultApplication.applyMatchResult` solicita materializar el postseason. En ese estado transitorio ya están completos los 240; `selectQualifiedEntries` encuentra tres rutas por ranking y rechaza su antigua restricción de una. La operación de día es atómica: la excepción descarta todo el lote y devuelve el mundo original con 232 resultados. La excepción no demuestra que el guardado tenga terminada la liga.

La etiqueta `PRE_MATCH_SELF_HEALING` era incorrecta: `activePhaseId` no se actualizaba al empezar la resolución de partidos. Ahora se establece `MATCH_RESOLUTION` antes de preparar y aplicar el lote. Se conserva el comportamiento transaccional de fallo cerrado.

**Composición reutilizada**

- `WorldCompetitionPostseason`: unión de las selecciones RANK_RANGE/TOP_N declaradas, validando cada rango; despacha encuentros SINGLE_GAME y SERIES dentro del mismo grafo. No adivina otros selectores.
- `WorldCompetitionFixedBracket`: admite el campo singular `pairing` que ya usa el bundle, referencias WINNER/LOSER a cruces anteriores y plazas explícitas `playoff_seed`. Las referencias a perdedores requieren su arista declarada.
- `WorldCompetitionVirtualFixtureResolver`: valida ganador y perdedor contra los participantes reales; propaga la identidad original y la plaza de playoff explícita por las rondas siguientes. Una plaza 7/8 no cambia el identificador del club.
- `WorldCompetitionSingleElimination`: comparte la construcción y evaluación del encuentro único con el postseason mixto. La sede usa HIGHER_SEED, NEUTRAL o una asignación explícita al primer participante; no interpreta otros tipos como un local por defecto. La autoridad existente de eliminación directa usa la misma construcción.
- `WorldCompetitionSeries`: continúa ejecutando las series y sus patrones explícitos; no se introduce otro motor de series, de calendario o de partidos.

Los ocho desenlaces del play-in se prueban sin admitir a eliminados en cuartos. También se verifica el caso en que las plazas de playoff 7 y 8 intercambian el orden de los rangos regulares: la prioridad posterior sigue la plaza explícita del cuadro, como establece la fórmula LNB 2025–26. Las pruebas rechazan resultados prematuros, rutas LOSER sin declarar, rangos imposibles y duplicados de encuentro único. Se mantienen las regresiones existentes de SERIES, brackets y WINNER.

**Campos completados y fuentes**

`WorldDbV2FrenchFormatBinding.ts` añade un complemento de ejecución documentado al formato de la carrera, conservando el bundle congelado byte por byte. Se aplica a nuevas carreras y a la carga de las anteriores mediante `GameSaveService`, en memoria y de forma idempotente. No escribe sobre el archivo de guardado original. Save V4 conserva las fuentes añadidas y la marca `BDM_V2_03F_DOCUMENTED_BINDING` en el documento de temporada.

Los campos complementados son: patrón HAH de QUARTERFINALS, HHAAH de SEMIFINALS/FINAL, caminos explícitos de semifinales 1/8–4/5 y 2/7–3/6, y traducción del local declarado como perdedor de 7/8 a FIRST_PARTICIPANT en PLAY_IN_FINAL. La ruta del perdedor y las plazas 7/8 ya estaban documentadas en el bundle; su consumo faltaba en el motor.

Las fuentes primarias son:

- [Fórmula LNB 2025–26](https://lnb.azureedge.net/wp-content/2025/09/FORMULE-Betclic-ELITE_25-26.pdf): recorrido del play-in, prioridad del cuadro y orden de sedes de semifinales/final. El origen devolvió 502 en la lectura directa; se recuperó el extracto indexado del documento oficial.
- [LNB, artículo 262](https://www.lnb.fr/elite/wp-content/uploads/2022/07/Reglement-LNB-22-23-1.pdf): patrón de cuartos y conexiones A–D/B–C. Es un documento anterior; se usa para esos campos concretos y se contrasta con la edición 2025–26, sin importar su antigua composición de 18 clubes.
- [París, tercer partido de cuartos de 2026](https://parisbasketball.com/2026/05/lheure-de-la-belle/): confirma el partido decisivo en París después de los encuentros en París y Estrasburgo.
- [Mónaco, recorrido de los playoffs de 2026](https://asmonaco.basketball/news/show.php?ID=79482): resultados y sedes de los cuartos y semifinales de ambos finalistas, coherentes con esos campos y ramas.
- El documento oficial de presentación ya incluido en PGM/bundle conserva el cuadro y las entradas a play-in. No se utilizan sus indicaciones generales de ventaja de campo para inventar una secuencia de sedes.

No se copian datos deportivos ACB para Francia. Las coincidencias HAH/HHAAH se acreditan con fuentes francesas. El calendario sigue siendo la simulación derivada ya existente; las fechas ficticias junio/julio de las pruebas no se certifican como calendario oficial LNB.

**Windows: alcance preciso**

El ejecutable nuevo carga copias de los guardados certificados en perfiles QA exclusivos. `worlddb-v2-03f-postseason-windows.mjs` usa botones reales de Courtside y el visor, sin inyectar GameWorld ni resultados:

- En `qa-france-03f-1793031821044`, Tauri carga directamente el archivo antiguo de 232/240 sin el complemento. La comparación exige que todos los hechos ajenos a los campos documentados del formato permanezcan idénticos. Se disputa en directo el último encuentro regular del usuario, se completan los otros siete mediante el avance nativo y se materializan los cruces eliminatorios. Se guarda, cierra, recupera y continúa hasta el 23 de enero de 2026. Los cuatro pasos son PASS: el desbloqueo del guardado antiguo se verifica también en Windows.

- En `qa-france-03f-1793029619548`, Élan Chalon disputa en directo el play-in de 7/8 y gana 95–74 en Gravelines. El avance nativo ejecuta los otros dos play-in y materializa los cruces de cuartos; se capturan clasificación, resultados y acta. La última comprobación de ese primer script quedó en FAIL al intentar avanzar sin disputar el partido del usuario: fue un error del recorrido QA, no una excepción deportiva.
- Se continúa esa misma rama nativa copiando su `before-close.json` al perfil `qa-france-03f-1793030033940`. Se juega en directo el primer cuarto de final (JL Bourg 79–78 Élan Chalon), se disputan los siguientes mediante el control de simulación rápida, se avanza y se supera guardar/cerrar/reabrir/continuar. Los cuatro pasos de esta segunda aceptación son PASS.
- Las interacciones obligatorias de prensa se resuelven con `Press → Delegate answer`. Durante la aceptación se ejecutaron también esas pulsaciones desde un segundo cliente CDP, mientras el comprobador esperaba el avance; no se llamó al store ni se desactivaron breakpoints. El script final incorpora la gestión de prensa posterior a la simulación rápida.
- En `qa-continuity-03-FRA-1793030889915`, Tauri recupera la segunda edición producida por la certificación automatizada: conserva los 265 partidos anteriores y el campeón, muestra la nueva clasificación con ocho partidos disputados y avanza del 3 al 5 de julio de 2026, con cierre y reapertura intermedios. Los tres pasos son PASS.

El cuadro lógico y sus cruces materializados se verifican en el guardado nativo y en las listas existentes de competición. Courtside main dispone de clasificación, próximos encuentros y resultados, pero no de un panel gráfico dedicado al bracket; no se incorpora el F4 local ni se afirma haber probado una vista inexistente. Las bandas de colores existentes son indicativas y no constituyen la autoridad de clasificación; los accesos se comprueban contra el formato y el grafo. La temporada completa y la primera jornada siguiente se ejecutan en pruebas automatizadas; en Windows se certifican los tramos anteriores, no los 265 encuentros uno por uno.

**Validación y protección**

Los resultados finales de suite global, pruebas focales, Rust y build figuran en `evidence/worlddb-v2-03f/certification.json` y sus logs. Las pruebas deportivas largas se ejecutan aparte con flags explícitos. `season-audit.json` comprueba 265 actas, correspondencia de marcadores, referencias de jugadores/clubes y conservación de los 232 resultados previos. Los archivos `postseason-ESP/ITA-comparison.json` registran la igualdad deportiva exacta con las certificaciones V2-03.

La suite global termina con 777 archivos PASS, 49 omitidos, 5.741 pruebas PASS, 58 omitidas y cero fallos, en 2.490,40 segundos. La suite focal del motor tiene 22 PASS e incluye el caso adicional de propagación de las plazas 7/8 que se añadió después de que ese archivo pasara por la ejecución global. Las pruebas PBM de las tres ligas/mercado tienen 12 PASS. Rust tiene 18 PASS; fmt, cargo check offline, typecheck final y construcción Windows con frontend incorporado pasan.

`protected-before.json` y la verificación final cubren los perfiles anteriores, los ejecutables previos y el guardado francés de recuperación. V2 mantiene SHA-256 `f1624039945c253a6bee2d5c793f58fb753443c5f03b549eba9acd4826dec58f`; Runtime V1, las bases originales y el bundle fuente permanecen intactos. F4 conserva su estado local previo. Las incidencias referenciales PBM ya registradas no se reinterpretan ni se reparan inventando entidades.

Para probar en PowerShell:

```powershell
$env:BDM_SAVE_PROFILE = 'qa-continuity-03-FRA-1793030889915'
& 'C:\BDM-worktrees\worlddb-v2-03\artifacts\bdm.exe'
```

Pulsar CONTINUE. Para el tramo nativo de cuartos, usar `qa-france-03f-1793030033940`. Para una carrera nueva, elegir otro perfil, NEW GAME → WorldDB V2 → Betclic Élite y un club. El ejecutable anterior V2-03 se conserva como `artifacts/bdm-v2-03-before-france.exe`; los guardados franceses corregidos deben usarse con el ejecutable nuevo.

Para repetir la certificación deportiva desde el guardado original:

```powershell
$env:BDM_WORLDDB_SEASON = '1'
$env:BDM_WORLDDB_COMPETITION = 'pbm:DYN_championnat:2'
$env:BDM_WORLDDB_RESUME = 'C:\BDM-worktrees\worlddb-v2-03\.worlddb-v2\season-03-FRA-1793020875866\before-failure.json'
npm test -- src/app/game/WorldDbV2Season.test.ts --reporter=verbose
```

Las rutas de entrada se reciben por variables de entorno; la aplicación usa el repositorio nativo de guardado. La PR #169 se actualiza en la misma rama y permanece sin fusionar mientras los nuevos checks CI estén pendientes o fallidos.
