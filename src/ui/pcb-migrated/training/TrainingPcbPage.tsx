import { Fragment, useMemo, useState, type ReactNode } from "react";
import type { GameWorld } from "@/domain/world";
import { getCareerFatigueForPlayer, getDevelopmentStimulusForPlayer, getGamesForTeam, getTeamRoster } from "@/domain/world";
import { getUserTeam } from "@/engine/calendar";
import { canTeamTrainOnDate, dailyLoadStatusForTeam, dailyScheduledLoad, nextEligibleTrainingDate } from "@/engine/training";
import { addDays, formatGameDate, isoWeekNumber, parseGameDate, type GameDate } from "@/domain/date";
import { BASKETBALL_RATING_KEYS, type BasketballRatingKey, type Player } from "@/domain/player";
import type { Team } from "@/domain/team";
import type { TeamId, PlayerId, StaffPersonId } from "@/domain/ids";
import { createEntityId } from "@/domain/ids";
import { STAFF_ROLE_REGISTRY, type StaffRoleId } from "@/domain/staff";
import { STAFF_ROLE_LABELS } from "@/ui/staffPresentation";
import { useEntityContextMenu } from "@/ui/entityContextMenu/EntityContextMenuProvider";
import { PlayerNameLink } from "@/ui/navigation/PlayerNameLink";
import { TRAINING_CATALOG, trainingLoad, type DailyLoadStatus, type ScheduledTrainingSession, type TrainingCategory, type TrainingFocus, type TrainingIntensity as DomainTrainingIntensity, type TrainingDefinition, type TrainingScope, type UserTrainingModule } from "@/domain/training";
import { ATTRIBUTE_LABELS } from "@/ui/attributeLabels";
import { selectLatestUserTrainingSession, selectUserTeamScheduledSessions, selectUserTrainingModules, selectUserTrainingPlan } from "@/stores/gameStore";
import { PrecisionDivHead } from "@/ui-ng/components/PrecisionDivHead";
import { usePrecisionDivGrid, type PrecisionDivColumn } from "@/ui-ng/components/usePrecisionDivGrid";
import DraggableSubnav from "../club/components/DraggableSubnav";
import "./TrainingPcbPage.css";

export type TrainingPcbTab = "team" | "personal" | "load" | "staff" | "modules";
export const TRAINING_PCB_TABS: readonly [TrainingPcbTab, string][] = [
  ["team", "Equipo"],
  ["personal", "Individual"],
  ["load", "Carga"],
  ["staff", "Staff"],
  ["modules", "Módulos"],
];
const tabs = TRAINING_PCB_TABS;

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
const INTENSITY_ES: Record<DomainTrainingIntensity, "Baja" | "Media" | "Alta"> = { light: "Baja", normal: "Media", high: "Alta" };
const INTENSITY_FROM_ES: Record<"Baja" | "Media" | "Alta", DomainTrainingIntensity> = { Baja: "light", Media: "normal", Alta: "high" };
const LOAD_STATUS_LABELS: Record<DailyLoadStatus, string> = { OK: "OK", HIGH: "Alta", VERY_HIGH: "Muy alta" };
const LOAD_STATUS_TONE: Record<DailyLoadStatus, "good" | "warn" | "danger"> = { OK: "good", HIGH: "warn", VERY_HIGH: "danger" };
const DAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function playerName(player: Player): string {
  return `${player.firstName} ${player.lastName}`;
}

/** ISO weekday (1 = Monday .. 7 = Sunday) for a GameDate, using the same proleptic UTC calendar as GameDate arithmetic. */
function isoWeekday(date: GameDate): number {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

/** Monday of the calendar week containing world.currentDate, offset by `week` weeks. */
function weekAnchor(world: GameWorld | undefined, week: number): GameDate | undefined {
  if (world === undefined) return undefined;
  const today = parseGameDate(world.currentDate);
  const monday = addDays(today, -(isoWeekday(today) - 1));
  return addDays(monday, week * 7);
}

function teamGameOnDate(world: GameWorld | undefined, team: Team | undefined, date: GameDate) {
  if (world === undefined || team === undefined) return undefined;
  return getGamesForTeam(world, team.id).find((game) => game.date === date);
}

function isMatchDay(world: GameWorld | undefined, team: Team | undefined, date: GameDate): boolean {
  return world !== undefined && team !== undefined && !canTeamTrainOnDate(world, team.id, date);
}

function trainingWeekRangeLabel(world: GameWorld | undefined, week: number): string {
  const anchor = weekAnchor(world, week);
  if (anchor === undefined) return "Sin fecha de referencia";
  return `${formatGameDate(anchor)} - ${formatGameDate(addDays(anchor, 6))}`;
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

const PERSONAL_TRAINING_COLUMNS: readonly PrecisionDivColumn[] = [
  { id: "player", label: "Jugador", width: 220, flex: 0.9, minWidth: 160 },
  { id: "pos", label: "POS", width: 56, minWidth: 44 },
  { id: "plan", label: "Plan actual", width: 130 },
  { id: "module", label: "Módulo asignado", width: 180, flex: 1.4 },
  { id: "objective", label: "Objetivo", width: 150, flex: 1 },
  { id: "assign", label: "Asignar", width: 340, minWidth: 280 },
];
const LOAD_TRAINING_COLUMNS: readonly PrecisionDivColumn[] = [
  { id: "JUGADOR", label: "JUGADOR", width: 220 },
  { id: "POS", label: "POS", width: 88 },
  { id: "FATIGA", label: "FATIGA", width: 160 },
  { id: "ESTADO", label: "ESTADO", width: 160 },
];
const STAFF_TRAINING_COLUMNS: readonly PrecisionDivColumn[] = [
  { id: "staff", label: "Staff", width: 260 },
  { id: "role", label: "Rol", width: 210 },
  { id: "area", label: "Área", width: 220 },
  { id: "group", label: "Grupo", width: 220 },
];

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, "0"));

