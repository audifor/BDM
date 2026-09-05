import { useMemo, useRef, useState } from "react";

import type { CanonicalRatingKey, LegacyPlayerRatings, Player } from "@/domain/player";
import { getPlayerAge, legacyRatingSignals } from "@/domain/player";
import { formatInjuryKind } from "@/domain/injury";
import {
  getCareerFatigueForPlayer,
  getCurrentPlayerContract,
  getCurrentPlayerInjury,
  getPersonality,
  getTeamLineup,
  getTeamRoster,
} from "@/domain/world";
import type { GameWorld } from "@/domain/world";
import { LINEUP_SLOTS, getLineupSlotForPlayer, type LineupSlot } from "@/domain/tactics";
import type { PersonalityDimension } from "@/domain/personality";
import { PERSONALITY_DIMENSIONS } from "@/domain/personality";
import type { PlayerId, TeamId } from "@/domain/ids";
import { BDMDataGrid } from "@/ui/dataGrid/BDMDataGrid";
import type { DataGridColumn, DataGridView } from "@/ui/dataGrid/types";
import { BdmIcon } from "@/ui/icons/BdmIcon";
import type { EntityDestination } from "@/ui/navigation/entityNavigation";
import { useEntityContextMenu } from "@/ui/entityContextMenu/EntityContextMenuProvider";
import {
  filterRosterByPosition,
  ROSTER_POSITION_FILTERS,
} from "@/ui-ng/applications/roster/rosterPositionFilter";
import { buildRosterRatingEvaluationLookup } from "@/ui-ng/applications/roster/rosterRatingPresentation";
import {
  scoutAwareRatingColumn,
  scoutAwareSummaryColumn,
} from "@/ui-ng/applications/roster/rosterScoutAwareColumns";
import type { RosterNgSessionBridge } from "@/ui-ng/applications/roster/rosterWorkspaceSession";
import { buildRosterStaffComments } from "@/ui-ng/applications/roster/buildRosterStaffComments";
import { RosterRowInspector } from "@/ui-ng/applications/roster/components/RosterRowInspector";
import { RosterStaffComments } from "@/ui-ng/applications/roster/components/RosterStaffComments";

import "./CanonicalRoster.css";

function compactMoney(value: number) {
  return value >= 1_000_000
    ? `$${Math.round(value / 1_000_000)}M`
    : `$${Math.round(value / 1_000)}K`;
}

/**
 * Curated groupings of real Player V2 `CANONICAL_RATING_KEYS` behind each roster
 * preset. Every key here is a genuine attribute on `player.basketball.ratings` -
 * no aggregate is invented; each column renders one real rating value.
 */
export const OFFENSE_RATING_KEYS: readonly CanonicalRatingKey[] = [
  "midRangeShooting",
  "threePointShooting",
  "freeThrowShooting",
  "rimFinishing",
  "postScoring",
  "passing",
];
export const BRAIN_RATING_KEYS: readonly CanonicalRatingKey[] = [
  "decisionMaking",
  "anticipation",
  "composure",
  "offBallAwareness",
  "discipline",
  "courtVision",
];
export const DEFENSE_RATING_KEYS: readonly CanonicalRatingKey[] = [
  "perimeterDefense",
  "interiorDefense",
  "defensiveAwareness",
  "steal",
  "rimProtection",
  "shotContest",
];
export const PHYSICAL_RATING_KEYS: readonly CanonicalRatingKey[] = [
  "acceleration",
  "speed",
  "strength",
  "vertical",
  "stamina",
  "lateralAgility",
];
export const BALL_HANDLING_RATING_KEYS: readonly CanonicalRatingKey[] = [
  "ballHandling",
  "ballSecurity",
  "firstStep",
  "changeOfDirection",
];

