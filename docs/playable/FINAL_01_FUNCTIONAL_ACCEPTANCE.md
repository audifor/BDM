# FINAL 01 — cierre funcional

Base: `main` posterior a V2-06, `12d926241fda7f2ba3f198083cd61fd480c2fec8`. Rama aislada `release/final-01-functional`; worktree `C:/BDM-worktrees/final-01`.

## Defectos corregidos

1. **NEW GAME omitía la primera nómina.** El arranque WorldDB V2 no ejecutaba Finance en la fecha inicial. Ahora materializa los vencimientos a través del procesador existente. La carrera Windows de cuatro ligas registra 1.089 reconocimientos iniciales en las 70 organizaciones. No se inventan ingresos ni financiación.
2. **Los contratos firmados durante el día perdían el primer vencimiento al avanzar.** Calendar reconcilia la fecha saliente antes de procesar la entrante. Los identificadores económicos existentes hacen que repetir la fecha no duplique obligaciones, reconocimientos ni pagos. Probado con cuatro altas de staff y contratación de jugadores.
3. **Ejercicios sin cierre contable.** Finance cierra los periodos terminados, salda exclusivamente los ingresos y gastos registrados contra la cuenta patrimonial existente y abre el siguiente periodo mediante sus autoridades actuales. No cambia caja, deudas ni hechos previos. El cierre es idempotente; los periodos cerrados no se reabren y no admiten nuevos asientos retroactivos. No se modelan impuestos ni distribuciones ficticias.
4. **Finanzas mostraba el año natural en vez del ejercicio canónico.** Las vistas existentes usan el FiscalPeriod correspondiente a la fecha y permiten consultar ejercicios y cierres dentro de la pantalla actual.
5. **La carrera PBM sólo incorporaba perfiles de entrenador.** La proyección de partida incorpora las especialidades del personal original y una selección determinista y acotada de personas originales desempleadas. Sus identidades PBM se conservan; sus atributos de juego se generan con el generador existente y se identifican como ficción BDM. Se prueban contratación, asignación, delegación y despido por las autoridades existentes.
6. **Dos clubes recibían un presidente como entrenador.** Las nuevas carreras eligen un entrenador original desempleado para la designación inicial ficticia de BDM cuando no existe entrenador de origen. Los presidentes siguen siendo personas originales. No se modifica el maestro ni se reescriben partidas existentes.
7. **Una contraoferta de compensación bloqueada se explicaba como falta de margen salarial.** El mensaje distingue categorías financieras; Operaciones muestra la autorización para compensaciones y desactiva la aceptación cuando Finance la rechaza. La regresión carga el guardado real de la negativa, sin presupuesto simulado.
8. **Un contacto respondido seguía indicando espera.** Operaciones muestra la respuesta recibida.
9. **Staff mostraba dólares en clubes con otra moneda.** La ficha y el departamento usan la moneda financiera del club para el símbolo, sin convertir ni modificar salarios. Las negativas financieras muestran texto legible en lugar de códigos internos.
10. **El diagnóstico diario repetía nóminas ya contabilizadas.** Al reconciliar la fecha saliente, Calendar sólo informa como nuevas las nóminas que han generado un reconocimiento en esa reconciliación; los hechos financieros conservan sus identificadores y protección contra repetición.
11. **Rehabilitación no explicaba por qué estaba desactivada durante una revisión.** La ficha indica que hay que resolver la revisión en Overview y nombra las dos decisiones disponibles; no modifica las reglas médicas.
12. **Un fichaje vencido bloqueaba la carrera al salir de la plantilla.** La validación de Governance acepta el vencimiento real registrado y su cadena contractual, sin borrar la autorización ni aceptar una baja sin evidencia. Una prueba usa el guardado Windows que produjo el bloqueo y atraviesa el vencimiento con el ciclo diario real.
13. **Inicio mezclaba ejercicios y mostraba un tope salarial inexistente.** El resultado operativo usa el FiscalPeriod vigente y el panel indica que el Salary Cap no aplica cuando las reglas de la competición así lo establecen.
14. **La plantilla mostraba salarios en dólares para clubes con otra moneda.** La tabla y el expediente usan la moneda registrada del club, sin convertir las cantidades.

## Evidencia y alcance

La aceptación usa el ejecutable Tauri de Windows, WebView2, entradas reales de Courtside y guardados nativos. Los scripts `final-01-windows.mjs` y `final-01-native-season.mjs` no inyectan mundos ni llaman directamente a comandos del store. Las operaciones conservan las negativas legítimas de jugadores, clubes y Finance.

Los guardados y capturas originales de trabajo se conservan en `.worlddb-v2/final-01/windows-1793220122415`. Se seleccionará la evidencia final reproducible en `docs/playable/evidence/final-01` al concluir la certificación.

Se ha jugado un partido completo FULL, con pausa y reanudación; las restantes resoluciones utilizan el MatchEngine y sus workers existentes. El universo es una única partida con Liga Endesa (18), Betclic Élite (16), LBA (16) y NBB (20).

No se cambia MatchEngine, Courtside, Save V4, Runtime V1, bases de datos fuente ni reglas de competición. La única modificación del generador de staff exporta una función ya existente. No se conectan otras competiciones.

La evaluación funcional no demuestra por sí sola diversión ni ventaja competitiva de decisiones manuales. No se atribuyen esas conclusiones a la suite.

Capturas Windows: [staff](evidence/final-01/windows-staff-hire.png), [delegación](evidence/final-01/windows-delegation.png), [partido completo](evidence/final-01/windows-match-paused.png), [rehabilitación](evidence/final-01/windows-rehabilitation.png), [contraoferta](evidence/final-01/windows-counter-budget.png) y [moneda del staff](evidence/final-01/windows-staff-currency.png). La [verificación de operaciones](evidence/final-01/windows-operations.json) incluye el pago y cobro del mismo traspaso, la identidad original, la primera nómina del fichaje y el despido; la [recarga de la decisión médica](evidence/final-01/windows-rehab-restart.json) compara el guardado completo.

## Estado de certificación

En curso: temporada Windows completa, sucesoras, operaciones finales y suite global. Este documento no constituye todavía un PASS.
