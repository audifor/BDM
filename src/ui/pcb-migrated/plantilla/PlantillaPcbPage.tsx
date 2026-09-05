import { Fragment, useMemo, useState, type ReactNode } from "react";
import { getTeamRoster, type GameWorld } from "@/domain/world";
import { getUserTeam } from "@/engine/calendar";
import type { LineupSlot } from "@/domain/tactics";
import type { PlayerId } from "@/domain/ids";
import type { EntityDestination } from "@/ui/navigation/entityNavigation";
import { PlayerNameLink } from "@/ui/navigation/PlayerNameLink";
import { PrecisionDivHead } from "@/ui-ng/components/PrecisionDivHead";
import { usePrecisionDivGrid, type PrecisionDivColumn } from "@/ui-ng/components/usePrecisionDivGrid";
import {
  PLANTILLA_VISUAL_MOCK_ROWS,
  PSYCHOLOGY_COLUMNS,
} from "./PlantillaVisualMock";
import { CanonicalRoster } from "./CanonicalRoster";
import "./PlantillaPcbPage.css";
import "./PlantillaRenderer.css";
import "./PlantillaA11y.css";

type Group = {
  readonly id: string;
  readonly mentor: string;
  readonly mentees: readonly string[];
  readonly focus: string;
};
const views = [
  { id: "general", name: "Resumen General", columns: [0, 1, 2, 3, 4, 5] },
  {
    id: "psico",
    name: "Psico",
    columns: PSYCHOLOGY_COLUMNS.map((_, index) => index),
  },
  { id: "physical", name: "Físico", columns: [3, 4, 5, 6, 7, 8] },
] as const;
const playerNames = PLANTILLA_VISUAL_MOCK_ROWS.map((row) => row.name);

const ANALYSIS_COLUMNS: readonly PrecisionDivColumn[] = [
  { id: "pos", label: "Pos", width: 66 },
  { id: "starter", label: "Titular", width: 318 },
  { id: "rotation", label: "Rotación", width: 318 },
  { id: "bench", label: "Reservas", width: 318 },
];
const MENTOR_COLUMNS: readonly PrecisionDivColumn[] = [
  { id: "focus", label: "Enfoque", width: 190 },
  { id: "mentor", label: "Mentor", width: 230 },
  { id: "mentees", label: "Aprendices", width: 360 },
  { id: "action", label: "Acción", width: 130 },
];

export function PlantillaPcbPage({
  onLineupSlotChange,
  onLineupSlotClear,
  onOpenEntity,
  world,
}: {
  readonly onLineupSlotChange?: (slot: LineupSlot, playerId: PlayerId) => void;
  readonly onLineupSlotClear?: (slot: LineupSlot) => void;
  readonly onOpenEntity?: (destination: EntityDestination) => void;
  readonly world?: GameWorld;
}) {
  const [rosterSection, setRosterSection] = useState("overview");
  const team = useMemo(() => (world === undefined ? undefined : getUserTeam(world)), [world]);
  return (
    <section aria-label="Plantilla PCB migrada" className="pcb-plantilla">
      <div className="pcb-plantilla__page">
        {team === undefined || world === undefined ? (
          <p className="content-panel">No team assigned to the user coach.</p>
        ) : (
          <CanonicalRoster
            activeView="general"
            onLineupSlotChange={onLineupSlotChange}
            onLineupSlotClear={onLineupSlotClear}
            onOpenEntity={onOpenEntity}
            onViewChange={setRosterSection}
            rosterSection={rosterSection}
            team={team}
            world={world}
          />
        )}
      </div>
    </section>
  );
}

