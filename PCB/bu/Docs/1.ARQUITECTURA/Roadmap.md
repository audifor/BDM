# 📋 Plan Maestro de Creación - Global Basketball Manager 2026

Después de analizar ambos documentos, he identificado que necesitas construir un **ecosistema de gestión deportiva híbrido** que combine profundidad táctica, RPG político y simulación realista. Aquí está el plan de creación estructurado:

---

## 🎯 FASE 0: FUNDAMENTOS TÉCNICOS (Semanas 1-2)

### Objetivo: Establecer la arquitectura base

**A. Stack y Estructura**

- Configurar entorno Python 3.12+ con SQLite
- Inicializar proyecto React 19 + TypeScript + Tailwind CSS v4
- Integrar Electron para comunicación IPC
- Establecer sistema de diseño "Tactical Elite Minimalism"

**B. Sistema de Colores y UI Base**

css

```css
Variables Core implementadas:
--bg-deep: #050505
--orange-primary: #FF7B39
--text-data: #E2E8F0
```

**C. Arquitectura de Componentes**

- `.player-card-elite`
- `.modal-glass-tactical`
- `.attribute-section-refined`
- Layout Bento (Dashboard modular)

---

## 🗄️ FASE 1: MODELO DE DATOS (Semanas 3-4)

### Objetivo: Construir la base de datos híbrida SQLite + JSON

**A. Tablas Maestras (SQLite)**

sql

```sql
1. Geografía (países, ciudades)
2. Entidades (clubes, universidades, academias, agencias, medios)
3. Competiciones (ligas, torneos)
4. Jugadores (con 90 atributos en JSON blob)
5. Personas (NPCs unificados: staff, agentes, árbitros, prensa)
6. Contratos (vínculos legales)
7. Employment_Registry (dobles contratos, cesiones)
```

**B. Índices de Búsqueda**

- `arquetipo_clave` (50 arquetipos)
- `origen_clave` (50 orígenes narrativos)
- `nivel_estimado` (calculado dinámicamente)

**C. JSON Blob Structure**

json

```json
{
  "atributos": {90 valores 1-1000},
  "idoneidad_posicional": {},
  "traits": [],
  "perks": [],
  "personalidad": "1 de 100",
  "mentalidad": "1 de 19",
  "origen_narrativo": "1 de 50"
}
```

---

## 👤 FASE 2: SISTEMA DE PERSONAJES (Semanas 5-6)

### Objetivo: Implementar los 5 pilares del ADN del jugador

**A. Los 100 Arquetipos de Personalidad**

- Matriz de dominancia, empatía, disciplina
- Efectos en química de equipo
- Sinergias y conflictos entre personalidades

**B. Los 50 Arquetipos de Juego**

- Organizados por posición (PG, SG, SF, PF, C)
- Boosts y nerfs específicos de gameplay
- Tabla de idoneidad posicional

**C. Las 19 Mentalidades**

- Comportamientos en situaciones críticas
- Influencia en toma de decisiones IA

**D. Los 50 Orígenes Narrativos**

- Historias de fondo procedurales
- Influencia en desarrollo y ambiciones

**E. Traits & Perks**

- 40 traits innatos (0-3 por jugador)
- 25 perks desbloqueables (3 niveles cada uno)

---

## ⚙️ FASE 3: GENERADOR PROCEDIMENTAL (Semanas 7-8)

### Objetivo: Sistema de creación de jugadores coherente

**A. Motor de Generación**

python

```python
def generate_player():
    # OBLIGATORIO: Exactamente 90 atributos (1-1000)
    # 1 personalidad de 100
    # 1 arquetipo de 50 (según posición)
    # 1 mentalidad de 19
    # 1 origen de 50
    # 0-3 traits innatos
    # Distribución gaussiana en atributos según arquetipo
```

**B. Validación de Consistencia**

- Total de atributos = 90
- Distribución por categorías (Tiro, Defensa, etc.)
- Coherencia arquetipo-atributos-posición

