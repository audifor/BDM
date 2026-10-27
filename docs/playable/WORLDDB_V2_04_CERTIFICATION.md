# WorldDB V2-04 — conexión por datos y lote de 102 selecciones

Base: `648647d4dfee283457ab27367e2f51ddeb9ac59f` (#169). Rama aislada `playable/worlddb-v2-04`.

El lote construye las 102 poblaciones originales y trata cada intento de GameWorld por separado. Hay **4 carreras con flujo mínimo probado**, **11 conexiones parciales**, **29 identidades concordadas con fichas de investigación sin formato ejecutable** y **58 correspondencias pendientes**. Las cuatro carreras son Liga Endesa, Betclic Élite, LBA Serie A y NBB. No se equiparan fichas de investigación, formatos parciales y carreras jugables. La cifra de nuevas carreras conectadas es **una**, tras procesar todo el lote, no 99 ni 102.

La matriz completa está en [compatibility.json](evidence/worlddb-v2-04/compatibility.json). Incluye el error de la frontera nativa, población, incidencias heredadas, fases PBM originales, candidatos PGM, documentos, fuentes y campos pendientes por selección. Un `NEEDS_MAPPING` no afirma ausencia de reglas. La publicación en NEW GAME exige prueba mínima por competición y aceptación Windows de su familia.

La [segunda pasada por familias](evidence/worlddb-v2-04/family-matrix.json) añade para las 102 selecciones población original seleccionada, formato identificado, capacidades compartidas, bloqueos y referencias de prueba. Entre las once parciales, cuatro necesitan conexión de grupos, tres agregado, tres calendario fijo, dos se benefician de la conexión de liga impar con descansos y dos necesitan asignación por conferencia; las categorías se solapan. Ninguna de las once queda certificada al resolver una única capacidad: todas tienen otras dependencias o campos sin verificar. Por tanto, el número adicional **verificado** que puede declararse PLAYABLE en esta segunda pasada es cero.

El round robin existente con descansos está conectado a la generación de `Game`, validación de calendarios, comprobación de fin de liga y cálculo de jornadas de la siguiente edición. Las pruebas con un formato sintético verifican descansos y parejas; todavía no certifican una carrera nativa impar ni completan las reglas parciales de Primera FEB o Argentina. El calendario existente reserva mangas agregadas, pero no resuelve el resultado agregado. Los contratos de conferencia no acreditan por sí solos las asignaciones PBM ni el calendario NBA de 82 partidos. No se modifica una regla ni se certifica una liga basándose solo en estas partes.

## Conexiones comunes

- `WorldDbV2Game` sigue siendo el único adaptador. Recibe configuración y catálogo de formatos; no hay clases nuevas por país. La proyección comprueba identidad, edición, participantes, estado ejecutable, alcance y tipo de calendario antes de construir la carrera. Un `FIXED_SCHEDULE` o grupos no se convierten en round robin global.
- El bracket compartido consume referencias numeradas `WINNER_n-WINNER_m` como ordinales de encuentros de la ronda anterior, no como puestos de clasificación. Conserva la semilla real del vencedor y no deduce cruces desconocidos. Una final de dos ganadores explícitos no necesita repetir el número de participantes en el documento.
- La clasificación existente admite por datos el perfil de puntos 2/1 y miniliga recursiva documentado para NBB. No modifica las políticas españolas, francesas o italianas. Si todos los criterios quedan empatados al finalizar, exige una autoridad de sorteo; no convierte el orden provisional por ID en clasificación deportiva.
- El compilador añade únicamente campos de ejecución con evidencia explícita. No eleva documentos `PARTIAL` a `COMPLETE`. El publicador genera el catálogo compartido por NEW GAME, Python y Rust desde los resultados, sin añadir controles o ramas de código por liga. La aceptación nativa se comparte por firma de capacidades; el flujo mínimo de cada competición sigue siendo obligatorio.
- Un documento nuevo no hereda silenciosamente los desempates predeterminados: necesita una política de clasificación conectada. Los templates congelados mantienen su contrato previo. Los bindings verifican SHA exacto, variante y nodos; el consumidor de lote carga sus resultados incluso antes de que la competición aparezca en el selector.
- Las competiciones transfronterizas PBM con país `0` usan el soporte existente de Runtime V1 para referencias de todos los países y una selección explícita de competición. No activan clubes de las demás ligas. Se corrigió ese error del adaptador; no se atribuye a PBM.

## Fuentes y familias

Se auditaron 105 archivos JSON: 207 documentos distintos y 128 identidades. También se recuperó el catálogo reconciliado de 564 identidades y se conservaron los candidatos de la auditoría PGM normalizada anterior. El inventario registra hashes y estructuras en [inventory.json](evidence/worlddb-v2-04/inventory.json).

El cruce automático usa el decodificador del Runtime congelado para los nombres originales y abreviaturas PBM. Exige coincidencia exacta normalizada, país, género y un único destino en el catálogo reconciliado; no usa puntuaciones difusas para habilitar identidades. Registra los valores de ambos lados y sus participantes. Las 29 concordancias son de identidad, no certificaciones de edición ni de reglas: las diferencias de participantes (por ejemplo, 8 frente a 9) quedan visibles y no se corrigen cambiando clubes. La reconciliación de país alemán procede del enlace ProA revisado y se mantiene fuera del maestro.

Los documentos incluyen ligas regulares, grupos, conferencias, splits con arrastre, eliminatorias, series, play-in, agregado, promociones y descensos. Esa presencia documental no demuestra una conexión ejecutable. Las fases numéricas PBM se conservan como códigos sin reinterpretarlos silenciosamente.

NBB usa el documento completo **2025-26 de 20 clubes**, cuya identidad de edición PGM es `edition:BRA:nbb:2026`. No usa el parcial 2026-27 de 18 clubes. Se verificaron los cruces y las sedes HAAHH en los artículos 86–90, y clasificación/desempates en 94–96 del [reglamento oficial](https://lnb.com.br/wp-content/uploads/2025/09/Regulamento-NBB-CAIXA-2025-2026-Versao-Final.pdf). La procedencia exacta y SHA-256 del documento están en `compiled-formats.json`. El pin BLAKE3 conserva la referencia al bundle congelado; el apéndice se conserva íntegro en el formato de Save V4 y su SHA-256 se certifica aparte. No se presenta ese pin como hash del apéndice.

Las once conexiones parciales son ProA, NM1, NM2, NBA, Primera FEB, LF Endesa, NBL, Liga Nacional argentina, G League, Segunda FEB y Liga Sudamericana. Sus obstáculos no son intercambiables:

- ProA tiene reglamento oficial recuperado, pero falta exportación completa y realización nativa de su final por agregado. `WorldCompetitionCalendar` sabe reservar un número de mangas; eso no constituye un motor de resultados agregados.
- NM1/NM2, Segunda FEB y Sudamericana necesitan asignaciones de grupos y conexión de fases; NM1 también arrastre de resultados. Hay campos incompletos y restricciones de población que deben revisarse antes de habilitar la carrera.
- NBA, G League y NBL no pueden usar el calendario round robin del adaptador. Deben conectar la autoridad de calendario correspondiente, las asignaciones y la edición verificadas. NBL/G League también presentan restricciones de población válida para la proyección actual.
- LF Endesa tiene agregado y población femenina; la estructura documentada no certifica por sí sola la proyección actual. Primera FEB y Argentina tienen formatos parciales; no se inventan los cruces, patrones ni reglas pendientes para superar la barrera.

No hay otra liga marcada `READY_TO_CONNECT` sin condiciones en esta entrega. Las siguientes conexiones se deben abordar por **familias y sus dependencias**: agregado (ProA/LF Endesa), grupos con fases (NM1/NM2/Segunda FEB/Sudamericana), y calendarios fijos con asignaciones (NBA/G League/NBL). No hace falta volver a investigar lo que ya está documentado; sí conectar o completar las autoridades exactas indicadas en la matriz.

La certificación original de WorldDB V2 declara `passed: true` y `complete: false`: mantiene bloqueados los generadores opcionales de historial que requieren la política ausente. No se habilitan ni se alteran aquí. La comprobación SQLite `integrity_check` devuelve `ok`; el SHA-256 del maestro coincide con el de partida.

## Certificación deportiva y nativa

NBB: **380 partidos regulares y 61 de playoffs**, con actas, clasificación, ausencia de duplicados, campeón **Cruzeiro Basquete**, cierre y sucesora de 380 encuentros. Se verifican identidades originales, decisiones pendientes, contratos, finanzas, integridad, idempotencia y Save V4. La segunda edición tiene pruebas y guardados separados; ver `continuity-BRA.json`.

Windows usa el ejecutable Tauri real y los controles de Courtside: NEW GAME, club, plantilla, partido, acta, clasificación, fichaje de una persona PBM original, Governance, renovación, guardado, cierre y recuperación. El consumidor del fichaje nativo acredita minutos en MatchEngine y persistencia del acta. El tramo de playoffs parte de una copia de un guardado preparado por el motor mediante avances reales; no se afirma que los 441 encuentros se hayan pulsado manualmente en Windows. Las pruebas nativas y del motor se registran por separado.

La aceptación nativa NBB registrada corresponde al ejecutable V2-04 anterior a la conexión posterior de descansos impares. La compilación final incorpora esa conexión, pero no se ha repetido el recorrido Windows ya certificado; la nueva rama impar tiene pruebas sintéticas de motor, no aceptación nativa.

Las acciones obligatorias sobreviven a Save V4. Se corrigieron omisiones de los ejecutores de aceptación: resolver las decisiones pendientes tras recargar y tramitar Return-to-Play mediante los controles Medical antes de avanzar. El segundo guardado tenía una revisión médica pendiente. No se eliminan ni se resuelven automáticamente desde el cargador. El tramo nativo de playoffs usa Jugar partido/Simular final; no certifica el recorrido de Simulación rápida.

Los calendarios son simulados a partir del formato; la población procede del estado PBM y no constituye una reconstrucción histórica de la fecha elegida. Los contratos y presupuestos son generados por las autoridades ya certificadas. La provisión económica usa EUR como política ficticia explícita; no convierte salarios PBM a reales brasileños.

La continuidad NBB de esta prueba usa `seasonSnapshot`: conserva la población del universo. **No certifica el ascenso/descenso reglamentario hacia Liga Ouro ni sus condiciones de licencia**, que requieren una división enlazada. Tampoco certifica sorteos terminales, sanciones por incomparecencia ni la Copa Super8 como competición independiente. Estas limitaciones no se sustituyen por reglas de otra liga.

Los resultados finales de suite global, pruebas focales, Rust, build, protección y ejecutable se consignan en `evidence/worlddb-v2-04/certification.json` y sus logs. La suite global suma 831 archivos: 780 aprobados y 51 omitidos; 5.760 pruebas aprobadas y 62 omitidas. Es un resultado compuesto: tres particiones finalizaron, la cuarta se interrumpió y se completó con 92 archivos restantes, repitiendo el último archivo observado. Los 116 archivos anteriores de esa partición se contabilizan a partir del log detallado y su ejecución secuencial; no existe un resumen final de Vitest para el tramo interrumpido. España, Francia e Italia mantienen su certificación deportiva anterior y tienen regresiones focales en esta rama; no se ha repetido innecesariamente su temporada completa.

## Repetir en Windows

Desde la raíz del worktree, con las dependencias existentes y Python:

```powershell
python -B scripts/playable/worlddb-v2-verify-sources.py
python -B scripts/playable/worlddb-v2-batch.py
python -B scripts/playable/worlddb-v2-compile-formats.py
$env:BDM_WORLDDB_BATCH='1'
npx vitest run src/app/game/WorldDbV2Batch.test.ts
Remove-Item Env:BDM_WORLDDB_BATCH
```

El lote reutiliza los snapshots propios ya construidos; conserva los intentos fallidos y crea un destino nuevo para reintentarlos. Para una ejecución totalmente nueva, usar otro worktree limpio. Las rutas de fuentes admiten `WORLDDB_SOURCE_ROOT` y `BDM_FORMAT_ARCHIVE`; no se modifican las bases de esos directorios.

Para certificar Windows, reutilizar `scripts/playable/worlddb-v2-03-windows.mjs` con `BDM_NATIVE_COMPETITION` y el ejecutable local. Publicar el catálogo exige su evidencia, por ejemplo:

```powershell
python -B scripts/playable/worlddb-v2-publish-catalog.py --native-evidence <acceptance.json>
python -B scripts/playable/worlddb-v2-coverage.py
python -B scripts/playable/worlddb-v2-family-audit.py
```

Para una familia nueva todavía sin aceptación Windows, `worlddb-v2-publish-catalog.py --candidates` prepara automáticamente un catálogo de QA con las selecciones que superaron el consumidor de lote. Sus entradas llevan `CANDIDATE_NATIVE_PENDING` y la matriz no las cuenta como PLAYABLE. Construir esa versión de QA, ejecutar `WorldDbV2Multileague.test.ts` para preparar los candidatos de mercado y probar su representante mediante el ejecutor Windows. Después publicar **sin `--candidates`**, aportando la evidencia nativa. Así se evita una entrada manual en NEW GAME sin confundir acceso para pruebas con certificación.

Al cambiar datos del catálogo o bindings, reconstruir el ejecutable:

```powershell
npm run tauri build -- --debug --no-bundle --config src-tauri/tauri.worlddb-v2.conf.json
```

La validación local global usa cuatro particiones disjuntas `npm test -- --shard=N/4 --maxWorkers=1 --testTimeout=60000 --hookTimeout=600000`, para N de 1 a 4. Cada archivo de pruebas pertenece a una sola partición. El primer intento local dejó el valor predeterminado de 5 segundos y agotó tiempo en archivos anteriores; el mismo caso StaffScreen también agotó tiempo en V2-03. Los 57 casos de los dos primeros archivos pasan íntegros con 60 segundos. El workflow CI existente utiliza 30 segundos y no se ha modificado. Se conserva el intento inicial y se completó la pasada global final mediante la recuperación de la partición interrumpida; no se eliminan pruebas ni aserciones.

No usar una evidencia ajena a la familia ni omitir las pruebas por selección. Al incorporar un formato con campos adicionales, sus fuentes y añadidos deben estar en los datos de bindings; no se cambian reglas automáticamente.

Para jugar la compilación entregada sin tocar guardados anteriores:

```powershell
$env:BDM_SAVE_PROFILE='worlddb-v2-04-nueva-carrera'
& 'C:\BDM-worktrees\worlddb-v2-04\artifacts\bdm.exe'
```

NEW GAME → WorldDB V2 → competición → club. Elegir una fecha y semilla. El archivo de partida del perfil es independiente del maestro y de los demás perfiles.
