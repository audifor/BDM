# BS17D-P0 · APPROVED SPORTING OPERATIONS CONTRACT AND IMPLEMENTATION

## MANDATO

Implementa las consecuencias deportivas de Facilities conforme al contrato de producto **BS17D-P0 REALISMO EQUILIBRADO**, aprobado expresamente por el propietario de BDM.

No repitas la auditoría BS17D fallida como si sus decisiones siguieran pendientes.

La nueva política permite ejecutar Training/Medical con restricciones físicas demostradas y continuidad no verificada cuando la información física es desconocida.

Prohibido sustituir la política aprobada por una interpretación propia.

## 0. BASE Y ENTORNO

- Repo: `C:\BDM`
- Worktree: `C:\BDM-BS17-FACILITIES`
- Commit BS17C: `aa6a061d7ad5f905f0677936995e7adadc7ea2a3`
- Rama actual esperada: `bdm-stage2-bs17d-sporting-consequences`
- BS17D anterior: FAIL por política y lineage; sin cambios de producción.
- BS15 integration candidate: `94c0770`, fuera de la ancestry indicada.
- Documentos de autoridad: AGENTS.md, ARCHITECTURE.md, PRODUCT_GUARDRAILS, BS17A audit, roadmap BS17, certificaciones BS17B/C y BS12C.

Verifica Git, ancestry y contratos existentes.

No hacer merge, cherry-pick ni rebase de BS15 sin autorización del procedimiento de integración canónica.

Mantener `main` intacto.

## 1. PERSISTIR LA DECISIÓN CANÓNICA

Crear:

`docs/strengthening/BS17D_P0_SPORTING_OPERATIONS_POLICY.md`

Incluir íntegramente los siguientes principios aprobados:

### REALISMO EQUILIBRADO

1. Las restricciones físicas probadas afectan a operaciones que requieren el recurso correspondiente.
2. La infraestructura desconocida no se interpreta como inexistente.
3. Si falta evidencia física, conservar el comportamiento deportivo anterior, marcándolo UNVERIFIED_PHYSICAL_CONTEXT.
4. Una instalación conocida sin derechos acreditados no puede utilizarse.
5. La existencia de propiedad/control/operador no crea automáticamente Team usage rights.
6. LIMITED requiere evaluar restricciones concretas.
7. OUT_OF_SERVICE prohíbe usar el componente afectado.
8. Los recursos válidos alternativos deben evaluarse antes de bloquear.
9. Capacidad nominal y capacidad operativa disponible son magnitudes diferentes.
10. No inventar ocupación, slots, porcentajes ni rendimiento.
11. No aplicar bonificaciones deportivas globales.
12. Training, Medical, Recovery y BS15 conservan sus respectivas autoridades.
13. BS12C excluye efectos directos de Facilities sobre recuperación.
14. Talent solo puede integrarse tras resolver su ancestry canónica.
15. Todo efecto debe ser causal, explicable, determinista y Save-safe.

No interpretar UNKNOWN como derecho positivo cuando exista evidencia concreta de falta de autorización sobre un recurso conocido.

## 2. RESOLUTOR FÍSICO COMÚN

Crear o ampliar el adaptador canónico `facilitiesSporting` sin duplicar CFI8.

Debe aceptar conceptualmente:

- Organization / Team
- Fecha y, cuando exista, intervalo de operación
- Tipo de operación deportiva
- Requisitos físicos explícitos
- Demand units si son conocidas
- Contexto de acceso y recursos

Debe devolver una resolución pura y explicable:

- VERIFIED_AVAILABLE
- VERIFIED_LIMITED
- VERIFIED_UNAVAILABLE
- UNVERIFIED_PHYSICAL_CONTEXT
- NOT_REQUIRED

Y evidencia de:

- FacilityId y ComponentId cuando existan
- Capability
- Uso/acceso
- Restricción física
- Capacidad/unidad conocida
- Razón canónica
- Alternativas legítimas

Los nombres exactos de tipos pueden adaptarse a convenciones existentes, evitando autoridades duplicadas.

El resolutor nunca decide por sí mismo resultados deportivos ni autoriza gastos.

## 3. TRAINING

Auditar únicamente los puntos reales de planificación y ejecución necesarios.

Implementar un registro explícito y versionable de requisitos físicos por operación/módulo, aprovechando las capabilities existentes.

Reglas:

- Entrenamiento en pista requiere pista operativa si existe infraestructura acreditada.
- Fuerza/cardio requiere equipamiento compatible cuando el módulo lo especifica.
- Vídeo requiere recurso de análisis únicamente si la modalidad lo exige.
- Las operaciones sin dependencia especializada no adquieren requisitos artificiales.
- UNKNOWN mantiene continuidad legacy, marcada como no verificada.
- VERIFIED_UNAVAILABLE debe impedir la utilización del componente afectado.
- LIMITED debe tratarse por compatibilidad concreta y no mediante multiplicador.
- Las alternativas solo son válidas si representan equivalencia real aprobada.

Conectar resolución física con el punto productivo real de ejecución de sesiones.

La sesión no ejecutada no puede generar el estímulo de una sesión ejecutada.

Preservar las fórmulas, reglas de participación, staff, fatiga y Development existentes.

No modificar directamente Player ratings.

Si el sistema carece de un estado de sesión cancelada/aplazada, utilizar su autoridad existente o añadir el mínimo estado de ejecución necesario, con migración/Save compatible.

No crear una segunda agenda de entrenamientos.

## 4. MEDICAL

Introducir requisitos físicos solo para procedimientos concretos que dependan de recursos materiales:

- Imagen diagnóstica.
- Fisioterapia instrumental.
- Hidroterapia/crioterapia.
- Rehabilitación física especializada.
- Otras operaciones existentes con requisitos verificables.

No exigir un centro médico para emitir diagnósticos clínicos si el motor actual no lo requiere.

La restricción deberá aplicarse al procedimiento específico, no automáticamente a todo el tratamiento ni al pronóstico del jugador.

Conectar al consumidor productivo únicamente donde exista operación real con autoridad identificable.

Las operaciones pendientes o bloqueadas deben conservar trazabilidad y permitir reintento cuando vuelva a existir disponibilidad.

No inventar procedimientos médicos nuevos.

No alterar severidad, duración de lesión, probabilidades, recomendaciones o RTP salvo comportamiento expresamente autorizado por los sistemas propietarios.

## 5. RECOVERY Y BS12C

Preservar estrictamente BS12C.

Facilities NO puede:

- Reducir duración de lesiones.
- Añadir aceleradores de recuperación.
- Modificar fatiga directamente.
- Alterar probabilidades de recaída.
- Conceder RTP automáticamente.
- Crear un recovery building rating.

Puede informar y condicionar una actividad física concreta cuya ejecución dependa de un componente acreditado.

Los efectos de no ejecutar la actividad deben calcularse exclusivamente mediante la autoridad existente Training/Recovery, sin nueva fórmula Facilities.

Añadir tests negativos explícitos que demuestren la ausencia de efectos directos.

## 6. TALENT Y BS15

Verificar ancestry real.

Si BS15 no está integrado:

- No tocar Player supply.
- No copiar `src/domain/talent`.
- No duplicar el pipeline.
- Documentar BLOCKED_BY_LINEAGE.
- Definir el contrato de entrada física que consumirá BS15 después de la integración.
- Mantener el comportamiento actual de Talent.

Cuando la ancestry esté resuelta mediante integración autorizada:

- BS15 podrá consumir disponibilidad/acceso/capacidad física.
- Facilities nunca creará Players.
- Facilities nunca modificará potencial ni generará prospectos por sí mismo.
- No imponer cuotas de cantera sin demanda/capacidad comparables y política aplicable.
- Mantener el PlayerId y la autoridad de registro únicos.

No bloquear Training/Medical por la ausencia de BS15.

## 7. CAPACIDAD Y RECURSOS COMPARTIDOS

Solo imponer restricciones cuantitativas cuando existan:

- capacidad física conocida;
- unidad comparable;
- demanda conocida;
- mismo intervalo temporal;
- derechos válidos;
- autoridad de asignación sin doble reserva.

No construir un allocator global nuevo si las agendas existentes carecen de esos datos.

En tal caso, declarar capacidad operativa desconocida, sin presumir disponibilidad garantizada ni penalizar por una ocupación inventada.

Respetar contratos Team/Organization y CFI8 purpose-agnostic.

Conservar el comportamiento BS17C sobre obras, servicio y disponibilidad.

## 8. MX / MANAGER EXPERIENCE

El manager debe poder comprender:

- Operación afectada.
- Instalación y componente causantes.
- Limitación conocida.
- Consecuencia real.
- Alternativa verificada, si existe.
- Estado no verificado, cuando corresponda.
- Workspace al que debe acudir.

Reutilizar FacilitiesWorkspace y pantallas canónicas Training/Medical.

No crear una segunda pantalla Facilities.

No ofrecer reparaciones económicamente ejecutables antes de BS17E.

No etiquetar como LIVE una consecuencia que solo aparece en una proyección.

## 9. PRUEBAS DE CAUSALIDAD

Crear tests de pares de mundos iguales salvo una propiedad física.

Casos mínimos:

1. Entrenamiento con recurso funcional frente a recurso fuera de servicio.
2. Sesión con derecho acreditado frente a ausencia acreditada de derecho.
3. Recurso LIMITED compatible frente a incompatible.
4. Infraestructura desconocida con continuidad legacy.
5. Restauración física que recupera ejecución operativa.
6. Recurso alternativo válido.
7. Capacidad conocida con demanda comparable, si existe asignación autorizada.
8. Falta de capacidad conocida sin penalización inventada.
9. Procedimiento médico que requiere equipamiento operativo.
10. Procedimiento clínico sin dependencia física especializada.
11. Recovery sin modificadores directos.
12. Save/reload con resultados equivalentes.
13. Ninguna mutación directa MatchEngine.
14. Ninguna generación Player.
15. Ninguna escritura nueva Finance/Governance.

Para cada operación LIVE debe demostrarse:

Facility → estado físico → CFI8 → requisito → consumidor productivo → ejecución o bloqueo → resultado persistido → explicación.

No basta una prueba del read model.

Ejecutar regresivos relevantes BS17A/B/C, Training, Medical y Save.

## 10. FAST LOOP Y AUTOCORRECCIÓN

Trabajar en una ejecución coherente.

Auditoría mínima → implementación → wiring → tests → autocorrección → certificación.

No solicitar confirmación entre pasos.

Corregir defectos detectados dentro del alcance.

Si aparece una decisión adicional genuinamente necesaria, marcarla BLOCKED_BY_PRODUCT_DECISION y explicar su operación exacta.

No seleccionar porcentajes, duraciones ni penalizadores sin autoridad aprobada.

## 11. CERTIFICACIÓN

Separar claramente:

`BS17D TRAINING: LIVE/PARTIAL/BLOCKED`

`BS17D MEDICAL: LIVE/PARTIAL/BLOCKED`

`BS17D RECOVERY: COMPATIBLE/FAIL`

`BS17D TALENT: LIVE/BLOCKED_BY_LINEAGE`

Permitir:

`PASS · BS17D CORE TRAINING/MEDICAL`

solo cuando exista al menos una operación productiva real certificada en cada uno de esos dos sistemas, dentro de su alcance aprobado, además de la compatibilidad con BS12C.

No equivale al cierre completo del milestone.

`PASS · BS17D COMPLETE` exige también el cierre del contrato Talent después de integrar la autoridad BS15 y la cobertura final declarada.

Mientras Talent permanezca bloqueado, el estado global debe reflejar PARTIAL.

No degradar requisitos para obtener PASS.

## 12. VALIDACIÓN Y GIT

- Focused tests PASS.
- Tests causales PASS.
- Typecheck PASS.
- Build PASS.
- Save compatibility PASS.
- Diff check PASS.
- Finance/Governance production authority intacta.
- Sin `Math.random()` nuevo.
- Sin multiplicadores inventados.
- Sin Player generation paralela.

Crear commit local solo para trabajo validado y documentado.

Sin merge ni push.

Mantener worktree limpia al finalizar.

## 13. INFORME FINAL

BS17D-P0 RESULT

- STATUS GLOBAL
- BASE / FINAL SHA
- POLICY DOCUMENT
- TRAINING LIVE OPERATIONS
- MEDICAL LIVE OPERATIONS
- RECOVERY / BS12C
- TALENT / BS15 LINEAGE
- UNKNOWN / MISSING BEHAVIOR
- CAPACITY AND SHARED ACCESS
- CAUSAL PROOFS
- MX / UI
- SAVE
- FINANCE / GOVERNANCE DIFF
- TESTS
- TYPECHECK
- BUILD
- DIFF CHECK
- REMAINING BLOCKERS
- NEXT ACTION

No iniciar BS17E mientras BS16 no esté completado y las dependencias institucionales y económicas sigan pendientes.