---

## 🌍 FASE 4: ECOSISTEMA ESPAÑOL MVP (Semanas 9-12)

### Objetivo: Vertical Slice jugable completo

**A. Competiciones Base**

- **ACB (Liga Endesa):** 18 equipos, 34 jornadas
- **Primera FEB:** 14 equipos, 26 jornadas
- Sistema de ascenso/descenso (2 directos + playoff)

**B. Competiciones Adicionales**

- Copa del Rey (Top 8, sede única)
- Supercopa ACB (4 equipos)

**C. Población del Mundo**

- ~370 jugadores (210 ACB + 160 Primera FEB)
- ~50 NPCs (entrenadores, agentes, prensa)
- Generación procedimental respetando cuotas de nacionalidad

---

## 🏀 FASE 5: MOTOR DE PARTIDO (Semanas 13-16)

### Objetivo: Simulación táctica profunda

**A. Motor Base**

- Vista 2D cenital (física de chapas)
- Cálculo posesión por posesión
- Sistema de fatiga y lesiones

**B. Pre-Partido**

- **Playbook Creator:** Diseñar jugadas (sets, triggers, flows)
- **Matchups:** Ajustes defensivos específicos
- **Rotaciones:** Programación situacional

**C. In-Game**

- Controles de velocidad (Pausa, 1x, 5x, 10x, Simular)
- Shouts (buffs/debuffs temporales)
- Timeouts con pizarra táctica
- Sustituciones manuales/automáticas

**D. Estadísticas Avanzadas**

- Box score completo
- Play-by-play log
- Métricas avanzadas (PER, +/-, True Shooting%)

---

## 💼 FASE 6: SISTEMA RPG DEL GM (Semanas 17-19)

### Objetivo: Convertir al jugador en personaje

**A. Orígenes del GM**

- Ex-Jugador (Autoridad alta, Finanzas bajas)
- Analista (Scouting alto, Respeto bajo)
- Ex-Agente (Negociación alta, Ética baja)
- Directivo (Política alta, Táctica baja)

**B. Economía Personal**

- Salario del GM (gasto en formación, soft power)
- Árbol de talentos (perks desbloqueables)
- Reputación como capital político

**C. Sistema de Decisiones**

- Dilemas morales con consecuencias permanentes
- Relaciones con Owner, Staff, Jugadores, Prensa

---

## 💬 FASE 7: HUB DE COMUNICACIÓN (Semanas 20-22)

### Objetivo: Interfaz estilo Microsoft Teams

**A. Las 3 Apps del Hub**

1. **News Stream:** Noticias oficiales (solo lectura)
2. **Rumor Mill:** Feed estilo Twitter (info fragmentada)
3. **Direct Connect:** Chats grupales y DMs

**B. Canales de Chat**

- `#LockerRoom` (Jugadores + Staff)
- `#CoachingStaff` (Solo técnicos)
- `#FrontOffice` (GM + Directiva)
- DMs privados con NPCs

**C. Sistema de Notificaciones**

- Gestión de Puntos de Atención
- Priorización de crisis (Salud, Vestuario, Prensa)

---

## 💰 FASE 8: ECONOMÍA Y CONTRATOS (Semanas 23-25)

### Objetivo: Sistema financiero realista

**A. Dualidad Regulatoria**

- **ACB/FIBA:** Presupuesto libre, cláusulas de rescisión
- **Preparar estructura para NBA:** Salary Cap (soft/hard), excepciones (MLE, Bird Rights)

**B. Tipos de Contrato**

- Temporales (1-3 meses con conversión)
- Rest of Season (ROS)
- Garantizados
- Dobles contratos (liga + europa)

**C. Economía Viva**

- Inflación anual
- Crisis macroeconómicas aleatorias
- TV deals dinámicos

---

## 🔍 FASE 9: SCOUTING Y MERCADO (Semanas 26-28)

### Objetivo: Niebla de Guerra Digital

**A. Sistema de 6 Tiers**

