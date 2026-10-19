# F0 — partida piloto y persistencia

Base: `61ce38444deb193452db407add88a3f28806c2ee` (`origin/main`, 2026-10-19).
Rama: `playable/f0`. Alcance: exclusivamente F0.

Certificación funcional Windows: **PASS**. El resultado global y el estado final
de F0 se registran en la [PR #162](https://github.com/audifor/BDM/pull/162), junto
con los checks del commit que se va a fusionar.

## Recorrido comprobado en Windows

Ejecutable Tauri compilado con frontend de producción embebido, sin servidor Vite:
`npm run tauri -- build --debug --no-bundle -- --offline`.

1. NEW GAME → ACB 2026/27, disponible sin WorldDB externo.
2. Crear Elena Piloto y seleccionar UCAM Murcia.
3. Iniciar → Home Courtside, fecha **2026-07-01**, próximo encuentro contra
   Casademont Zaragoza el **2026-09-26**. Consultar Roster: 16 jugadores.
4. Menú BDM → Guardar partida. Se reemplaza el slot nativo existente correctamente.
5. Cerrar el proceso, volver a ejecutar BDM y pulsar CONTINUE.
6. Mismos club, fecha, entrenador, plantilla y calendario. Guardar de nuevo y
   comparar **todo** el payload Save V4: igualdad exacta de sus **221 campos**.
7. CONTINUE avanza hasta **2026-09-26**, se detiene antes del primer partido del
   usuario y permite volver a guardar. No se jugó ningún partido.

El guardado del usuario anterior a la prueba se protegió antes de comenzar y se
restauró al finalizar, comprobando la igualdad de su SHA-256.
La evidencia de integridad está en [native-roundtrip.json](evidence/f0/native-roundtrip.json).
SHA-256 del payload normalizado antes y después de reiniciar:
`b0d1f0c704132ab879c56628c2841728b9169d6f525f78a1a810bcea81dd618f`.

Capturas: [creación](evidence/f0/01-coach-club.png),
[Home](evidence/f0/02-home.png), [plantilla](evidence/f0/03-roster.png),
[guardado](evidence/f0/04-saved.png), [recarga](evidence/f0/05-reloaded.png),
[continuación](evidence/f0/06-continued.png),
[ventana compacta de 1280 píxeles](evidence/f0/07-compact.png).

## Autoridades reutilizadas y defectos corregidos

- `createConfiguredGameAsync` → `createAcbTestGame`, `UserCoachCreator`, fábricas
  `GameWorld`, generadores canónicos de jugadores/staff/contratos/finanzas y
  `generateRoundRobinSchedule`. Se configura el reloj de la carrera el 1 de julio;
  los fixtures históricos de desarrollo conservan su reloj de septiembre.
- Universo existente: **18 clubes, 241 jugadores, 721 perfiles Staff, 576 asignaciones
  de staff, 306 encuentros, 34 jornadas**. No se añadieron identidades reales.
  La interfaz conserva la identificación de los atributos y datos generados.
- Pruebas de los 18 clubes: IDs y relaciones, ausencia de jugadores duplicados en
  plantillas, elegibilidad, un contrato activo por jugador, entrenador principal,
  presupuestos suficientes y 17 encuentros en casa/17 fuera sin colisiones de fecha.
- Courtside carecía de guardar/cargar: el menú llama a `GameSaveService` y al mismo
  `TauriGameSaveRepository`, con bloqueo durante simulación y limpieza de transitorios
  al cargar. No se añadió otro formato, slot ni repositorio.
- En Windows, `write_save` mantenía abierto el archivo temporal durante
  `ReplaceFileW`. La nueva prueba Rust falla antes del arreglo con `os error 32`;
  cerrar el descriptor después de `sync_all` y antes del reemplazo corrige el error.
  La escritura y el reemplazo siguen siendo atómicos.
- Se restaura la hoja base correspondiente al markup real de `HomeWorkspace`,
  sustituida por estilos de un markup `.home` que no usa ese componente. Se conserva
  el diseño Courtside y su capa de estilo; el calendario completo queda acotado y
  scrollable en ventanas compactas para no desplazar fuera de pantalla el partido.
- El ejecutable Windows abre la aplicación sin crear una consola adicional.
- La expectativa antigua del menú seguía exigiendo Scouting independiente, en
  contradicción con Mercado unificado y su test canónico. Se actualiza la expectativa
  y se comprueba que la búsqueda sigue accesible mediante Mercado.

## Validación

- Pruebas focales de F0, Home, bootstrap, menú y controles de persistencia: **50 PASS**.
- Typecheck, build del frontend y compilación final Tauri: PASS.
- `cargo fmt --check` y `cargo check --offline`: PASS.
- `cargo test --offline`: **18 PASS**, incluida la regresión de reemplazo Windows.
- Save V4: roundtrip técnico completo, equivalencia al avanzar un día después de
  cargar, continuación asíncrona y roundtrip real tras reiniciar el ejecutable: PASS.
- Suite global: `npm test -- --maxWorkers=2 --testTimeout=30000 --hookTimeout=30000`.
  El resultado local y el de los cuatro shards de CI se adjuntan al resumen final
  de la [PR #162](https://github.com/audifor/BDM/pull/162).
- CI global: [checks de la PR F0](https://github.com/audifor/BDM/pull/162/checks).
  Solo un resultado completo en verde permite declarar F0 PASS JUGABLE.

La PR #161 seguía abierta al comenzar; se leyó su plan sin convertir propuestas
ajenas a F0 en decisiones. La PR #160 estaba fusionada. La CI de `main` fallaba
por la expectativa del menú; la CI de #161 también había registrado un timeout
en la prueba WorldDB de 365 días. Se conserva esa cobertura sin ampliar su timeout.