function LegacyRoster() {
  const [view, setView] = useState("psico");
  const [query, setQuery] = useState("");
  const [columns, setColumns] = useState<readonly number[]>(views[1].columns);
  const [picker, setPicker] = useState(false);
  const [sort, setSort] = useState<{
    readonly id: string;
    readonly asc: boolean;
  }>({ id: "name", asc: true });
  const [dragged, setDragged] = useState<number>();
  const [selected, setSelected] = useState<string>();
  const rows = useMemo(
    () =>
      PLANTILLA_VISUAL_MOCK_ROWS.filter((row) =>
        row.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
      )
        .slice()
        .sort((a, b) => {
          const x = sort.id === "name" ? a.name : a.values[Number(sort.id)]!;
          const y = sort.id === "name" ? b.name : b.values[Number(sort.id)]!;
          return (
            (typeof x === "string"
              ? x.localeCompare(y as string)
              : x - (y as number)) * (sort.asc ? 1 : -1)
          );
        }),
    [query, sort],
  );
  const chooseView = (id: string) => {
    const next = views.find((item) => item.id === id);
    if (next !== undefined) {
      setView(id);
      setColumns(next.columns);
    }
  };
  const changeSort = (id: string) =>
    setSort((current) =>
      current.id === id ? { id, asc: !current.asc } : { id, asc: true },
    );
  const drop = (column: number) => {
    if (dragged === undefined || dragged === column) return;
    setColumns((current) => {
      const next = current.filter((item) => item !== dragged);
      next.splice(next.indexOf(column), 0, dragged);
      return next;
    });
    setView("custom");
  };
  return (
    <div className="pcb-plantilla__bento">
      <div className="pcb-plantilla__toolbar">
        <div className="pcb-plantilla__toolbar-top">
          <div className="pcb-plantilla__identity">
            <span className="pcb-plantilla__icon">▦</span>
            <div>
              <strong>Plantilla (12)</strong>
              <small>Casademont Zaragoza</small>
            </div>
          </div>
          <div className="pcb-plantilla__actions">
            <input
              aria-label="Buscar jugador"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar jugador..."
              value={query}
            />
            <button
              aria-label="Configurar columnas"
              onClick={() => setPicker((open) => !open)}
              type="button"
            >
              ⚙
            </button>
          </div>
        </div>
        <div className="pcb-plantilla__views">
          {views.map((item) => (
            <button
              className={view === item.id ? "is-active" : ""}
              key={item.id}
              onClick={() => chooseView(item.id)}
              type="button"
            >
              {item.name}
            </button>
          ))}
          {view === "custom" && (
            <span className="pcb-plantilla__view-badge is-active" role="status">
              Personalizada
            </span>
          )}
        </div>
        {picker && (
          <div className="pcb-plantilla__column-picker">
            <header>
              <strong>Columnas</strong>
              <span>
                <button onClick={() => chooseView("general")} type="button">
                  Reset
                </button>
                <button
                  onClick={() => {
                    setColumns([]);
                    setView("custom");
                  }}
                  type="button"
                >
                  Solo nombre
                </button>
              </span>
            </header>
            <div>
              {PSYCHOLOGY_COLUMNS.map((label, index) => (
                <button
                  className={columns.includes(index) ? "is-on" : ""}
                  key={label}
                  onClick={() => {
                    setColumns((current) =>
                      current.includes(index)
                        ? current.filter((item) => item !== index)
                        : [...current, index],
                    );
                    setView("custom");
                  }}
                  type="button"
                >
                  <span>{label}</span>
                  <b>{columns.includes(index) ? "ON" : ""}</b>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="pcb-plantilla__table-wrap">
        <div
          className="pcb-plantilla__table ng-precision-grid"
          style={{
            gridTemplateColumns: `52px 190px repeat(${columns.length},92px)`,
          }}
        >
          <div className="pcb-plantilla__head">EST</div>
          <button
            className="pcb-plantilla__head pcb-plantilla__head--button pcb-plantilla__head--name"
            onClick={() => changeSort("name")}
            type="button"
          >
            JUGADOR
          </button>
          {columns.map((column) => (
            <button
              className="pcb-plantilla__head pcb-plantilla__head--button"
              draggable
              key={column}
              onClick={() => changeSort(String(column))}
              onDragEnd={() => setDragged(undefined)}
              onDragOver={(event) => event.preventDefault()}
              onDragStart={() => setDragged(column)}
              onDrop={() => drop(column)}
              type="button"
            >
              {PSYCHOLOGY_COLUMNS[column]}
              {sort.id === String(column) ? (
                <em>{sort.asc ? " ↑" : " ↓"}</em>
              ) : null}
            </button>
          ))}
          {rows.map((row) => (
            <div
              className={
                "pcb-plantilla__row" +
                (selected === row.id ? " is-selected" : "")
              }
              key={row.id}
              onClick={() => setSelected(row.id)}
            >
              <div className="pcb-plantilla__cell">
                <span className="pcb-plantilla__status">{row.status}</span>
              </div>
              <div className="pcb-plantilla__cell pcb-plantilla__cell--name">
                {row.name}
              </div>
              {columns.map((column) => (
                <div className="pcb-plantilla__cell" key={column}>
                  {row.values[column]}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Analysis() {
  const positions = ["PG", "SG", "SF", "PF", "C"];
  const [selected, setSelected] = useState<string | null>(null);
  const analysisGrid = usePrecisionDivGrid("ng-plantilla-analysis", ANALYSIS_COLUMNS);
  const selectedRow = PLANTILLA_VISUAL_MOCK_ROWS.find(
    (row) => row.name === selected,
  );
  return (
    <div className="pcb-plantilla__analysis">
      <section>
        <header>
          <h2>Análisis de Plantilla</h2>
          <span>Depth Chart</span>
        </header>
        <div className="pcb-plantilla__analysis-table ng-precision-grid">
          <div style={analysisGrid.style}>
            {analysisGrid.ordered.map((column) => (
              <PrecisionDivHead
                key={column.id}
                headerProps={analysisGrid.headerProps(column.id)}
                label={column.label}
                onResize={analysisGrid.startResize(column.id)}
                resizeClassName="pcb-plantilla__column-resize"
              />
            ))}
          </div>
          {positions.map((position, index) => {
            const cells: Record<string, ReactNode> = {
              pos: <b>{position}</b>,
              starter: <span>{playerNames[index]}</span>,
              rotation: <span>{playerNames[(index + 5) % playerNames.length]}</span>,
              bench: <span>{playerNames[(index + 8) % playerNames.length]}</span>,
            };
            return (
              <div key={position} style={analysisGrid.style}>
                {analysisGrid.ordered.map((column) => (
                  <Fragment key={column.id}>{cells[column.id]}</Fragment>
                ))}
              </div>
            );
          })}
        </div>
      </section>
      <section>
        <header>
          <h2>Dinámicas</h2>
          <span>Cohesión</span>
        </header>
        <div className="pcb-plantilla__cohesion">
          <label>
            Cohesión{" "}
            <i>
              <b />
            </i>
            <strong>68%</strong>
          </label>
        </div>
        <h3>Líderes</h3>
        <div className="pcb-plantilla__chips">
          {playerNames.slice(0, 3).map((name) => (
            <button
              className={selected === name ? "is-active" : ""}
              key={name}
              onClick={() => setSelected(name)}
              type="button"
            >
              {name}
            </button>
          ))}
        </div>
        <h3>Influyentes</h3>
        <div className="pcb-plantilla__chips">
          {playerNames.slice(3, 7).map((name) => (
            <button
              className={selected === name ? "is-active" : ""}
              key={name}
              onClick={() => setSelected(name)}
              type="button"
            >
              {name}
            </button>
          ))}
        </div>
        {selectedRow && (
          <div className="pcb-plantilla__player-detail">
            <header>
              <strong>{selectedRow.name}</strong>
              <button onClick={() => setSelected(null)} type="button">
                Cerrar
              </button>
            </header>
            <dl>
              {PSYCHOLOGY_COLUMNS.map((label, index) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{selectedRow.values[index]}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </section>
    </div>
  );
}

export function MentoringPcbPage({
  world,
  variant = "legacy",
  onOpenPlayer,
}: {
  readonly world?: GameWorld;
  readonly variant?: "legacy" | "ng";
  readonly onOpenPlayer?: (playerId: PlayerId) => void;
} = {}) {
  const rosterChoices = useMemo(() => {
    if (world === undefined) return playerNames.map((name, index) => ({ id: `mock-${index}`, name }));
    const team = getUserTeam(world);
    if (team === undefined) return playerNames.map((name, index) => ({ id: `mock-${index}`, name }));
    return getTeamRoster(world, team.id).map((player) => ({
      id: player.id,
      name: `${player.firstName} ${player.lastName}`,
    }));
  }, [world]);
  const nameById = useMemo(() => new Map(rosterChoices.map((choice) => [choice.id, choice.name])), [rosterChoices]);
  const labelFor = (id: string) => nameById.get(id) ?? id;
  const [groups, setGroups] = useState<readonly Group[]>(() =>
    world === undefined
      ? [
          {
            id: "mentoring-1",
            mentor: playerNames[3]!,
            mentees: [playerNames[0]!, playerNames[1]!],
            focus: "Ética de trabajo",
          },
        ]
      : [],
  );
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [mentor, setMentor] = useState("");
  const [focus, setFocus] = useState("Clutch");
  const [mentees, setMentees] = useState<readonly string[]>([]);
  const mentorGrid = usePrecisionDivGrid("ng-mentoring-groups", MENTOR_COLUMNS);
  const filtered = groups.filter((group) =>
    `${labelFor(group.mentor)} ${group.focus} ${group.mentees.map(labelFor).join(" ")}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  const create = () => {
    if (mentor === "" || mentees.length === 0) return;
    setGroups((current) => [
      ...current,
      { id: `mentoring-${current.length + 1}`, mentor, mentees, focus },
    ]);
    setCreating(false);
    setMentor("");
    setMentees([]);
  };
  return (
    <main className={`pcb-plantilla${variant === "ng" ? " pcb-plantilla--ng" : ""}`}>
    <section aria-label="Mentoring PCB migrado" className="pcb-plantilla__mentoring">
      <header>
        <div>
          <b>M</b>
          <span>
            <strong>Mentoring</strong>
            <small>{groups.length} Grupos Activos</small>
          </span>
        </div>
        <span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar grupo..."
            value={query}
          />
          <button onClick={() => setCreating((open) => !open)} type="button">
            + Nuevo
          </button>
        </span>
      </header>
      <div className="pcb-plantilla__mentor-table ng-precision-grid">
        <div style={mentorGrid.style}>
          {mentorGrid.ordered.map((column) => (
            <PrecisionDivHead
              key={column.id}
              headerProps={mentorGrid.headerProps(column.id)}
              label={column.label}
              onResize={mentorGrid.startResize(column.id)}
              resizeClassName="pcb-plantilla__column-resize"
            />
          ))}
        </div>
        {filtered.map((group) => {
          const cells: Record<string, ReactNode> = {
            focus: <span>{group.focus}</span>,
            mentor: (
              <span>
                <PlayerNameLink onOpenPlayer={onOpenPlayer} playerId={group.mentor as PlayerId}>
                  {labelFor(group.mentor)}
                </PlayerNameLink>
              </span>
            ),
            mentees: (
              <span>
                {group.mentees.map((menteeId, index) => (
                  <span key={menteeId}>
                    {index > 0 ? " · " : null}
                    <PlayerNameLink onOpenPlayer={onOpenPlayer} playerId={menteeId as PlayerId}>
                      {labelFor(menteeId)}
                    </PlayerNameLink>
                  </span>
                ))}
              </span>
            ),
            action: (
              <button
                onClick={() =>
                  setGroups((current) =>
                    current.filter((item) => item.id !== group.id),
                  )
                }
                type="button"
              >
                Eliminar
              </button>
            ),
          };
          return (
            <div key={group.id} style={mentorGrid.style}>
              {mentorGrid.ordered.map((column) => (
                <Fragment key={column.id}>{cells[column.id]}</Fragment>
              ))}
            </div>
          );
        })}
      </div>
      {creating && (
        <div className="pcb-plantilla__mentor-create">
          <h2>Crear Grupo</h2>
          <label>
            Mentor
            <select
              onChange={(event) => setMentor(event.target.value)}
              value={mentor}
            >
              <option value="">Seleccionar mentor</option>
              {rosterChoices.map((choice) => (
                <option key={choice.id} value={choice.id}>{choice.name}</option>
              ))}
            </select>
          </label>
          <label>
            Enfoque
            <select
              onChange={(event) => setFocus(event.target.value)}
              value={focus}
            >
              {PSYCHOLOGY_COLUMNS.slice(0, 6).map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <h3>Aprendices</h3>
          <div className="pcb-plantilla__chips">
            {rosterChoices.map((choice) => (
              <button
                className={mentees.includes(choice.id) ? "is-active" : ""}
                key={choice.id}
                onClick={() =>
                  setMentees((current) =>
                    current.includes(choice.id)
                      ? current.filter((item) => item !== choice.id)
                      : [...current, choice.id],
                  )
                }
                type="button"
              >
                {choice.name}
              </button>
            ))}
          </div>
          <button
            disabled={mentor === "" || mentees.length === 0}
            onClick={create}
            type="button"
          >
            Crear Grupo
          </button>
        </div>
      )}
    </section>
    </main>
  );
}
