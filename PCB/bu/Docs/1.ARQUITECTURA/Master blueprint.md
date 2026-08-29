Este es el **Master Blueprint de Arquitectura Técnica** para **Global Basketball Manager (GBM) 2026**. Este documento servirá como la "Biblia de Desarrollo" y especificación técnica para la construcción del simulador. Está diseñado para ser procesado por un equipo de desarrollo o una IA de codificación avanzada, integrando cada decisión tomada en nuestra fase de definición.
---
## 🏗️ 1. Arquitectura de Software y Stack
El sistema se basa en una arquitectura de **procesamiento desacoplado** para garantizar fluidez en la interfaz mientras se simulan miles de datos en segundo plano.
- **Core Engine (Backend):** **Python 3.12+**. Encargado de la lógica matemática, simulación de partidos, IA rival y gestión de la base de datos.
- **Interfaz (Frontend):** **React 19 + TypeScript**. Implementación de una UI reactiva y tipado estricto para evitar errores en la gestión de los 90 atributos.
- **Entorno de Escritorio:** **Electron**. Framework para empaquetar la aplicación, permitiendo comunicación IPC (Inter-Process Communication) entre Python y React.
- **Concepto:** Tactical Elite Minimalism (Evolución de Manager)
		**Versión:** 2.0.0 (Legacy Cyberpunk Adaptado)
		. Paleta de Colores & Identidad
		Hemos evolucionado de un estilo "Cyber" a uno de "Alta Precisión", optimizando el contraste para largas sesiones de gestión.
		### Variables Core
		|**Variable**|**Valor Hex**|**Uso Principal**|
		|---|---|---|
		|`--bg-deep`|`#050505`|Fondo principal (Modo Oscuro)|
		|`--bg-light`|`#F8FAFC`|Fondo principal (Modo Claro)|
		|`--orange-primary`|`#FF7B39`|Acciones, botones, valores destacados|
		|`--text-data`|`#E2E8F0`|Valores numéricos y fuentes mono|
		|`--text-dim`|`#64748B`|Etiquetas secundarias y descripciones|
		---
		## 📐 2. Clases Core de UI (Evolución de Componentes)
		### `.player-card-elite`
		_Anteriormente: `.player-card-cyber`_
		- **Descripción:** Contenedor de información de jugador.
		- **Estética:** Fondo neutro con un borde de acento izquierdo de 4px que solo brilla en estado `hover` o si el jugador es "Star".
		- **Implementación:**
		    - Borde: `1px solid rgba(255, 255, 255, 0.08)`
		    - Radio: `1.5rem` (24px)
		    - Sombra: Solo en modo claro (`shadow-xl`).
		### `.modal-glass-tactical`
		_Anteriormente: `.modal-glass-cyber`_
		- **Descripción:** Paneles de información profunda y menús contextuales.
		- **Propiedades:**
		    - `backdrop-filter: blur(25px) saturate(160%)`
		    - `background: rgba(5, 5, 5, 0.7)` (Ajustado para legibilidad)
		    - **Efecto:** Crea una jerarquía de capas clara sobre el fondo.
		### `.attribute-section-refined`
		_Anteriormente: `.attribute-section-cyber`_
		- **Descripción:** Visualización de estadísticas (Tiro, Defensa, etc.).
		- **Regla de Oro:** Usar fuentes `JetBrains Mono` para los números. Las barras de progreso deben ser minimalistas (4px de alto) con un sutil resplandor (`glow`) solo en valores >90.
		---
		## 🍱 3. Arquitectura Bento (Layout)
		El dashboard se rige por una cuadrícula modular donde la jerarquía se define por el tamaño del bloque:
		- **Bloque 2x2:** Información crítica en tiempo real (Partido en vivo, Gráfico de táctica).
		- **Bloque 1x2:** Listados de jugadores o clasificación.
		- **Bloque 1x1:** Métricas rápidas (Presupuesto, Moral, Fatiga).
		---
		## 🌓 4. Lógica Dark/Light Mode
		El cambio de tema no es solo una inversión de colores, es un cambio de contexto:
		1. **Modo Oscuro (The War Room):** Enfoque en el rendimiento y los datos que brillan sobre el fondo. Ideal para "jugar".
		2. **Modo Claro (The Scouting Report):** Enfoque en la lectura limpia y el análisis. Se siente como un documento oficial de oficina técnica.
		---
		## 🛠 5. Stack de Implementación Sugerido
		- **Framework:** React 19 / Next.js
		- **Estilos:** Tailwind CSS v4.0+
		- **Iconografía:** Lucide React (Grosor: 1.5px para mantener el aire técnico).
		- **Fuentes:** * _Inter_: Para textos de interfaz y lectura.
		    - _JetBrains Mono_: Para todos los datos numéricos y coordenadas.