const RATING_COLUMN_LABELS: Readonly<Record<CanonicalRatingKey, string>> = {
  midRangeShooting: "TIRO MEDIO",
  threePointShooting: "TRIPLE",
  freeThrowShooting: "T. LIBRES",
  rimFinishing: "FINAL. ARO",
  contactFinishing: "FIN. CONTACTO",
  dunking: "MATE",
  floater: "FLOATER",
  postScoring: "POSTE",
  ballHandling: "BOTE",
  ballSecurity: "SEGURIDAD",
  firstStep: "1ER PASO",
  changeOfDirection: "CAMBIO DIR.",
  passing: "PASE",
  courtVision: "VISIÓN",
  perimeterDefense: "DEF. EXT.",
  interiorDefense: "DEF. INT.",
  screenNavigation: "NAV. BLOQUEO",
  defensiveAwareness: "IQ DEFENSIVO",
  steal: "ROBO",
  rimProtection: "PROT. ARO",
  shotContest: "CONTESTE",
  offensiveRebounding: "REB. OFEN.",
  defensiveRebounding: "REB. DEF.",
  boxOut: "BOX OUT",
  acceleration: "ACELERACIÓN",
  speed: "VELOCIDAD",
  lateralAgility: "AGILIDAD",
  strength: "FUERZA",
  vertical: "VERTICAL",
  stamina: "RESISTENCIA",
  decisionMaking: "DECISIÓN",
  anticipation: "ANTICIPACIÓN",
  composure: "SANGRE FRÍA",
  offBallAwareness: "IQ SIN BALÓN",
  discipline: "DISCIPLINA",
};

const PERSONALITY_COLUMN_LABELS: Readonly<Record<PersonalityDimension, string>> = {
  ambition: "AMBICIÓN",
  professionalism: "PROFESIONALIDAD",
  loyalty: "LEALTAD",
  resilience: "RESILIENCIA",
  temperament: "TEMPERAMENTO",
  teamOrientation: "ORIENT. EQUIPO",
  adaptability: "ADAPTABILIDAD",
  competitiveness: "COMPETITIVIDAD",
};

/**
 * Deterministic compact basketball summary signals (FIN/SHO/PMK/PDE/IDE/REB/ATH),
 * derived purely from the 35 canonical Player V2 ratings via the domain's
 * `legacyRatingSignals` projection. Display-only: never persisted back onto
 * PlayerTruth, never read from stale/obsolete legacy rating data.
 */
export function getBasketballSummarySignals(player: Player): LegacyPlayerRatings {
  return legacyRatingSignals(player.basketball.ratings);
}

const SUMMARY_SIGNAL_LABELS: Readonly<Record<keyof LegacyPlayerRatings, string>> = {
  finishing: "FIN",
  shooting: "SHO",
  playmaking: "PMK",
  perimeterDefense: "PDE",
  interiorDefense: "IDE",
  rebounding: "REB",
  athleticism: "ATH",
};
const SUMMARY_SIGNAL_KEYS = Object.keys(SUMMARY_SIGNAL_LABELS) as readonly (keyof LegacyPlayerRatings)[];

function summarySignalColumn(key: keyof LegacyPlayerRatings): DataGridColumn<Player> {
  return {
    id: `summary-${key}`,
    label: SUMMARY_SIGNAL_LABELS[key],
    defaultWidth: 74,
    minWidth: 56,
    numeric: true,
    sortable: true,
    value: (player) => getBasketballSummarySignals(player)[key],
    render: (player) => getBasketballSummarySignals(player)[key],
  };
}

function ratingColumn(key: CanonicalRatingKey): DataGridColumn<Player> {
  return {
    id: `rating-${key}`,
    label: RATING_COLUMN_LABELS[key],
    defaultWidth: 92,
    minWidth: 72,
    numeric: true,
    sortable: true,
    value: (player) => player.basketball.ratings[key],
    render: (player) => player.basketball.ratings[key],
  };
}

export type CanonicalRosterVariant = "legacy" | "ng";