/** Compact hour+minute dropdown pair, composed internally into a canonical "HH:MM" string. */
function HourMinuteSelect({
  value,
  onChange,
  label,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly label: string;
}) {
  const [hour, minute] = value.split(":");
  return (
    <div className="pcb-training__time-select" role="group" aria-label={label}>
      <select
        aria-label={`${label} - hora`}
        onChange={(event) => onChange(`${event.target.value}:${minute ?? "00"}`)}
        value={hour ?? "00"}
      >
        {HOUR_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <span>:</span>
      <select
        aria-label={`${label} - minuto`}
        onChange={(event) => onChange(`${hour ?? "00"}:${event.target.value}`)}
        value={minute ?? "00"}
      >
        {MINUTE_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

export interface TrainingModuleAssignmentInput {
  readonly playerId: PlayerId;
  readonly moduleId: string;
  readonly date: GameDate;
  readonly startTime: string;
  readonly sessionId: string;
  readonly assignedStaffPersonIds?: readonly StaffPersonId[];
}

function eligibleTrainingStaff(world: GameWorld | undefined, team: Team | undefined) {
  if (world === undefined || team === undefined) return [];
  return Object.values(world.teamStaffAssignmentsById)
    .filter((assignment) => assignment.teamId === team.id && world.staffEmploymentByStaffId[assignment.staffPersonId]?.status === "employed")
    .map((assignment) => ({ id: assignment.staffPersonId, role: assignment.role, name: `${world.staffPeopleById[assignment.staffPersonId]!.identity.firstName} ${world.staffPeopleById[assignment.staffPersonId]!.identity.lastName}` }));
}

export function TrainingPcbPage({
  initialTab = "team",
  world,
  onIntensity,
  onFocus,
  onScheduleSession,
  onScheduleTeamModule,
  onScheduleAutomaticWeek,
  onCancelSession,
  onSaveModule,
  onDeleteModule,
  onAssignModule,
  variant = "legacy",
  activeTab,
  onTabChange,
  onOpenPlayer,
}: {
  readonly initialTab?: TrainingPcbTab;
  readonly world?: GameWorld;
  readonly onIntensity?: (value: DomainTrainingIntensity) => void;
  readonly onFocus?: (value: TrainingFocus) => void;
  readonly onScheduleSession?: (session: ScheduledTrainingSession) => void;
  readonly onScheduleTeamModule?: (input: { readonly moduleId: string; readonly date: GameDate; readonly startTime: string; readonly durationMinutes: number; readonly sessionId: string; readonly intensity?: DomainTrainingIntensity; readonly assignedStaffPersonIds?: readonly StaffPersonId[] }) => void;
  readonly onScheduleAutomaticWeek?: (weekStart: GameDate) => void;
  readonly onCancelSession?: (sessionId: string) => void;
  readonly onSaveModule?: (module: UserTrainingModule) => void;
  readonly onDeleteModule?: (moduleId: string) => void;
  readonly onAssignModule?: (input: TrainingModuleAssignmentInput) => void;
  readonly variant?: "legacy" | "ng";
  readonly activeTab?: TrainingPcbTab;
  readonly onTabChange?: (tab: TrainingPcbTab) => void;
  readonly onOpenPlayer?: (playerId: PlayerId) => void;
}) {
  const [internalTab, setInternalTab] = useState<TrainingPcbTab>(initialTab);
  const tab = activeTab ?? internalTab;
  const setTab = (next: TrainingPcbTab) => {
    onTabChange?.(next);
    if (activeTab === undefined) setInternalTab(next);
  };
  const team = useMemo(() => (world === undefined ? undefined : getUserTeam(world)), [world]);
  const scheduledSessions = world === undefined ? [] : selectUserTeamScheduledSessions(world);
  const userModules = world === undefined ? [] : selectUserTrainingModules(world);
  return (
    <section aria-label="Entrenamiento PCB migrado" className={`pcb-training${variant === "ng" ? " pcb-training--ng" : ""}`}>
      {variant === "legacy" ? (
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
      ) : null}
      {tab === "team" ? (
        <TeamTraining
          onCancelSession={onCancelSession}
          onFocus={onFocus}
          onIntensity={onIntensity}
          onScheduleAutomaticWeek={onScheduleAutomaticWeek}
          onScheduleTeamModule={onScheduleTeamModule}
          scheduledSessions={scheduledSessions}
          eligibleStaff={eligibleTrainingStaff(world, team)}
          team={team}
          userModules={userModules}
          world={world}
        />
      ) : tab === "personal" ? (
        <PersonalTraining eligibleStaff={eligibleTrainingStaff(world, team)} onAssignModule={onAssignModule} onOpenPlayer={onOpenPlayer} scheduledSessions={scheduledSessions} team={team} userModules={userModules} world={world} />
      ) : tab === "load" ? (
        <LoadManagementInteractive onOpenPlayer={onOpenPlayer} onScheduleSession={onScheduleSession} scheduledSessions={scheduledSessions} team={team} world={world} />
      ) : tab === "staff" ? (
        <StaffAssignments world={world} />
      ) : (
        <TrainingModules onDeleteModule={onDeleteModule} onSaveModule={onSaveModule} userModules={userModules} />
      )}
    </section>
  );
}

function TeamTraining({
  world,
  team,
  onIntensity,
  onFocus,
  scheduledSessions,
  userModules,
  onScheduleTeamModule,
  onScheduleAutomaticWeek,
  onCancelSession,
  eligibleStaff,
}: {
  readonly world?: GameWorld;
  readonly team?: Team;
  readonly onIntensity?: (value: DomainTrainingIntensity) => void;
  readonly onFocus?: (value: TrainingFocus) => void;
  readonly scheduledSessions: readonly ScheduledTrainingSession[];
  readonly userModules: readonly UserTrainingModule[];
  readonly onScheduleTeamModule?: (input: { readonly moduleId: string; readonly date: GameDate; readonly startTime: string; readonly durationMinutes: number; readonly sessionId: string; readonly intensity?: DomainTrainingIntensity; readonly assignedStaffPersonIds?: readonly StaffPersonId[] }) => void;
  readonly onScheduleAutomaticWeek?: (weekStart: GameDate) => void;
  readonly onCancelSession?: (sessionId: string) => void;
  readonly eligibleStaff: readonly { readonly id: StaffPersonId; readonly role: string; readonly name: string }[];
}) {
  const [week, setWeek] = useState(0);
  const [editor, setEditor] = useState<{
    readonly date: GameDate;
    readonly session?: ScheduledTrainingSession;
  }>();
  const [editorError, setEditorError] = useState<string>();
  const trainingPlan = world === undefined ? undefined : selectUserTrainingPlan(world);
  const latestSession = world === undefined ? undefined : selectLatestUserTrainingSession(world);
  const impact = world !== undefined && team !== undefined ? getTrainingImpact(world, team.id) : undefined;
  const anchor = weekAnchor(world, week);
  const days = anchor === undefined ? [] : DAY_NAMES.map((name, index) => ({ name, date: addDays(anchor, index) }));
  const sessionsForDate = (date: GameDate) => scheduledSessions.filter((session) => session.date === date && session.status === "scheduled").sort((a, b) => a.startTime.localeCompare(b.startTime));
  const hasAutomaticDays = days.some(({ date }) => {
    if (world === undefined || team === undefined || date <= world.currentDate) return false;
    if (isMatchDay(world, team, date)) return false;
    return sessionsForDate(date).every((session) => session.scope !== "team");
  });
  const weekLabel = anchor === undefined ? "Sin fecha de referencia" : `Semana ${isoWeekNumber(anchor)} · ${formatGameDate(anchor)} - ${formatGameDate(addDays(anchor, 6))}`;
  const teamModules = userModules.filter((module) => module.scope !== "individual");
  const saveSession = (input: { readonly startTime: string; readonly durationMinutes: number; readonly moduleId: string; readonly intensity: DomainTrainingIntensity; readonly assignedStaffPersonIds: readonly StaffPersonId[] }) => {
    if (editor === undefined || team === undefined) return;
    setEditorError(undefined);
    try {
      onScheduleTeamModule?.({
        moduleId: input.moduleId,
        date: editor.date,
        startTime: input.startTime,
        durationMinutes: input.durationMinutes,
        sessionId: editor.session?.id ?? `session:${createEntityId()}`,
        intensity: input.intensity,
        assignedStaffPersonIds: input.assignedStaffPersonIds,
      });
      setEditor(undefined);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "No se pudo programar la sesión.");
    }
  };
  return (
    <main className="pcb-training__bento pcb-training__team">
      <section className="pcb-training__card pcb-training__hero">
        <div className="pcb-training__hero-top">
          <div>
            <h2>Team Training</h2>
            <p>
              {weekLabel}
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
              <small>Semana {anchor === undefined ? "—" : isoWeekNumber(anchor)} de planificación</small>
            </div>
            <div className="pcb-training__week-actions">
              <button
                className="is-primary"
                disabled={team === undefined || anchor === undefined || !hasAutomaticDays || onScheduleAutomaticWeek === undefined}
                onClick={() => {
                  if (anchor !== undefined) onScheduleAutomaticWeek?.(anchor);
                }}
                title="Rellena los días futuros sin partido con el foco e intensidad actuales"
                type="button"
              >
                Entrenamientos automáticos
              </button>
              <button onClick={() => setWeek((value) => value + 1)} type="button">
                Siguiente
              </button>
            </div>
          </div>
          <div className="pcb-training__days">
            {days.map(({ name, date }) => {
              const sessions = sessionsForDate(date);
              const isPastOrToday = world !== undefined && date <= world.currentDate;
              const match = teamGameOnDate(world, team, date);
              const matchDay = match !== undefined;
              const opponent = match === undefined || world === undefined || team === undefined
                ? undefined
                : world.teams[match.homeTeamId === team.id ? match.awayTeamId : match.homeTeamId];
              return (
                <article className={`pcb-training__day${matchDay ? " is-match" : ""}`} key={date}>
                  <header>
                    <strong>{name}</strong>
                    <button
                      disabled={team === undefined || isPastOrToday || matchDay}
                      onClick={() => {
                        setEditorError(undefined);
                        setEditor({ date });
                      }}
                      title={
                        matchDay
                          ? "Día de partido: no se programa entrenamiento"
                          : isPastOrToday
                            ? "No se pueden programar sesiones para hoy o fechas pasadas"
                            : undefined
                      }
                      type="button"
                    >
                      + Sesión
                    </button>
                  </header>
                  <div>
                    {matchDay ? <p>Partido{opponent === undefined ? "" : ` · ${opponent.name}`}</p> : null}
                    {!matchDay && sessions.length === 0 ? (
                      <p>Descanso</p>
                    ) : (
                      sessions.map((session) => {
                        const definition = TRAINING_CATALOG.find((entry) => entry.id === session.definitionId);
                        const intensityEs = INTENSITY_ES[session.intensity];
                        return (
                          <article className="pcb-training__session" key={session.id}>
                            <button onClick={() => setEditor({ date, session })} type="button">
                              <span>
                                <b>{definition?.name ?? session.definitionId}</b>
                                <em>•••</em>
                              </span>
                              <small>
                                {session.startTime} · {intensityEs}
                              </small>
                              <i className={`is-${intensityEs.toLocaleLowerCase()}`}>{intensityEs}</i>
                            </button>
                            <button
                              className="pcb-training__delete"
                              onClick={() => onCancelSession?.(session.id)}
                              title="Eliminar sesión"
                              type="button"
                            >
                              ×
                            </button>
                          </article>
                        );
                      })
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
        <Calendar anchor={anchor} team={team} world={world} />
      </div>
      {editor !== undefined && (
        <SessionModal
          error={editorError}
          initial={editor.session}
          onClose={() => {
            setEditorError(undefined);
            setEditor(undefined);
          }}
          onSave={saveSession}
          eligibleStaff={eligibleStaff}
          userModules={teamModules}
        />
      )}
    </main>
  );
}
function Calendar({
  anchor,
  world,
  team,
}: {
  readonly anchor?: GameDate;
  readonly world?: GameWorld;
  readonly team?: Team;
}) {
  const monthStart = anchor === undefined ? undefined : parseGameDate(`${anchor.slice(0, 7)}-01`);
  const startWeekday = monthStart === undefined ? 1 : isoWeekday(monthStart);
  const gridStart = monthStart === undefined ? undefined : addDays(monthStart, -(startWeekday - 1));
  const cells = gridStart === undefined ? [] : Array.from({ length: 35 }, (_, index) => addDays(gridStart, index));
  // Consumes the canonical engine selector (dailyLoadStatusForTeam) rather than duplicating the load formula here.
  const loadStatusForDate = (date: GameDate): DailyLoadStatus | undefined => world === undefined || team === undefined ? undefined : dailyLoadStatusForTeam(world, team.id, date);
  return (
    <aside className="pcb-training__calendar">
      <header>
        <h3>Planificación</h3>
        <span>{anchor === undefined ? "Sin fecha" : `Semana ISO ${isoWeekNumber(anchor)}`}</span>
      </header>
      <div className="pcb-training__calendar-grid">
        {["L", "M", "X", "J", "V", "S", "D"].map((x) => (
          <b key={x}>{x}</b>
        ))}
        {cells.map((date) => {
          const hasSessions = world !== undefined && team !== undefined && Object.values(world.scheduledTrainingSessionsById).some((session) => session.teamId === team.id && session.date === date);
          const matchDay = isMatchDay(world, team, date);
          const status = hasSessions ? loadStatusForDate(date) : undefined;
          return (
            <span className={[hasSessions ? "is-train" : "", matchDay ? "is-match" : ""].filter(Boolean).join(" ")} key={date}>
              {Number(date.slice(-2))}
              {status !== undefined && <i className={`pcb-training__load-dot is-${LOAD_STATUS_TONE[status]}`}>{LOAD_STATUS_LABELS[status]}</i>}
            </span>
          );
        })}
      </div>
      <p>
        Los días marcados muestran sesiones reales programadas y su nivel de carga. El ámbar señala un día de partido.
      </p>
    </aside>
  );
}

function SessionModal({
  initial,
  userModules,
  error,
  onClose,
  onSave,
  eligibleStaff,
}: {
  readonly initial?: ScheduledTrainingSession;
  readonly userModules: readonly UserTrainingModule[];
  readonly error?: string;
  readonly onClose: () => void;
  readonly onSave: (input: { readonly startTime: string; readonly durationMinutes: number; readonly moduleId: string; readonly intensity: DomainTrainingIntensity; readonly assignedStaffPersonIds: readonly StaffPersonId[] }) => void;
  readonly eligibleStaff: readonly { readonly id: StaffPersonId; readonly role: string; readonly name: string }[];
}) {
  const builtinOptions = TRAINING_CATALOG.filter((entry) => entry.scope !== "individual");
  // A user-created team module is selected by its own module id, but resolves to its base
  // definition's real effect profile/duration; its configured intensity is locked, not free-choice.
  const initialModuleId = initial === undefined ? builtinOptions[0]!.id : initial.definitionId;
  const [startTime, setStartTime] = useState(initial?.startTime ?? "10:00");
  const [moduleId, setModuleId] = useState(initialModuleId);
  const [intensity, setIntensity] = useState<"Baja" | "Media" | "Alta">(initial === undefined ? "Media" : INTENSITY_ES[initial.intensity]);
  const [staffIds, setStaffIds] = useState<readonly StaffPersonId[]>(initial?.assignedStaffPersonIds ?? []);
  const selectedUserModule = userModules.find((module) => module.id === moduleId);
  const definition = TRAINING_CATALOG.find((entry) => entry.id === (selectedUserModule?.baseDefinitionId ?? moduleId)) ?? builtinOptions[0]!;
  const effectiveIntensity: DomainTrainingIntensity = selectedUserModule?.intensity ?? INTENSITY_FROM_ES[intensity];
  const durationMinutes = definition.durationMinutes;
  const load = trainingLoad(effectiveIntensity).fatigue * definition.effects.fatigueMultiplier;
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
            onChange={(event) => setModuleId(event.target.value)}
            value={moduleId}
          >
            <optgroup label="Catálogo">
              {builtinOptions.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </optgroup>
            {userModules.length > 0 && (
              <optgroup label="Módulos del usuario">
                {userModules.map((module) => (
                  <option key={module.id} value={module.id}>
                    {module.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <div className="pcb-training__modal-grid">
          <label>
            Inicio
            <HourMinuteSelect label="Inicio" onChange={setStartTime} value={startTime} />
          </label>
          <label>
            Duración
            <input readOnly type="text" value={`${durationMinutes} min`} />
          </label>
        </div>
        <div className="pcb-training__intensity">
          {(["Baja", "Media", "Alta"] as const).map((value) => (
            <button
              className={value === intensity ? "is-active" : ""}
              disabled={selectedUserModule !== undefined}
              key={value}
              onClick={() => setIntensity(value)}
              title={selectedUserModule !== undefined ? "Este módulo de usuario tiene una intensidad configurada" : undefined}
              type="button"
            >
              {value}
            </button>
          ))}
        </div>
        <div className="pcb-training__effects">
          <strong>Impacto estimado</strong>
          <span>
            Carga {load} · {definition.name} · Categoría {definition.category}
          </span>
        </div>
        <label>
          Staff ejecutor
          <select aria-label="Staff ejecutor" multiple onChange={(event) => setStaffIds(Array.from(event.currentTarget.selectedOptions, (option) => option.value as StaffPersonId))} value={staffIds}>
            {eligibleStaff.map((staff) => <option key={staff.id} value={staff.id}>{staff.name} · {staff.role}</option>)}
          </select>
        </label>
        {error !== undefined && (
          <div className="pcb-training__filters">
            <span>{error}</span>
          </div>
        )}
        <footer>
          <button onClick={onClose} type="button">
            Cancelar
          </button>
          <button
            className="is-primary"
            onClick={() => onSave({ startTime, durationMinutes, moduleId, intensity: effectiveIntensity, assignedStaffPersonIds: staffIds })}
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
  scheduledSessions,
  userModules,
  onAssignModule,
  onOpenPlayer,
  eligibleStaff,
}: {
  readonly world?: GameWorld;
  readonly team?: Team;
  readonly scheduledSessions: readonly ScheduledTrainingSession[];
  readonly userModules: readonly UserTrainingModule[];
  readonly onAssignModule?: (input: TrainingModuleAssignmentInput) => void;
  readonly onOpenPlayer?: (playerId: PlayerId) => void;
  readonly eligibleStaff: readonly { readonly id: StaffPersonId; readonly role: string; readonly name: string }[];
}) {
  const playerMenu = useEntityContextMenu();
  const grid = usePrecisionDivGrid("ng-training-personal", PERSONAL_TRAINING_COLUMNS);
  const rowStyle = { ...grid.style, width: "100%" };
  const players = world !== undefined && team !== undefined ? getTeamRoster(world, team.id) : [];
  const plan = world === undefined ? undefined : selectUserTrainingPlan(world);
  const individualDefinitions = TRAINING_CATALOG.filter((entry) => entry.scope !== "team");
  const assignableModules: readonly { readonly id: string; readonly name: string }[] = [
    ...individualDefinitions.map((entry) => ({ id: entry.id, name: entry.name })),
    ...userModules.filter((module) => module.scope !== "team").map((module) => ({ id: module.id, name: module.name })),
  ];
  const assignStaff = eligibleStaff.filter((staff) => {
    const department = STAFF_ROLE_REGISTRY[staff.role as StaffRoleId]?.department;
    return department === "coaching" || department === "performance";
  });
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [staffSelection, setStaffSelection] = useState<Record<string, StaffPersonId | "">>({});
  const [assignError, setAssignError] = useState<{ readonly playerId: string; readonly message: string }>();
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
      <div className="pcb-training__table pcb-training__personal ng-precision-grid">
        <div className="is-head" style={rowStyle}>
          {grid.ordered.map((column) => (
            <PrecisionDivHead
              key={column.id}
              headerProps={grid.headerProps(column.id)}
              label={column.label}
              onResize={grid.startResize(column.id)}
              resizeClassName="pcb-training__column-resize"
            />
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
            const assignedSession = scheduledSessions
              .filter((session) => session.scope === "individual" && session.playerId === player.id && session.status === "scheduled")
              .sort((a, b) => (a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)))[0];
            const assignedDefinition = assignedSession === undefined ? undefined : TRAINING_CATALOG.find((entry) => entry.id === assignedSession.definitionId);
            const selectedModuleId = selection[player.id] ?? assignableModules[0]?.id ?? "";
            const cells: Record<string, ReactNode> = {
              player: (
                <b>
                  <PlayerNameLink onOpenPlayer={onOpenPlayer} playerId={player.id}>
                    {playerName(player)}
                  </PlayerNameLink>
                </b>
              ),
              pos: (
                <span>
                  <span className="ng-play-position">{player.basketball.primaryPosition}</span>
                </span>
              ),
              plan: <span>{plan === undefined ? "—" : FOCUS_LABELS[plan.focus]}</span>,
              module: <span>{assignedDefinition === undefined ? "Sin módulo asignado" : assignedDefinition.name}</span>,
              objective: <span>{topRating === undefined ? "Sin estímulo registrado" : ATTRIBUTE_LABELS[topRating]}</span>,
              assign: (
                <span className="pcb-training__assign">
                  <select
                    aria-label={`Módulo para ${playerName(player)}`}
                    onChange={(event) => setSelection((current) => ({ ...current, [player.id]: event.target.value }))}
                    value={selectedModuleId}
                  >
                    {assignableModules.map((module) => (
                      <option key={module.id} value={module.id}>
                        {module.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={`Staff ejecutor para ${playerName(player)}`}
                    onChange={(event) => setStaffSelection((current) => ({ ...current, [player.id]: event.target.value as StaffPersonId | "" }))}
                    value={staffSelection[player.id] ?? ""}
                  >
                    <option value="">Sin staff</option>
                    {assignStaff.map((staff) => (
                      <option key={staff.id} value={staff.id}>
                        {staff.name} · {STAFF_ROLE_LABELS[staff.role as StaffRoleId] ?? staff.role}
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={team === undefined || world === undefined || selectedModuleId === ""}
                    onClick={() => {
                      if (team === undefined || world === undefined || selectedModuleId === "") return;
                      setAssignError(undefined);
                      try {
                        const staffId = staffSelection[player.id];
                        onAssignModule?.({
                          playerId: player.id,
                          moduleId: selectedModuleId,
                          date: nextEligibleTrainingDate(world.currentDate),
                          startTime: "09:00",
                          sessionId: `session:${createEntityId()}`,
                          assignedStaffPersonIds: staffId ? [staffId] : undefined,
                        });
                      } catch (error) {
                        setAssignError({ playerId: player.id, message: error instanceof Error ? error.message : "No se pudo asignar el módulo." });
                      }
                    }}
                    type="button"
                  >
                    Asignar
                  </button>
                  {assignError?.playerId === player.id && <small>{assignError.message}</small>}
                </span>
              ),
            };
            return (
              <div key={player.id} onContextMenu={(event) => playerMenu.open({ type: "player", id: player.id }, event, { surface: "training" })} style={rowStyle}>
                {grid.ordered.map((column) => (
                  <Fragment key={column.id}>{cells[column.id]}</Fragment>
                ))}
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}
const RECOVERY_DEFINITION_IDS = ["rest", "activeRecovery", "mobility", "lowLoadRecovery"] as const;

function LoadManagementInteractive({
  world,
  team,
  scheduledSessions,
  onScheduleSession,
  onOpenPlayer,
}: {
  readonly world?: GameWorld;
  readonly team?: Team;
  readonly scheduledSessions: readonly ScheduledTrainingSession[];
  readonly onScheduleSession?: (session: ScheduledTrainingSession) => void;
  readonly onOpenPlayer?: (playerId: PlayerId) => void;
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
  const [view, setView] = useState<"Principal" | "Riesgo" | "Recuperación">("Principal");
  const [recoveryDefinitionId, setRecoveryDefinitionId] = useState<string>(RECOVERY_DEFINITION_IDS[0]);
  const [recoveryDate, setRecoveryDate] = useState<string>("");
  const [recoveryTime, setRecoveryTime] = useState("09:00");
  const [recoveryScheduled, setRecoveryScheduled] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string>();
  const [columns, setColumns] = useState<readonly string[]>([
    "JUGADOR",
    "POS",
    "FATIGA",
    "ESTADO",
  ]);
  const loadColumnDefs = useMemo(
    () => LOAD_TRAINING_COLUMNS.filter((column) => columns.includes(column.id)),
    [columns],
  );
  const loadGrid = usePrecisionDivGrid("ng-training-load", loadColumnDefs);
  const players = world !== undefined && team !== undefined ? getTeamRoster(world, team.id) : [];
  const todayLoadStatus = world !== undefined && team !== undefined ? dailyLoadStatusForTeam(world, team.id, world.currentDate) : undefined;
  const todayLoad = world !== undefined && team !== undefined ? dailyScheduledLoad(world, team.id, world.currentDate) : 0;
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
            (!fatigueOnly || fatigue > 70) &&
            (view !== "Riesgo" || fatigue > 70),
        )
        .slice()
        .sort(
          (left, right) =>
            (left.fatigue - right.fatigue) * (sortDirection === "ascending" ? 1 : -1),
        ),
    [rowsData, fatigueOnly, query, riskOnly, sortDirection, view],
  );
  const averageFatigue = rowsData.length === 0 ? 0 : rowsData.reduce((sum, row) => sum + row.fatigue, 0) / rowsData.length;
  const riskCount = rowsData.filter((row) => row.fatigue > 70).length;
  const optimalCount = rowsData.filter((row) => row.fatigue <= 70).length;
  const columnCell = (column: string, row: { readonly player: Player; readonly fatigue: number }) => {
    if (column === "JUGADOR")
      return (
        <b>
          <i aria-hidden="true" className={`pcb-training__load-radio${selected === row.player.id ? " is-checked" : ""}`} />
          <PlayerNameLink onOpenPlayer={onOpenPlayer} playerId={row.player.id}>
            {playerName(row.player)}
          </PlayerNameLink>
        </b>
      );
    if (column === "POS") return <span className="ng-play-position">{row.player.basketball.primaryPosition}</span>;
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
          <Metric icon="⌁" label="ALERTA DE FATIGA" tone="danger" value={String(riskCount)} />
          <Metric icon="✓" label="CARGA ÓPTIMA" tone="good" value={String(optimalCount)} />
          <Metric icon="▰" label="FATIGA MEDIA" tone="warn" value={`${averageFatigue.toFixed(0)}%`} />
        </div>
        {todayLoadStatus !== undefined && (
          <div className="pcb-training__metrics">
            <Metric icon="◆" label="CARGA DE HOY" tone={LOAD_STATUS_TONE[todayLoadStatus]} value={`${LOAD_STATUS_LABELS[todayLoadStatus]} (${todayLoad.toFixed(0)})`} />
          </div>
        )}
        <div className="pcb-training__load-toolbar">
          <div>
            {(["Principal", "Riesgo", "Recuperación"] as const).map((item) => (
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
        {view === "Recuperación" && (
          <div className="pcb-training__filters">
            {selected === undefined ? (
              <span>Selecciona un jugador en la tabla para programar su recuperación.</span>
            ) : (
              <>
                <label>
                  Tipo
                  <select onChange={(event) => setRecoveryDefinitionId(event.target.value)} value={recoveryDefinitionId}>
                    {RECOVERY_DEFINITION_IDS.map((id) => (
                      <option key={id} value={id}>
                        {TRAINING_CATALOG.find((entry) => entry.id === id)!.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Fecha
                  <input
                    min={world === undefined ? undefined : nextEligibleTrainingDate(world.currentDate)}
                    onChange={(event) => setRecoveryDate(event.target.value)}
                    type="date"
                    value={recoveryDate || (world === undefined ? "" : nextEligibleTrainingDate(world.currentDate))}
                  />
                </label>
                <label>
                  Inicio
                  <HourMinuteSelect label="Inicio de recuperación" onChange={setRecoveryTime} value={recoveryTime} />
                </label>
                <button
                  className="is-primary"
                  disabled={world === undefined || team === undefined}
                  onClick={() => {
                    if (world === undefined || team === undefined || selected === undefined) return;
                    setRecoveryScheduled(false);
                    setRecoveryError(undefined);
                    try {
                      const definition = TRAINING_CATALOG.find((entry) => entry.id === recoveryDefinitionId)!;
                      const date = (recoveryDate || nextEligibleTrainingDate(world.currentDate)) as GameDate;
                      onScheduleSession?.({
                        id: `session:${createEntityId()}`,
                        teamId: team.id,
                        date,
                        startTime: recoveryTime,
                        durationMinutes: definition.durationMinutes,
                        scope: "individual",
                        playerId: selected as PlayerId,
                        definitionId: definition.id,
                        intensity: definition.defaultIntensity,
                        status: "scheduled",
                      });
                      setRecoveryScheduled(true);
                    } catch (error) {
                      setRecoveryError(error instanceof Error ? error.message : "No se pudo programar la recuperación.");
                    }
                  }}
                  type="button"
                >
                  Programar recuperación
                </button>
                {recoveryScheduled && <span>Recuperación programada.</span>}
                {recoveryError !== undefined && <span>{recoveryError}</span>}
              </>
            )}
          </div>
        )}
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
          className="pcb-training__table pcb-training__load ng-precision-grid"
          style={loadGrid.style}
        >
          <div
            className="is-head"
            style={loadGrid.style}
          >
            {loadGrid.ordered.map((column) => (
              <PrecisionDivHead
                key={column.id}
                headerProps={loadGrid.headerProps(column.id)}
                label={column.label}
                onResize={loadGrid.startResize(column.id)}
                resizeClassName="pcb-training__column-resize"
              >
                {column.id === "FATIGA" ? (
                  <button
                    onClick={() =>
                      setSortDirection((value) =>
                        value === "ascending" ? "descending" : "ascending",
                      )
                    }
                    type="button"
                  >
                    {column.label} {sortDirection === "ascending" ? "↑" : "↓"}
                  </button>
                ) : undefined}
              </PrecisionDivHead>
            ))}
          </div>
          {rows.length === 0 ? (
            <p>No hay jugadores disponibles.</p>
          ) : (
            rows.map((row) => (
              <div
                aria-checked={selected === row.player.id}
                aria-label={`Seleccionar a ${playerName(row.player)}`}
                className={selected === row.player.id ? "is-selected" : ""}
                key={row.player.id}
                onClick={() => setSelected(row.player.id)}
                role="radio"
                style={loadGrid.style}
              >
                {loadGrid.ordered.map((column) => (
                  <span key={column.id}>{columnCell(column.id, row)}</span>
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
function StaffAssignments({ world }: { readonly world?: GameWorld }) {
  const grid = usePrecisionDivGrid("ng-training-staff", STAFF_TRAINING_COLUMNS);
  const team = world === undefined ? undefined : getUserTeam(world);
  const responsibilities = world !== undefined && team !== undefined ? world.trainingResponsibilitiesByTeamId[team.id] : undefined;
  const rows = responsibilities === undefined
    ? []
    : (Object.entries(responsibilities) as [string, string][])
      .filter(([, staffId]) => staffId !== undefined)
      .map(([role, staffId]) => ({ role, staff: world?.staffPeopleById[staffId as never] }))
      .filter((row): row is { readonly role: string; readonly staff: NonNullable<typeof row.staff> } => row.staff !== undefined);
  return (
    <main className="pcb-training__bento">
      <section className="pcb-training__card">
        <header className="pcb-training__card-head">
          <h2>Staff Assignments</h2>
          <span>{rows.length === 0 ? "Sin datos de plantilla técnica" : `${rows.length} asignaciones`}</span>
        </header>
        <div className="pcb-training__table pcb-training__staff ng-precision-grid">
          <div className="is-head" style={grid.style}>
            {grid.ordered.map((column) => (
              <PrecisionDivHead
                key={column.id}
                headerProps={grid.headerProps(column.id)}
                label={column.label}
                onResize={grid.startResize(column.id)}
                resizeClassName="pcb-training__column-resize"
              />
            ))}
          </div>
          {rows.length === 0 ? (
            <p>No hay asignaciones de staff disponibles todavía.</p>
          ) : (
            rows.map(({ role, staff }) => {
              const cells: Record<string, ReactNode> = {
                staff: <b>{staff.identity.firstName} {staff.identity.lastName}</b>,
                role: <span>{role}</span>,
                area: <span>Entrenamiento</span>,
                group: <span>{team?.name ?? "—"}</span>,
              };
              return (
                <div key={role} style={grid.style}>
                  {grid.ordered.map((column) => (
                    <Fragment key={column.id}>{cells[column.id]}</Fragment>
                  ))}
                </div>
              );
            })
          )}
        </div>
      </section>
    </main>
  );
}
/** Scopes a user module may choose, constrained by the base definition's own supported scope. */
function allowedScopesForBase(base: TrainingDefinition): readonly TrainingScope[] {
  return base.scope === "both" ? ["team", "individual"] : [base.scope];
}

const TRAINING_CATEGORIES: readonly TrainingCategory[] = [
  "shooting",
  "finishing",
  "ballHandling",
  "playmaking",
  "defense",
  "rebounding",
  "physical",
  "recovery",
  "tactical",
];

const TRAINING_CATEGORY_LABELS: Record<TrainingCategory, string> = {
  shooting: "Tiro",
  finishing: "Finalización",
  ballHandling: "Manejo",
  playmaking: "Creación",
  defense: "Defensa",
  rebounding: "Rebote",
  physical: "Físico",
  recovery: "Recuperación",
  tactical: "Táctica",
};

const TRAINING_SCOPE_FILTERS = [
  ["individual", "Individual"],
  ["team", "Equipo"],
  ["both", "Ambos"],
] as const;

function ratingKeyLabel(key: string): string {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

function moduleMatchesScope(scope: TrainingScope, filter: TrainingScope): boolean {
  if (filter === "both") return true;
  return scope === filter || scope === "both";
}

function TrainingModules({
  userModules,
  onSaveModule,
  onDeleteModule,
}: {
  readonly userModules: readonly UserTrainingModule[];
  readonly onSaveModule?: (module: UserTrainingModule) => void;
  readonly onDeleteModule?: (moduleId: string) => void;
}) {
  const [configuring, setConfiguring] = useState<TrainingDefinition | null>(null);
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftBaseId, setDraftBaseId] = useState(TRAINING_CATALOG[0]!.id);
  const [draftScope, setDraftScope] = useState<TrainingScope>(allowedScopesForBase(TRAINING_CATALOG[0]!)[0]!);
  const [draftIntensity, setDraftIntensity] = useState<"Baja" | "Media" | "Alta">("Media");
  const [categoryFilter, setCategoryFilter] = useState<TrainingCategory | "all">("all");
  const [scopeFilter, setScopeFilter] = useState<TrainingScope>("both");
  const draftBase = TRAINING_CATALOG.find((entry) => entry.id === draftBaseId) ?? TRAINING_CATALOG[0]!;
  const draftAllowedScopes = allowedScopesForBase(draftBase);
  const allEntries = [
    ...TRAINING_CATALOG.map((entry) => ({
      kind: "builtin" as const,
      id: entry.id,
      name: entry.name,
      category: entry.category,
      scope: entry.scope,
      definition: entry,
      intensity: entry.defaultIntensity,
    })),
    ...userModules.map((module) => {
      const definition = TRAINING_CATALOG.find((entry) => entry.id === module.baseDefinitionId) ?? TRAINING_CATALOG[0]!;
      return {
        kind: "user" as const,
        id: module.id,
        name: module.name,
        category: definition.category,
        scope: module.scope,
        definition,
        intensity: module.intensity,
      };
    }),
  ];
  const visibleEntries = allEntries.filter(
    (entry) =>
      (categoryFilter === "all" || entry.category === categoryFilter) &&
      moduleMatchesScope(entry.scope, scopeFilter),
  );
  return (
    <main className="pcb-training__bento pcb-training__modules-page">
      <section className="pcb-training__card pcb-training__modules">
        <header className="pcb-training__card-head">
          <div>
            <h2>Training Modules</h2>
            <small>
              {visibleEntries.length} de {allEntries.length} módulos
            </small>
          </div>
          <button
            className="is-primary"
            onClick={() => {
              setDraftBaseId(TRAINING_CATALOG[0]!.id);
              setDraftScope(allowedScopesForBase(TRAINING_CATALOG[0]!)[0]!);
              setCreating(true);
            }}
            type="button"
          >
            + Crear módulo
          </button>
        </header>
        <div className="pcb-training__module-toolbar">
          <div className="pcb-training__module-scopes" role="group" aria-label="Alcance">
            {TRAINING_SCOPE_FILTERS.map(([id, label]) => (
              <button
                aria-label={`Alcance ${label}`}
                aria-pressed={scopeFilter === id}
                className={scopeFilter === id ? "is-active" : undefined}
                key={id}
                onClick={() => setScopeFilter(id)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          <div className="pcb-training__module-cats" role="group" aria-label="Categoría">
            <button
              aria-pressed={categoryFilter === "all"}
              className={categoryFilter === "all" ? "is-active" : undefined}
              onClick={() => setCategoryFilter("all")}
              type="button"
            >
              Todas
            </button>
            {TRAINING_CATEGORIES.map((category) => (
              <button
                aria-pressed={categoryFilter === category}
                className={categoryFilter === category ? "is-active" : undefined}
                data-category={category}
                key={category}
                onClick={() => setCategoryFilter(category)}
                type="button"
              >
                {TRAINING_CATEGORY_LABELS[category]}
              </button>
            ))}
          </div>
        </div>
        <div className="pcb-training__module-pills">
          {visibleEntries.length === 0 ? (
            <p className="pcb-training__module-empty">Ningún módulo coincide con los filtros.</p>
          ) : null}
          {visibleEntries.map((entry) => {
            const effects = entry.definition.effects;
            return (
              <article
                className="pcb-training__module-pill"
                data-category={entry.category}
                data-scope={entry.scope}
                key={`${entry.kind}-${entry.id}`}
              >
                <header>
                  <b>{entry.name}</b>
                  <span className="pcb-training__module-pill-cat">{TRAINING_CATEGORY_LABELS[entry.category]}</span>
                </header>
                <dl>
                  <div>
                    <dt>Alcance</dt>
                    <dd>{entry.scope === "team" ? "Equipo" : entry.scope === "individual" ? "Individual" : "Ambos"}</dd>
                  </div>
                  <div>
                    <dt>Duración</dt>
                    <dd>{entry.definition.durationMinutes} min</dd>
                  </div>
                  <div>
                    <dt>Intensidad</dt>
                    <dd>{INTENSITY_LABELS[entry.intensity]}</dd>
                  </div>
                  <div>
                    <dt>Objetivo</dt>
                    <dd>
                      {effects.targetRatings.length === 0
                        ? "—"
                        : effects.targetRatings.map(ratingKeyLabel).join(" · ")}
                    </dd>
                  </div>
                  <div>
                    <dt>Estímulo</dt>
                    <dd>{effects.developmentWeight.toFixed(2)}×</dd>
                  </div>
                  <div>
                    <dt>Carga</dt>
                    <dd>{effects.fatigueMultiplier.toFixed(2)}×</dd>
                  </div>
                  {effects.moraleDelta !== 0 ? (
                    <div>
                      <dt>Moral</dt>
                      <dd>
                        {effects.moraleDelta > 0 ? "+" : ""}
                        {effects.moraleDelta}
                      </dd>
                    </div>
                  ) : null}
                  {effects.cohesionDelta !== 0 ? (
                    <div>
                      <dt>Cohesión</dt>
                      <dd>
                        {effects.cohesionDelta > 0 ? "+" : ""}
                        {effects.cohesionDelta}
                      </dd>
                    </div>
                  ) : null}
                  {entry.definition.eligiblePositions !== undefined ? (
                    <div>
                      <dt>Posiciones</dt>
                      <dd>
                        {entry.definition.eligiblePositions.map((position) => (
                          <span className="ng-play-position" key={position}>
                            {position}
                          </span>
                        ))}
                      </dd>
                    </div>
                  ) : null}
                </dl>
                <footer>
                  {entry.kind === "user" ? <span className="pcb-training__module-pill-origin">Usuario</span> : <span className="pcb-training__module-pill-origin">Catálogo</span>}
                  <button
                    onClick={() =>
                      setConfiguring(
                        entry.kind === "builtin"
                          ? entry.definition
                          : TRAINING_CATALOG.find((item) => item.id === userModules.find((module) => module.id === entry.id)!.baseDefinitionId) ?? entry.definition,
                      )
                    }
                    type="button"
                  >
                    Ver
                  </button>
                  {entry.kind === "user" ? (
                    <button onClick={() => onDeleteModule?.(entry.id)} type="button">
                      Eliminar
                    </button>
                  ) : null}
                </footer>
              </article>
            );
          })}
        </div>
        {configuring !== null && (
          <div className="pcb-training__modal">
            <section>
              <header>
                <h3>{configuring.name}</h3>
                <button onClick={() => setConfiguring(null)} type="button">
                  ×
                </button>
              </header>
              <p>Categoría: {configuring.category} · Alcance: {configuring.scope}</p>
              <p>Duración por defecto: {configuring.durationMinutes} min</p>
              <EffectProfilePreview definition={configuring} />
              <footer>
                <button className="is-primary" onClick={() => setConfiguring(null)} type="button">
                  Cerrar
                </button>
              </footer>
            </section>
          </div>
        )}
        {creating && (
          <div className="pcb-training__modal">
            <section>
              <header>
                <h3>Crear módulo</h3>
                <button onClick={() => setCreating(false)} type="button">
                  ×
                </button>
              </header>
              <label>
                Nombre
                <input onChange={(event) => setDraftName(event.target.value)} type="text" value={draftName} />
              </label>
              <label>
                Tipo base
                <select
                  onChange={(event) => {
                    const base = TRAINING_CATALOG.find((entry) => entry.id === event.target.value) ?? TRAINING_CATALOG[0]!;
                    setDraftBaseId(base.id);
                    setDraftScope(allowedScopesForBase(base)[0]!);
                  }}
                  value={draftBaseId}
                >
                  {TRAINING_CATALOG.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Alcance
                <select
                  onChange={(event) => setDraftScope(event.target.value as TrainingScope)}
                  value={draftScope}
                >
                  {draftAllowedScopes.map((scope) => (
                    <option key={scope} value={scope}>
                      {scope === "team" ? "Equipo" : "Individual"}
                    </option>
                  ))}
                </select>
              </label>
              <div className="pcb-training__intensity">
                {(["Baja", "Media", "Alta"] as const).map((value) => (
                  <button
                    className={value === draftIntensity ? "is-active" : ""}
                    key={value}
                    onClick={() => setDraftIntensity(value)}
                    type="button"
                  >
                    {value}
                  </button>
                ))}
              </div>
              <EffectProfilePreview definition={draftBase} />
              <footer>
                <button onClick={() => setCreating(false)} type="button">
                  Cancelar
                </button>
                <button
                  className="is-primary"
                  disabled={draftName.trim().length === 0}
                  onClick={() => {
                    onSaveModule?.({
                      id: `module:${createEntityId()}`,
                      name: draftName.trim(),
                      baseDefinitionId: draftBase.id,
                      scope: draftScope,
                      intensity: INTENSITY_FROM_ES[draftIntensity],
                    });
                    setDraftName("");
                    setCreating(false);
                  }}
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

/** Read-only preview of a definition's real, inherited, bounded effect profile — no arbitrary numeric editing. */
function EffectProfilePreview({ definition }: { readonly definition: TrainingDefinition }) {
  const effects = definition.effects;
  return (
    <div className="pcb-training__effects">
      <strong>Perfil de efectos heredado</strong>
      <span>
        Atributos objetivo: {effects.targetRatings.length === 0 ? "ninguno" : effects.targetRatings.join(", ")}
      </span>
      <span>Estímulo de desarrollo: {effects.developmentWeight.toFixed(2)}×</span>
      <span>Carga/fatiga: {effects.fatigueMultiplier.toFixed(2)}×</span>
      {effects.moraleDelta !== 0 && <span>Moral: {effects.moraleDelta > 0 ? "+" : ""}{effects.moraleDelta}</span>}
      {effects.cohesionDelta !== 0 && <span>Cohesión de equipo: {effects.cohesionDelta > 0 ? "+" : ""}{effects.cohesionDelta}</span>}
      <span>Riesgo de lesión (metadato, no aplicado por el motor): {effects.injuryRiskWeight.toFixed(2)}×</span>
    </div>
  );
}