---
### 2. Modelo de Datos Híbrido (SQLite + JSON)
Diseñado para la máxima escalabilidad, profundidad narrativa y soporte de "Niebla de Guerra".
#### A. Base de Datos Relacional (SQLite)
Utilizada para entidades con alta frecuencia de búsqueda, relaciones estructurales y mantenimiento de integridad referencial.
- **Tablas Maestras:**
    - `Geografía` (Países y Ciudades unificadas).
    - `Entidades` (Clubes, Universidades, Academias, **Agencias** y **Medios de Comunicación**).
    - `Competiciones` (Ligas y Torneos).
    - `Jugadores` (Protagonistas principales).
    - **`Personas` (NPCs):** Tabla unificada para **Staff** (Entrenadores, GMs, Médicos), **Agentes**, **Árbitros**, **Prensa** y **VIPs**.
    - `Contratos` (Vínculos legales y económicos).
- **Employment_Registry:** Tabla de vinculación temporal activa. Permite situaciones complejas como:
    - **Dobles Contratos:** Jugadores activos en dos ligas simultáneas (ej: Temporada WNBA + Temporada Euroliga).
    - **Cesiones (Loans):** Un jugador pertenece a una Entidad (Club A) pero presta servicio en otra (Club B).
- **Cache de Búsqueda (Indexing):** Columnas indexadas extraídas del JSON para consultas ultrarrápidas en el mercado sin parsear blobs:
    - `arquetipo_clave` (ej: 'Playmaker Puro').
    - `origen_clave` (ej: 'Dinastía de Élite').
    - `nivel_estimado` (Calculado dinámicamente para la IA, no visible para el usuario).
#### B. Mochila de Datos (JSON Blob)
Almacenamiento flexible y polimórfico dentro de cada registro para la profundidad de la simulación.
- **Estructura de Reglas (Competiciones):** Esquema dinámico que define ascensos/descensos, _Luxury Tax_, reglas de Draft, criterios de desempate y formatos de Playoffs.
- **Estructura de Jugador (Deep Profile):** Almacena los **90 atributos (Escala 1-1000)**, la matriz de **Idoneidad Posicional**, lista de **Traits** (Innatos), **Perks** (Técnicos) y la "Narrativa Emergente" (Origen + Mentalidad).
- **Estructura de Personas (Polimorfismo):** El contenido del JSON cambia según el `rol`:
    - Si es _Entrenador_: Atributos tácticos y de desarrollo.
    - Si es _Agente_: Atributos de negociación y avaricia.
    - Si es _Árbitro_: Rigor, paciencia y "factor casero".
    


Entiendo perfectamente lo que quieres. No buscas un simple juego de baloncesto, buscas el **"Simulador Definitivo de Ecosistemas de Baloncesto"**.

Lo que describes es un sistema **multi-universo interconectado**. El desafío no es solo tener muchas ligas, sino que **cada universo "sienta" y "juegue" diferente** a nivel de gestión (no es lo mismo fichar en la NCAA con becas que negociar un traspaso con _Trade Exception_ en la NBA o pagar una cláusula de rescisión en la Euroliga).

Aquí tienes una **versión técnica y afinada** de tu explicación, estructurada como un **Documento de Diseño de Juego (GDD)**. Esto te servirá para tener claro el alcance y para futuras instrucciones.

---
### 3. Definición del Proyecto: "Global Basketball Ecosystem"

#### 1. Los 6 Universos Jugables (Core Universes)
El juego debe simular con **fidelidad legal, financiera y deportiva** los siguientes entornos, respetando sus diferencias de género (Masculino/Femenino):
- **🇺🇸 USA Pro (NBA / WNBA):** Ligas cerradas (franquicias).    
    - **Claves:** Salary Cap (Soft/Hard/Apron), Convenio Colectivo (CBA), Draft, Agencia Libre, Traspasos complejos, Ligas de Desarrollo (G-League).        
    - _Diferencia WNBA:_ Calendario de verano, reglas de "Prioritization" (conflicto con jugar en Europa), Cap mucho más estricto y plantillas cortas.       
- **🎓 USA Amateur (NCAA Men / NCAA Women):** Ligas universitarias.    
    - **Claves:** Reclutamiento (Recruiting) en institutos, Portal de Transferencias (Transfer Portal), NIL (Derechos de Imagen/Dinero), Elegibilidad académica (GPA), March Madness (torneo de eliminación directa).        
- **🌍 FIBA International (Men / Women):** Ligas abiertas (clubes).    
    - **Claves:** Sistema piramidal (Ascensos/Descensos), Mercado de Fichajes libre (compras/ventas con cláusulas), Cupos de extranjeros (Comunitarios/Cotonou/Extracomunitarios), Doble competición simultánea (Liga Nacional + Copa Europea).    
