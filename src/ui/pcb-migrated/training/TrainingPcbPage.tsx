import {
  useMemo,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { GameWorld } from "@/domain/world";
import { getCareerFatigueForPlayer, getDevelopmentStimulusForPlayer, getTeamRoster } from "@/domain/world";
import { getUserTeam } from "@/engine/calendar";
import { addDays, formatGameDate, parseGameDate } from "@/domain/date";
import { BASKETBALL_RATING_KEYS, type BasketballRatingKey, type Player } from "@/domain/player";
import type { Team } from "@/domain/team";
import type { TeamId } from "@/domain/ids";
import { TRAINING_MODULES as DOMAIN_TRAINING_MODULES } from "@/domain/training";
import type { TrainingFocus, TrainingIntensity as DomainTrainingIntensity } from "@/domain/training";
import { ATTRIBUTE_LABELS } from "@/ui/attributeLabels";
import { selectLatestUserTrainingSession, selectUserTrainingPlan } from "@/stores/gameStore";
import {
  addTrainingSession,
  createTrainingPlan,
  deleteTrainingSession,
  updateTrainingSession,
  type TrainingDay,
  type TrainingIntensity,
  type TrainingSession,
} from "./TrainingMigrationRepository";
import DraggableSubnav from "../club/components/DraggableSubnav";
import "./TrainingPcbPage.css";

export type TrainingPcbTab = "team" | "personal" | "load" | "staff" | "modules";
const tabs: readonly [TrainingPcbTab, string][] = [
  ["team", "Equipo"],
  ["personal", "Individual"],
  ["load", "Carga"],
  ["staff", "Staff"],
  ["modules", "Módulos"],
];

const FOCUS_LABELS: Record<TrainingFocus, string> = {
  balanced: "Equilibrado",
  finishing: "Finalización",
  shooting: "Tiro",
  playmaking: "Creación",
  perimeterDefense: "Defensa exterior",
  interiorDefense: "Defensa interior",
  rebounding: "Rebote",
  athleticism: "Atletismo",
};
const INTENSITY_LABELS: Record<DomainTrainingIntensity, string> = {
  light: "Baja",
  normal: "Media",
  high: "Alta",
};
const MODULE_NAME_LABELS: Record<string, string> = {
  balanced: "Equilibrado",
  shooting: "Tiro exterior",
  finishing: "Finalización",
  creation: "Creación",
  defense: "Defensa",
  rebounding: "Rebote",
  physical: "Físico",
};

function playerName(player: Player): string {
  return `${player.firstName} ${player.lastName}`;
}

/** ISO weekday (1 = Monday .. 7 = Sunday) for a GameDate, using the same proleptic UTC calendar as GameDate arithmetic. */
function isoWeekday(date: ReturnType<typeof parseGameDate>): number {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

/** Real Mon-Sun calendar week range anchored on the Monday of world.currentDate's week, offset by `week` weeks. */
function trainingWeekRangeLabel(world: GameWorld | undefined, week: number): string {
  if (world === undefined) return "Sin fecha de referencia";
  const today = parseGameDate(world.currentDate);
  const monday = addDays(today, -(isoWeekday(today) - 1));
  const anchor = addDays(monday, week * 7);
  const start = formatGameDate(anchor);
  const end = formatGameDate(addDays(anchor, 6));
  return `${start} - ${end}`;
}

/** Aggregates real roster + per-player development stimulus + fatigue, mirroring TrainingScreen's getTrainingImpact. */
function getTrainingImpact(world: GameWorld, teamId: TeamId) {
  const players = getTeamRoster(world, teamId);
  const totals = Object.fromEntries(
    BASKETBALL_RATING_KEYS.map((key) => [
      key,
      players.reduce((sum, player) => sum + (getDevelopmentStimulusForPlayer(world, player.id)?.byRating[key] ?? 0), 0),
    ]),
  ) as Record<BasketballRatingKey, number>;
  const fatigue = players.map((player) => getCareerFatigueForPlayer(world, player.id));
  return {
    players,
    totals,
    averageFatigue: fatigue.length === 0 ? 0 : fatigue.reduce((sum, value) => sum + value, 0) / fatigue.length,
  };
}

function useResizableTrainingColumns(initialWidths: readonly number[]) {
  const [widths, setWidths] = useState(initialWidths);
  const startResize =
    (index: number) => (event: ReactPointerEvent<HTMLSpanElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX,
        initialWidth = widths[index] ?? 120;
      const move = (next: PointerEvent) =>
        setWidths((current) =>
          current.map((width, widthIndex) =>
            widthIndex === index
              ? Math.max(72, initialWidth + next.clientX - startX)
              : width,
          ),
        );
      const stop = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", stop);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", stop);
    };
  return {
    style: {
      gridTemplateColumns: widths.map((width) => `${width}px`).join(" "),
    } as CSSProperties,
    startResize,
    widths,
  };
}

function TrainingColumnResizeHandle({
  onPointerDown,
}: {
  readonly onPointerDown: (event: ReactPointerEvent<HTMLSpanElement>) => void;
}) {
  return (
    <span
      aria-label="Ajustar ancho de columna"
      className="pcb-training__column-resize"
      onPointerDown={onPointerDown}
    />
  );
}

export function TrainingPcbPage({
  initialTab = "team",
  world,
  onIntensity,
  onFocus,
}: {
  readonly initialTab?: TrainingPcbTab;
  readonly world?: GameWorld;
  readonly onIntensity?: (value: DomainTrainingIntensity) => void;
  readonly onFocus?: (value: TrainingFocus) => void;
}) {
  const [tab, setTab] = useState<TrainingPcbTab>(initialTab);
  const [plan, setPlan] = useState<readonly TrainingDay[]>(createTrainingPlan);
  const team = useMemo(() => (world === undefined ? undefined : getUserTeam(world)), [world]);
  return (
    <section aria-label="Entrenamiento PCB migrado" className="pcb-training">
      <DraggableSubnav
        className="pcb-training__subnav"
        items={tabs.map(([id, label]) => ({
          id,
          label,
          active: tab === id,
          onClick: () => setTab(id),
        }))}
        storageKey="pcbasket.subnav.training"
      />
      {tab === "team" ? (
        <TeamTraining
          plan={plan}
          setPlan={setPlan}
          world={world}
          team={team}
          onIntensity={onIntensity}
          onFocus={onFocus}
        />
      ) : tab === "personal" ? (
        <PersonalTraining world={world} team={team} />
      ) : tab === "load" ? (
        <LoadManagementInteractive world={world} team={team} />
      ) : tab === "staff" ? (
        <StaffAssignments />
      ) : (
        <TrainingModules />
      )}
    </section>
  );
}

function TeamTraining({
  plan,
  setPlan,
  world,
  team,
  onIntensity,
  onFocus,
}: {
  readonly plan: readonly TrainingDay[];
  readonly setPlan: React.Dispatch<
    React.SetStateAction<readonly TrainingDay[]>
  >;
  readonly world?: GameWorld;
  readonly team?: Team;
  readonly onIntensity?: (value: DomainTrainingIntensity) => void;
  readonly onFocus?: (value: TrainingFocus) => void;
}) {
  const [saved, setSaved] = useState(false);
  const [week, setWeek] = useState(0);
  const [editor, setEditor] = useState<{
    readonly dayIndex: number;
    readonly session?: TrainingSession;
  }>();
  const trainingPlan = world === undefined ? undefined : selectUserTrainingPlan(world);
  const latestSession = world === undefined ? undefined : selectLatestUserTrainingSession(world);
  const impact = world !== undefined && team !== undefined ? getTrainingImpact(world, team.id) : undefined;
  const saveSession = (session: Omit<TrainingSession, "id">) => {
    if (editor === undefined) return;
    const current = editor.session;
    const next = {
      ...session,
      id:
        current?.id ??
        `local-${editor.dayIndex}-${plan[editor.dayIndex]!.sessions.length}`,
    };
    setPlan((value) =>
      current === undefined
        ? addTrainingSession(value, editor.dayIndex, next)
        : updateTrainingSession(value, editor.dayIndex, next),
    );
    setEditor(undefined);
  };
  return (
    <main className="pcb-training__bento pcb-training__team">
      <section className="pcb-training__card pcb-training__hero">
        <div className="pcb-training__hero-top">
          <div>
            <h2>Team Training</h2>
            <p>
              Semana {trainingWeekRangeLabel(world, week)}
            </p>
          </div>
          <div className="pcb-training__chips">
            <span>{team === undefined ? "Sin equipo asignado" : team.name}</span>
            {trainingPlan !== undefined && (
              <span>
                Última sesión:{" "}
                {latestSession === undefined
                  ? "Sin sesiones registradas"
                  : `${latestSession.gameDate} · ${INTENSITY_LABELS[latestSession.intensity]}`}
              </span>
            )}
            {impact !== undefined && (
              <span>Fatiga media {impact.averageFatigue.toFixed(1)}</span>
            )}
          </div>
        </div>
        <div className="pcb-training__controls">
          <label>
            Intensidad
            <select
              onChange={(event) => onIntensity?.(event.target.value as DomainTrainingIntensity)}
              value={trainingPlan?.intensity ?? "normal"}
            >
              <option value="light">Baja</option>
              <option value="normal">Media</option>
              <option value="high">Alta</option>
            </select>
          </label>
          <label>
            Foco
            <select
              onChange={(event) => onFocus?.(event.target.value as TrainingFocus)}
              value={trainingPlan?.focus ?? "balanced"}
            >
              {(Object.keys(FOCUS_LABELS) as TrainingFocus[]).map((value) => (
                <option key={value} value={value}>
                  {FOCUS_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <div className="pcb-training__control-actions">
            <button
              className="is-primary"
              onClick={() => setSaved(true)}
              type="button"
            >
              {saved ? "Guardado" : "Guardar Plan"}
            </button>
          </div>
        </div>
      </section>
      <div className="pcb-training__layout">
        <section className="pcb-training__plan">
          <div className="pcb-training__week">
            <button onClick={() => setWeek((value) => value - 1)} type="button">
              Anterior
            </button>
            <div>
              <strong>
                {trainingWeekRangeLabel(world, week)}
              </strong>
              <small>Semana de planificación</small>
            </div>
            <button onClick={() => setWeek((value) => value + 1)} type="button">
              Siguiente
            </button>
          </div>
          <div className="pcb-training__days">
            {plan.map((day, dayIndex) => (
              <article className="pcb-training__day" key={day.name}>
                <header>
                  <strong>{day.name}</strong>
                  <button onClick={() => setEditor({ dayIndex })} type="button">
                    + Sesión
                  </button>
                </header>
                <div>
                  {day.sessions.length === 0 ? (
                    <p>Descanso</p>
                  ) : (
                    day.sessions.map((session) => (
                      <article
                        className="pcb-training__session"
                        key={session.id}
                      >
                        <button
                          onClick={() => setEditor({ dayIndex, session })}
                          type="button"
                        >
                          <span>
                            <b>{session.focus}</b>
                            <em>•••</em>
                          </span>
                          <small>
                            {session.time} · {session.intensity}
                          </small>
                          <i
                            className={`is-${session.intensity.toLocaleLowerCase()}`}
                          >
                            {session.intensity}
                          </i>
                        </button>
                        <button
                          className="pcb-training__delete"
                          onClick={() =>
                            setPlan((value) =>
                              deleteTrainingSession(
                                value,
                                dayIndex,
                                session.id,
                              ),
                            )
                          }
                          title="Eliminar sesión"
                          type="button"
                        >
                          ×
                        </button>
                      </article>
                    ))
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
        <Calendar />
      </div>
      {editor !== undefined && (
        <SessionModal
          initial={editor.session}
          onClose={() => setEditor(undefined)}
          onSave={saveSession}
        />
      )}
    </main>
  );
}
function Calendar() {
  return (
    <aside className="pcb-training__calendar">
      <header>
        <h3>Planificación</h3>
        <span>Bloc de notas semanal</span>
      </header>
      <div className="pcb-training__calendar-grid">
        {["L", "M", "X", "J", "V", "S", "D"].map((x) => (
          <b key={x}>{x}</b>
        ))}
        {Array.from({ length: 35 }, (_, index) => (
          <span key={index} />
        ))}
      </div>
      <p>
        Espacio de planificación libre: usa el planificador de la izquierda
        para anotar sesiones de esta sesión de trabajo.
      </p>
    </aside>
  );
}
function SessionModal({
  initial,
  onClose,
  onSave,
}: {
  readonly initial?: TrainingSession;
  readonly onClose: () => void;
  readonly onSave: (session: Omit<TrainingSession, "id">) => void;
}) {
  const [time, setTime] = useState(initial?.time ?? "10:00");
  const [endTime, setEndTime] = useState("11:30");
  const [focus, setFocus] = useState(initial?.focus ?? "Técnica individual");
  const [intensity, setIntensity] = useState<TrainingIntensity>(
    initial?.intensity ?? "Media",
  );
  const durationMinutes = (() => {
    const [startH, startM] = time.split(":").map(Number);
    const [endH, endM] = endTime.split(":").map(Number);
    const minutes = endH! * 60 + endM! - (startH! * 60 + startM!);
    return minutes > 0 ? minutes : 0;
  })();
  return (
    <div className="pcb-training__modal">
      <section>
        <header>
          <h3>{initial === undefined ? "Nueva sesión" : "Editar sesión"}</h3>
          <button onClick={onClose} type="button">
            ×
          </button>
        </header>
        <label>
          Tipo
          <select
            value={focus}
            onChange={(event) => setFocus(event.target.value)}
          >
            <option>Técnica individual</option>
            <option>Fuerza y potencia</option>
            <option>Sistemas ofensivos</option>
            <option>Recuperación</option>
          </select>
        </label>
        <div className="pcb-training__modal-grid">
          <label>
            Inicio
            <input
              onChange={(event) => setTime(event.target.value)}
              type="time"
              value={time}
            />
          </label>
          <label>
            Fin
            <input
              onChange={(event) => setEndTime(event.target.value)}
              type="time"
              value={endTime}
            />
          </label>
        </div>
        <label>
          Foco
          <select
            value={focus}
            onChange={(event) => setFocus(event.target.value)}
          >
            <option>Tiro exterior</option>
            <option>Defensa individual</option>
            <option>Concentración</option>
          </select>
        </label>
        <div className="pcb-training__intensity">
          {(["Baja", "Media", "Alta"] as const).map((value) => (
            <button
              className={value === intensity ? "is-active" : ""}
              key={value}
              onClick={() => setIntensity(value)}
              type="button"
            >
              {value}
            </button>
          ))}
        </div>
        <div className="pcb-training__effects">
          <strong>Impacto estimado</strong>
          <span>
            Carga {durationMinutes} AU · {focus} · Concentración
          </span>
        </div>
        <footer>
          <button onClick={onClose} type="button">
            Cancelar
          </button>
          <button
            className="is-primary"
            onClick={() => onSave({ time, focus, intensity })}
            type="button"
          >
            Guardar sesión
          </button>
        </footer>
      </section>
    </div>
  );
}
function PersonalTraining({
  world,
  team,
}: {
  readonly world?: GameWorld;
  readonly team?: Team;
}) {
  const columns = useResizableTrainingColumns([250, 88, 180, 150, 240]);
  const labels = ["Jugador", "Pos", "Focus", "Intensidad", "Objetivo"];
  const players = world !== undefined && team !== undefined ? getTeamRoster(world, team.id) : [];
  const plan = world === undefined ? undefined : selectUserTrainingPlan(world);
  return (
    <main className="pcb-training__bento pcb-training__personal-page">
      <header className="pcb-training__personal-toolbar">
        <div>
          <h2>Entrenamiento individual</h2>
          <small>Plan de desarrollo por jugador</small>
        </div>
        <div className="pcb-training__personal-pills">
          <span>{players.length} jugadores</span>
        </div>
      </header>
      <div className="pcb-training__table pcb-training__personal">
        <div className="is-head" style={columns.style}>
          {labels.map((label, index) => (
            <span key={label}>
              {label}
              <TrainingColumnResizeHandle
                onPointerDown={columns.startResize(index)}
              />
            </span>
          ))}
        </div>
        {players.length === 0 ? (
          <p>No hay jugadores en la plantilla del usuario.</p>
        ) : (
          players.map((player) => {
            const stimulus = world === undefined ? undefined : getDevelopmentStimulusForPlayer(world, player.id);
            const topRating = stimulus === undefined
              ? undefined
              : BASKETBALL_RATING_KEYS.slice().sort((a, b) => (stimulus.byRating[b] ?? 0) - (stimulus.byRating[a] ?? 0))[0];
            return (
              <div key={player.id} style={columns.style}>
                <b>{playerName(player)}</b>
                <span>{player.basketball.primaryPosition}</span>
                <span>{plan === undefined ? "—" : FOCUS_LABELS[plan.focus]}</span>
                <i>{plan === undefined ? "—" : INTENSITY_LABELS[plan.intensity]}</i>
                <span>{topRating === undefined ? "Sin estímulo registrado" : ATTRIBUTE_LABELS[topRating]}</span>
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}
function LoadManagementInteractive({
  world,
  team,
}: {
  readonly world?: GameWorld;
  readonly team?: Team;
}) {
  const [query, setQuery] = useState("");
  const [riskOnly, setRiskOnly] = useState(false);
  const [fatigueOnly, setFatigueOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [sortDirection, setSortDirection] = useState<
    "ascending" | "descending"
  >("ascending");
  const [view, setView] = useState("Principal");
  const [columns, setColumns] = useState<readonly string[]>([
    "JUGADOR",
    "POS",
    "FATIGA",
    "ESTADO",
  ]);
  const loadColumns = useResizableTrainingColumns([220, 88, 160, 160]);
  const loadGridStyle = {
    gridTemplateColumns: columns
      .map((_, index) => `${loadColumns.widths[index] ?? 120}px`)
      .join(" "),
  } as CSSProperties;
  const players = world !== undefined && team !== undefined ? getTeamRoster(world, team.id) : [];
  const rowsData = useMemo(
    () =>
      players.map((player) => ({
        player,
        fatigue: world === undefined ? 0 : getCareerFatigueForPlayer(world, player.id),
      })),
    [players, world],
  );
  const rows = useMemo(
    () =>
      rowsData
        .filter(
          ({ player, fatigue }) =>
            playerName(player).toLocaleLowerCase().includes(query.toLocaleLowerCase()) &&
            (!riskOnly || fatigue > 70) &&
            (!fatigueOnly || fatigue > 70),
        )
        .slice()
        .sort(
          (left, right) =>
            (left.fatigue - right.fatigue) * (sortDirection === "ascending" ? 1 : -1),
        ),
    [rowsData, fatigueOnly, query, riskOnly, sortDirection],
  );
  const averageFatigue = rowsData.length === 0 ? 0 : rowsData.reduce((sum, row) => sum + row.fatigue, 0) / rowsData.length;
  const riskCount = rowsData.filter((row) => row.fatigue > 70).length;
  const optimalCount = rowsData.filter((row) => row.fatigue <= 70).length;
  const columnCell = (column: string, row: { readonly player: Player; readonly fatigue: number }) => {
    if (column === "JUGADOR") return <b>{playerName(row.player)}</b>;
    if (column === "POS") return <i>{row.player.basketball.primaryPosition}</i>;
    if (column === "FATIGA") return <Bar value={Math.round(row.fatigue)} />;
    return (
      <em className={`pcb-training__badge is-${row.fatigue > 70 ? "risk" : "optimal"}`}>
        {row.fatigue > 70 ? "ALTO RIESGO" : "ÓPTIMO"}
      </em>
    );
  };
  return (
    <main className="pcb-training__bento">
      <section className="pcb-training__card">
        <header className="pcb-training__card-head">
          <h2>Load Management</h2>
          <span>Control de cargas</span>
        </header>
        <div className="pcb-training__metrics">
          <Metric label="ALERTA LESIÓN" value={String(riskCount)} tone="danger" icon="⌁" />
          <Metric label="CARGA ÓPTIMA" value={String(optimalCount)} tone="good" icon="✓" />
          <Metric label="FATIGA MEDIA" value={`${averageFatigue.toFixed(0)}%`} tone="warn" icon="▰" />
        </div>
        <div className="pcb-training__load-toolbar">
          <div>
            {["Principal", "Riesgo", "Recuperación"].map((item) => (
              <button
                className={item === view ? "is-primary" : ""}
                key={item}
                onClick={() => setView(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>
          <div>
            <input
              aria-label="Buscar jugador"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar jugador..."
              value={query}
            />
            <button
              className={filtersOpen ? "is-filtering" : ""}
              onClick={() => setFiltersOpen((value) => !value)}
              type="button"
            >
              ⌕ Filtros
            </button>
            <button
              aria-expanded={columnsOpen}
              onClick={() => setColumnsOpen((value) => !value)}
              title="Columnas"
              type="button"
            >
              •••
            </button>
          </div>
        </div>
        {filtersOpen && (
          <div className="pcb-training__filters">
            <label>
              <input
                checked={riskOnly}
                onChange={(event) => setRiskOnly(event.target.checked)}
                type="checkbox"
              />{" "}
              Solo Alto Riesgo
            </label>
            <label>
              <input
                checked={fatigueOnly}
                onChange={(event) => setFatigueOnly(event.target.checked)}
                type="checkbox"
              />{" "}
              Fatiga Alta (&gt;70%)
            </label>
          </div>
        )}
        {columnsOpen && (
          <div className="pcb-training__column-menu">
            {["JUGADOR", "POS", "FATIGA", "ESTADO"].map((column) => (
              <label key={column}>
                <input
                  checked={columns.includes(column)}
                  disabled={column === "JUGADOR"}
                  onChange={() =>
                    setColumns((current) =>
                      current.includes(column)
                        ? current.filter((item) => item !== column)
                        : [...current, column],
                    )
                  }
                  type="checkbox"
                />{" "}
                {column}
              </label>
            ))}
          </div>
        )}
        <div
          className="pcb-training__table pcb-training__load"
          style={loadGridStyle}
        >
          <div
            className="is-head"
            style={loadGridStyle}
          >
            {columns.map((column, index) =>
              column === "FATIGA" ? (
                <button
                  key={column}
                  onClick={() =>
                    setSortDirection((value) =>
                      value === "ascending" ? "descending" : "ascending",
                    )
                  }
                  type="button"
                >
                  {column} {sortDirection === "ascending" ? "↑" : "↓"}
                  <TrainingColumnResizeHandle onPointerDown={loadColumns.startResize(index)} />
                </button>
              ) : (
                <span key={column}>{column}<TrainingColumnResizeHandle onPointerDown={loadColumns.startResize(index)} /></span>
              ),
            )}
          </div>
          {rows.length === 0 ? (
            <p>No hay jugadores disponibles.</p>
          ) : (
            rows.map((row) => (
              <div
                className={selected === row.player.id ? "is-selected" : ""}
                key={row.player.id}
                onClick={() => setSelected(row.player.id)}
                style={loadGridStyle}
              >
                {columns.map((column) => (
                  <span key={column}>{columnCell(column, row)}</span>
                ))}
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
function Metric({
  label,
  value,
  tone,
  icon,
}: {
  readonly label: string;
  readonly value: string;
  readonly tone: string;
  readonly icon: string;
}) {
  return (
    <article className={`pcb-training__metric is-${tone}`}>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
      <b>{icon}</b>
    </article>
  );
}
function Bar({ value }: { readonly value: number }) {
  return (
    <span className="pcb-training__bar">
      <i style={{ width: `${value}%` }} />
      <b>{value}%</b>
    </span>
  );
}
function StaffAssignments() {
  const columns = useResizableTrainingColumns([260, 210, 220, 220]);
  const labels = ["Staff", "Rol", "Área", "Grupo"];
  return (
    <main className="pcb-training__bento">
      <section className="pcb-training__card">
        <header className="pcb-training__card-head">
          <h2>Staff Assignments</h2>
          <span>Sin datos de plantilla técnica</span>
        </header>
        <div className="pcb-training__table pcb-training__staff">
          <div className="is-head" style={columns.style}>
            {labels.map((label, index) => (
              <span key={label}>
                {label}
                <TrainingColumnResizeHandle
                  onPointerDown={columns.startResize(index)}
                />
              </span>
            ))}
          </div>
          <p>No hay asignaciones de staff disponibles todavía.</p>
        </div>
      </section>
    </main>
  );
}
function TrainingModules() {
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [settings, setSettings] = useState<
    Record<string, { enabled: boolean; intensity: TrainingIntensity }>
  >(() =>
    Object.fromEntries(
      DOMAIN_TRAINING_MODULES.map((module) => [
        module.id,
        { enabled: true, intensity: "Media" as TrainingIntensity },
      ]),
    ),
  );
  const current = configuring === null ? undefined : settings[configuring];
  return (
    <main className="pcb-training__bento">
      <section className="pcb-training__card">
        <header className="pcb-training__card-head">
          <h2>Training Modules</h2>
          <span>{DOMAIN_TRAINING_MODULES.length} módulos</span>
        </header>
        <div className="pcb-training__module-list">
          {DOMAIN_TRAINING_MODULES.map((module) => (
            <article key={module.id}>
              <div>
                <b>{MODULE_NAME_LABELS[module.id] ?? module.id}</b>
                <p>Categoría: {FOCUS_LABELS[module.category]}</p>
                {!settings[module.id]!.enabled && <small>Desactivado</small>}
              </div>
              <span>{module.scope}</span>
              <button onClick={() => setConfiguring(module.id)} type="button">
                Configurar
              </button>
            </article>
          ))}
        </div>
        {configuring !== null && current !== undefined && (
          <div className="pcb-training__modal">
            <section>
              <header>
                <h3>Configurar {MODULE_NAME_LABELS[configuring] ?? configuring}</h3>
                <button onClick={() => setConfiguring(null)} type="button">
                  ×
                </button>
              </header>
              <label>
                <input
                  checked={current.enabled}
                  onChange={(event) =>
                    setSettings((value) => ({
                      ...value,
                      [configuring]: {
                        ...value[configuring]!,
                        enabled: event.target.checked,
                      },
                    }))
                  }
                  type="checkbox"
                />{" "}
                Módulo activo
              </label>
              <div className="pcb-training__intensity">
                {(["Baja", "Media", "Alta"] as const).map((value) => (
                  <button
                    className={value === current.intensity ? "is-active" : ""}
                    key={value}
                    onClick={() =>
                      setSettings((prior) => ({
                        ...prior,
                        [configuring]: {
                          ...prior[configuring]!,
                          intensity: value,
                        },
                      }))
                    }
                    type="button"
                  >
                    {value}
                  </button>
                ))}
              </div>
              <footer>
                <button
                  className="is-primary"
                  onClick={() => setConfiguring(null)}
                  type="button"
                >
                  Guardar
                </button>
              </footer>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