- Tier 1: Datos completos (jugadores propios)
- Tier 6: Rumores vagos (jugadores ocultos)

**B. Fuentes de Información**

- Ojeadores (precisión según skill)
- Agentes (hype manipulado)
- Vídeo (análisis manual)

**C. Wildcards**

- Apariciones orgánicas de joyas ocultas
- Sistema anti-save scum

---

## 🤖 FASE 10: IA Y ADN DE FRANQUICIA (Semanas 29-31)

### Objetivo: Rivales creíbles

**A. ADN de Club**

- Win-now, Rebuild, Tacaño
- Comportamiento según presión del Owner

**B. IA con Errores Humanos**

- No hace trampas (no ve atributos ocultos)
- Comete sobrepagos, fichajes emocionales
- Siente presión del despido

---

## 🎮 FASE 11: LOOPS DE JUEGO (Semanas 32-34)

### Objetivo: Ritmo de gestión en 3 bloques diarios

**A. Micro-Loop (Diario)**

- Mañana, Tarde, Noche
- Gestión de energía y fatiga

**B. Meso-Loop (Semanal)**

- Preparación de partido
- Instalación de playbooks
- Ruedas de prensa

**C. Macro-Loop (Mensual)**

- Reuniones con directiva
- Ajustes de plantilla

**D. Meta-Loop (Anual)**

- Mercado de fichajes
- Draft/Cantera
- Definición de objetivos

---

## 🧪 FASE 12: TESTING Y BALANCEO (Semanas 35-38)

### Objetivo: Ajuste fino

**A. Testeo de Ecosistema**

- Simulación de 10 temporadas automáticas
- Validación de ascensos/descensos
- Comprobación de inflación salarial

**B. Balanceo de Atributos**

- Ajuste de curvas de desarrollo
- Calibración de arquetipos

**C. UX/UI Polish**

- Feedback loops
- Tutoriales contextuales

---

## 🚀 FASE 13: MVP RELEASE (Semana 39-40)

### Entregables Mínimos

✅ Ecosistema español completo (ACB + Primera FEB)  
✅ 370+ jugadores generados proceduralmente  
✅ Motor de partido 2D funcional  
✅ Sistema RPG del GM  
✅ Hub de comunicación  
✅ Economía y contratos básicos  
✅ Scouting Tier 1-3  
✅ IA funcional con ADN de club

---

## 📈 FASE 14: EXPANSIÓN GLOBAL (Post-MVP)

### Roadmap Futuro

**A. Fase 2.1:** Euroliga (16 equipos adicionales)  
**B. Fase 2.2:** NCAA (Men/Women)  
**C. Fase 2.3:** NBA/WNBA con CBA completo  
**D. Fase 2.4:** Ligas FIBA (Europa, Asia, América)

---

## ⚠️ CONSIDERACIONES CRÍTICAS

**1. Escalabilidad desde el Día 1**

- Diseñar tablas pensando en 6 universos paralelos
- Polimorfismo en JSON para reglas específicas

**2. Validación Constante**

- Los 90 atributos son **innegociables**
- 1 personalidad, 1 arquetipo, 1 mentalidad, 1 origen **siempre**

**3. Performance**

- Índices en búsquedas de mercado
- Lazy loading de datos históricos
- Simulación en segundo plano (IPC)

**4. Narrativa Emergente**

- Cada decisión debe tener consecuencias visibles
- El GM debe sentirse presionado, no omnipotente

---

## 🎯 PRÓXIMO PASO SUGERIDO

Dado tu progreso actual (database y generador completados), te recomiendo:

**EMPEZAR POR FASE 5 (Motor de Partido)**

¿Por qué? Porque:

1. Es el core gameplay loop
2. Valida que tus 90 atributos funcionan
3. Te permite testear arquetipos y personalidades en acción
4. Es lo más satisfactorio de ver funcionando (motivación)

¿Te parece bien este plan? ¿Quieres que profundice en alguna fase específica o empezamos con el motor de partido?