#### 2. Estructura de Competiciones (Competitions Framework)
El sistema debe generar dinámicamente o tener predefinidas las siguientes capas de competición para cada país/región activo:
**A. Competiciones Domésticas (Ligas Nacionales):**
- **Formato:** Liga Regular (Ida/Vuelta) + Playoffs por el título.    
- **Movilidad:** Ligas con Ascenso y Descenso directo o vía Playoff (Playouts).    
- **Reglas:** Normativas específicas de plantilla (ej: ACB exige cupos de formación, NBA exige roster de 15).    

**B. Copas Nacionales y Eventos de Mitad de Temporada:**
- **Copas KO:** Estilo Copa del Rey (España) o Coppa Italia (Top 8 a mitad de temporada, sede única, eliminación directa).    
- **In-Season Tournaments:** Estilo NBA Cup (Fase de grupos integrada en liga + Final Four).    
- **Supercopas:** Campeón de Liga vs Campeón de Copa al inicio de la temporada.    
- **All-Star Weekend:** Eventos de espectáculo en NBA/WNBA.    

**C. Competiciones Continentales (Supra-nacionales):**
- **Nivel 1 (Elite):** EuroLeague (M/W). Formato liga semi-cerrada o licencias.    
- **Nivel 2:** EuroCup / BCL. Formato grupos + eliminatorias.    
- **Mecanismo de Clasificación:** Los equipos se clasifican a Europa según su posición en la Liga Doméstica el año anterior (Mérito deportivo).  
#### 3. Profundidad de Realismo (Simulation Depth)
Para que el simulador sea válido, debe gestionar estas diferencias críticas:

| **Característica**      | **Universo NBA/WNBA**                         | **Universo NCAA**                   | **Universo FIBA (Europa/Mundo)**              |
| ----------------------- | --------------------------------------------- | ----------------------------------- | --------------------------------------------- |
| **Adquisición Jugador** | Draft, Traspaso, Agencia Libre                | Reclutamiento (High School), Portal | Fichaje libre, Pago de Cláusula               |
| **Economía**            | Límite Salarial (Cap Space), Impuesto de Lujo | Presupuesto NIL, Becas (13-15 máx)  | Presupuesto Neto/Bruto, Cash puro             |
| **Contratos**           | Garantizados, Two-Way, 10-Day                 | Acuerdo de Beca (1 año renovable)   | Temporal, Garantizado, Por obra               |
| **Calendario**          | 82 partidos (Oct-Jun) / 40 (WNBA)             | 30-35 partidos (Nov-Marzo)          | 60-70 partidos (Liga + Europa simultáneo)     |
| **Reglas Pista**        | Cuartos 12 min, Expulsión 6 faltas            | 2 Mitades de 20 min, Posesión 30s   | Cuartos 10 min, Reglas FIBA (pasos, zona)     |
| **Éxito**               | Anillo, Beneficio del Dueño                   | Título Nacional, Prestigio Programa | Títulos, Evitar Descenso, Clasificar a Europa |

### 💼 4. El Ecosistema Humano (RPG & Staff)
El juego se gestiona a través de una interfaz estilo **Microsoft Teams** con módulos de chat, chats grupales (jugadores + staff, solo staff, solo jugadores) y news feed.
## 📑 5. Lógica de Mercado y Scouting 3.0
Sistema de **"Niebla de Guerra Digital"** basado en 6 Tiers de infraestructura de datos.
- **Scouting Híbrido:** Combinación de listas estructurales (Draft), avistamientos orgánicos (Wildcards) y ofertas de agentes (Hype).
- **Módulo FIBA Youth:** Gestión de canteras desde los 14 años con cláusulas de salida (`NBA Out`) negociables.
- **Economía (A+C):** Crecimiento orgánico mediante inflación anual e interrupciones bruscas por crisis macroeconómicas aleatorias.
- Hablando de contratos, estos son los pilares del Sistema de Contratos:
	Dualidad Regulatoria Total: Un motor capaz de validar contratos bajo el CBA (NBA/WNBA) con sus excepciones (Supermax, MLE, Bird Rights) y, simultáneamente, gestionar la anarquía del NIL en la NCAA (fondos externos de Boosters sin salarios del club) o los contratos estilo fiba.
	Modularidad Temporal (Temporeros): Capacidad de firmar por 1, 2 o 3 meses con cláusulas de conversión dinámica. El GM decide cuándo pasarlo a Rest of Season (ROS) o el contrato lo hace automáticamente según hitos pactados.
	
## 📅 6. El Loop de Juego: Agenda Realista
Gestión de tiempo basada en **3 Bloques Diarios** (Mañana, Tarde, Noche).
- **Recurso Crítico:** Horas y Energía.
- **Cálculo de Fatiga Acumulada:**
    $$E_{t+1} = E_t - \sum_{i=1}^{3} (\text{Costo}_i \times \alpha) + \text{Recuperación}_{\text{noche}}$$
- **Eventos de Vida Real:** Piques en el vestuario, dinámicas de grupos (Cliques) y presión mediática influyendo en la moral.
---