export function CanonicalRoster({
  activeView = "general",
  embedInspector = true,
  onLineupSlotChange,
  onLineupSlotClear,
  onOpenEntity,
  onViewChange,
  rosterSection = "overview",
  sessionBridge,
  team,
  variant = "legacy",
  world,
}: {
  readonly activeView?: string;
  readonly embedInspector?: boolean;
  readonly onLineupSlotChange?: (slot: LineupSlot, playerId: PlayerId) => void;
  readonly onLineupSlotClear?: (slot: LineupSlot) => void;
  readonly onOpenEntity?: (destination: EntityDestination) => void;
  readonly onViewChange?: (view: string) => void;
  readonly rosterSection?: string;
  readonly sessionBridge?: RosterNgSessionBridge;
  readonly team: { readonly id: TeamId; readonly name: string };
  readonly variant?: CanonicalRosterVariant;
  readonly world: GameWorld;
}) {
  const isNg = variant === "ng";
  const [query, setQuery] = useState("");
  const playerMenu = useEntityContextMenu();
  const [selectedId, setSelectedId] = useState<string>();
  const [internalRatingView, setInternalRatingView] = useState(activeView);
  const ratingView = sessionBridge?.activePreset ?? internalRatingView;
  const setRatingView = sessionBridge?.onActivePresetChange ?? setInternalRatingView;
  const positionFilter = sessionBridge?.positionFilter ?? "ALL";
  const gridSearchQuery = sessionBridge?.searchQuery;
  const gridSelectedIds = sessionBridge?.selectedRowIds;
  const lineup = useMemo(() => getTeamLineup(world, team.id), [world, team.id]);
  const gridRef = useRef<HTMLDivElement>(null);
  const roster = useMemo(() => getTeamRoster(world, team.id), [world, team.id]);
  const rows = useMemo(() => {
    const filteredBySection = isNg
      ? roster
      : roster.filter((player) =>
          `${player.firstName} ${player.lastName}`
            .toLocaleLowerCase()
            .includes(query.trim().toLocaleLowerCase()),
        );
    if (isNg && sessionBridge !== undefined) {
      return filterRosterByPosition(filteredBySection, positionFilter);
    }
    return filteredBySection;
  }, [isNg, positionFilter, query, roster, sessionBridge]);
  const openPlayer = (player: Player) =>
    onOpenEntity?.({
      type: "player",
      playerId: player.id,
      section: "overview",
    });
  const ratingEvaluationLookup = useMemo(
    () => (isNg ? buildRosterRatingEvaluationLookup(world, team.id) : undefined),
    [isNg, world, team.id],
  );
  const columns = useMemo<readonly DataGridColumn<Player>[]>(
    () => {
      const summaryColumns =
        isNg && ratingEvaluationLookup !== undefined
          ? SUMMARY_SIGNAL_KEYS.map((key) =>
              scoutAwareSummaryColumn(
                ratingEvaluationLookup,
                key,
                SUMMARY_SIGNAL_LABELS[key],
              ),
            )
          : SUMMARY_SIGNAL_KEYS.map(summarySignalColumn);
      const ratingColumns = (keys: readonly CanonicalRatingKey[]) =>
        isNg && ratingEvaluationLookup !== undefined
          ? keys.map((key) =>
              scoutAwareRatingColumn(
                ratingEvaluationLookup,
                key,
                RATING_COLUMN_LABELS[key],
              ),
            )
          : keys.map(ratingColumn);

      return [
      {
        id: "status",
        label: "EST",
        defaultWidth: 58,
        minWidth: 54,
        sortable: true,
        value: (player) => getCurrentPlayerInjury(world, player.id)?.kind ?? "ready",
        render: (player) => {
          const injury = getCurrentPlayerInjury(world, player.id);
          if (injury === undefined) {
            return <span className="canonical-roster__status canonical-roster__status--ok">OK</span>;
          }
          return (
            <span
              className="canonical-roster__status canonical-roster__status--out"
              title={`${formatInjuryKind(injury.kind)} · return ${injury.expectedReturnDate}`}
            >
              OUT
            </span>
          );
        },
      },
      {
        id: "player",
        label: "JUGADOR",
        defaultWidth: 235,
        minWidth: 180,
        required: true,
        searchable: true,
        sortable: true,
        value: (player) => `${player.lastName} ${player.firstName}`,
        render: (player) => (
          <button
            className="canonical-roster__player-link"
            onClick={(event) => {
              event.stopPropagation();
              openPlayer(player);
            }}
            onContextMenu={(event) => playerMenu.open({ type: "player", id: player.id }, event, { surface: "roster" })}
            type="button"
          >
            {player.firstName} {player.lastName}
          </button>
        ),
      },
      {
        id: "position",
        label: "POS",
        defaultWidth: 64,
        minWidth: 56,
        sortable: true,
        value: (player) => player.basketball.primaryPosition,
        render: (player) => (
          <span className="canonical-roster__position ng-play-position">
            {player.basketball.primaryPosition}
          </span>
        ),
      },
      {
        id: "rotation",
        label: "ROL",
        defaultWidth: 88,
        minWidth: 72,
        sortable: true,
        value: (player) => getLineupSlotForPlayer(lineup, player.id) ?? "",
        render: (player) => {
          const currentSlot = getLineupSlotForPlayer(lineup, player.id);
          return (
            <select
              aria-label={`Rotación ${player.firstName} ${player.lastName}`}
              className="canonical-roster__rotation"
              onChange={(event) => {
                const next = event.target.value;
                if (next === "") onLineupSlotClear?.(currentSlot ?? "B1");
                else onLineupSlotChange?.(next as LineupSlot, player.id);
              }}
              value={currentSlot ?? ""}
            >
              <option value="">Sin rol</option>
              {LINEUP_SLOTS.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
          );
        },
      },
      {
        id: "age",
        label: "EDAD",
        defaultWidth: 64,
        minWidth: 52,
        numeric: true,
        sortable: true,
        value: (player) => getPlayerAge(world, player.id),
        render: (player) => getPlayerAge(world, player.id),
      },
      {
        id: "height",
        label: "ALT",
        defaultWidth: 100,
        minWidth: 76,
        numeric: true,
        sortable: true,
        value: (player) => player.bio.heightCm,
        render: (player) => `${player.bio.heightCm} cm`,
      },
      {
        id: "weight",
        label: "PESO",
        defaultWidth: 100,
        minWidth: 76,
        numeric: true,
        sortable: true,
        value: (player) => player.bio.weightKg,
        render: (player) => `${player.bio.weightKg} kg`,
      },
      {
        id: "fatigue",
        label: "FATIGA",
        defaultWidth: 90,
        minWidth: 72,
        numeric: true,
        sortable: true,
        value: (player) => getCareerFatigueForPlayer(world, player.id),
        render: (player) => getCareerFatigueForPlayer(world, player.id),
      },
      {
        id: "salary",
        label: "CONTRATO",
        defaultWidth: 150,
        minWidth: 100,
        numeric: true,
        sortable: true,
        value: (player) =>
          getCurrentPlayerContract(world, player.id)?.compensation
            .annualSalary ?? 0,
        render: (player) => {
          const contract = getCurrentPlayerContract(world, player.id);
          return contract === undefined
            ? "Beca"
            : compactMoney(contract.compensation.annualSalary);
        },
      },
      {
        id: "expiry",
        label: "EXP",
        defaultWidth: 150,
        minWidth: 96,
        sortable: true,
        value: (player) =>
          getCurrentPlayerContract(world, player.id)?.term.expiresOn ?? "",
        render: (player) =>
          getCurrentPlayerContract(world, player.id)?.term.expiresOn ?? "—",
      },
      ...summaryColumns,
      ...ratingColumns(OFFENSE_RATING_KEYS),
      ...ratingColumns(BRAIN_RATING_KEYS),
      ...ratingColumns(DEFENSE_RATING_KEYS),
      ...ratingColumns(PHYSICAL_RATING_KEYS),
      ...ratingColumns(BALL_HANDLING_RATING_KEYS),
      ...PERSONALITY_DIMENSIONS.map(
        (dimension): DataGridColumn<Player> => ({
          id: `personality-${dimension}`,
          label: PERSONALITY_COLUMN_LABELS[dimension],
          defaultWidth: 110,
          minWidth: 84,
          numeric: true,
          sortable: true,
          value: (player) => getPersonality(world, player.id)?.values[dimension] ?? 0,
          render: (player) => getPersonality(world, player.id)?.values[dimension] ?? "—",
        }),
      ),
    ];
    },
    [
      isNg,
      lineup,
      onLineupSlotChange,
      onLineupSlotClear,
      playerMenu,
      ratingEvaluationLookup,
      world,
    ],
  );
  const offenseColumnIds = OFFENSE_RATING_KEYS.map((key) => `rating-${key}`);
  const brainColumnIds = BRAIN_RATING_KEYS.map((key) => `rating-${key}`);
  const defenseColumnIds = DEFENSE_RATING_KEYS.map((key) => `rating-${key}`);
  const physicalColumnIds = PHYSICAL_RATING_KEYS.map((key) => `rating-${key}`);
  const ballHandlingColumnIds = BALL_HANDLING_RATING_KEYS.map((key) => `rating-${key}`);
  const personalityColumnIds = PERSONALITY_DIMENSIONS.map((dimension) => `personality-${dimension}`);
  const baseColumnIds = ["status", "player", "position", "rotation", "age"];
  const summaryColumnIds = SUMMARY_SIGNAL_KEYS.map((key) => `summary-${key}`);
  const views: readonly DataGridView[] = [
    {
      id: "general",
      name: "Resumen General",
      // Compact FM-like overview: core roster fields plus the established
      // FIN/SHO/PMK/PDE/IDE/REB/ATH basketball summary signals (deterministic
      // projections of the 35 canonical ratings) - not every rating/personality column.
      columnIds: [...baseColumnIds, ...summaryColumnIds, "fatigue", "salary", "expiry"],
    },
    {
      id: "offense",
      name: "Ofensiva",
      columnIds: [...baseColumnIds, ...offenseColumnIds],
    },
    {
      id: "brain",
      name: "Cerebro",
      columnIds: [...baseColumnIds, ...brainColumnIds],
    },
    {
      id: "defense",
      name: "Defensa",
      columnIds: [...baseColumnIds, ...defenseColumnIds],
    },
    {
      id: "physical",
      name: "Físico",
      columnIds: [...baseColumnIds, "height", "weight", ...physicalColumnIds],
    },
    {
      id: "ballHandling",
      name: "Manejo",
      columnIds: [...baseColumnIds, ...ballHandlingColumnIds],
    },
    {
      id: "psico",
      name: "Psico",
      columnIds: [...baseColumnIds, ...personalityColumnIds],
    },
    {
      id: "custom",
      name: "Personalizada",
      columnIds: columns.map((column) => column.id),
    },
  ];
  const selectedView =
    views.find((view) => view.id === ratingView) ?? views[0]!;
  const currentSelection = gridSelectedIds ?? (selectedId === undefined ? [] : [selectedId]);
  const inspectedId = currentSelection.at(-1);
  const handleSelectionChange = (ids: readonly string[]) => {
    const nextId = ids.at(-1);
    if (
      isNg &&
      ids.length === 1 &&
      currentSelection.length === 1 &&
      nextId !== undefined &&
      nextId === inspectedId
    ) {
      setSelectedId(undefined);
      sessionBridge?.onSelectedRowIdsChange([]);
      return;
    }
    setSelectedId(nextId);
    sessionBridge?.onSelectedRowIdsChange(ids);
  };
  const inspectedPlayer = inspectedId === undefined ? undefined : rows.find((player) => player.id === inspectedId);

  return (
    <section className={`canonical-roster${isNg ? " canonical-roster--ng ng-holo-panel" : ""}`}>
      <header className="canonical-roster__toolbar">
        <div className="canonical-roster__identity">
          {!isNg && (
            <span className="canonical-roster__icon">
              <BdmIcon name="roster" size={28} />
            </span>
          )}
          <div>
            <strong>{isNg ? 'Plantilla' : `Plantilla (${roster.length})`}</strong>
            {isNg ? (
              <small>
                <span className="ng-type-numeric">{roster.length}</span> jugadores
              </small>
            ) : (
              <small>{team.name}</small>
            )}
          </div>
        </div>
        <div className="canonical-roster__actions">
          {!isNg && (
            <label className="canonical-roster__view-select">
              <span>Vista</span>
              <select
                aria-label="Vista"
                onChange={(event) => onViewChange?.(event.target.value)}
                value={rosterSection}
              >
                <option value="overview">Vista general</option>
                <option value="jerseys">Dorsales</option>
                <option value="registration">Inscripción</option>
                <option value="all-players">Todos los jugadores</option>
              </select>
            </label>
          )}
          <label className="canonical-roster__view-select">
            <span>VISTA</span>
            <select
              aria-label="Preset de columnas"
              onChange={(event) => setRatingView(event.target.value)}
              value={selectedView.id}
            >
              {views.map((view) => (
                <option key={view.id} value={view.id}>
                  {view.name}
                </option>
              ))}
            </select>
          </label>
          {isNg && sessionBridge !== undefined && (
            <div aria-label="Filtro de posición" className="canonical-roster__pos-filter" role="group">
              <span className="canonical-roster__pos-filter-label">POS</span>
              {ROSTER_POSITION_FILTERS.map((filter) => (
                <button
                  aria-pressed={positionFilter === filter}
                  key={filter}
                  onClick={() => sessionBridge.onPositionFilterChange(filter)}
                  type="button"
                >
                  {filter === 'ALL' ? 'TODOS' : filter}
                </button>
              ))}
            </div>
          )}
          {isNg ? (
            <input
              aria-label="Search grid"
              onChange={(event) =>
                sessionBridge === undefined
                  ? setQuery(event.target.value)
                  : sessionBridge.onSearchQueryChange(event.target.value)
              }
              placeholder="Buscar jugador..."
              type="search"
              value={gridSearchQuery ?? query}
            />
          ) : (
            <input
              aria-label="Buscar jugador"
              onChange={(event) => setQuery(event.target.value)}
              value={query}
            />
          )}
          <button
            aria-label="Configurar columnas"
            onClick={() =>
              gridRef.current
                ?.querySelector<HTMLButtonElement>(
                  '[aria-label="Customise columns"]',
                )
                ?.click()
            }
            type="button"
          >
            ⚙
          </button>
        </div>
      </header>
      <div className="canonical-roster__grid" ref={gridRef}>
        <BDMDataGrid
          columns={columns}
          gridId={`plantilla-pcb-${selectedView.id}`}
          key={selectedView.id}
          onRowClick={(player) => {
            setSelectedId(player.id);
            openPlayer(player);
          }}
          onSearchQueryChange={sessionBridge?.onSearchQueryChange ?? (isNg ? setQuery : undefined)}
          onSelectionChange={handleSelectionChange}
          presentation="fm"
          entityForRow={(player) => ({ type: "player", id: player.id })}
          entitySurface="roster"
          multiSelect
          rows={rows}
          searchQuery={isNg ? (gridSearchQuery ?? query) : undefined}
          selectedId={gridSelectedIds === undefined ? selectedId : undefined}
          selectedIds={gridSelectedIds}
          views={[selectedView]}
          visualMode={isNg ? "ng" : "legacy"}
          emptyTitle="No hay jugadores que coincidan con los filtros actuales."
          emptyDescription="Limpiar filtros"
        />
      </div>
      {isNg && embedInspector && inspectedPlayer !== undefined ? (
        <div className="canonical-roster__leftover">
          <RosterRowInspector
            onOpenPlayer={openPlayer}
            player={inspectedPlayer}
            team={team}
            world={world}
          />
          <RosterStaffComments model={buildRosterStaffComments(world, team.id, inspectedPlayer.id)} />
        </div>
      ) : null}
    </section>
  );
}
