import { useMemo, useRef, useState } from "react";

import type { CanonicalRatingKey, Player } from "@/domain/player";
import { getPlayerAge } from "@/domain/player";
import {
  getCareerFatigueForPlayer,
  getCurrentPlayerContract,
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

export function CanonicalRoster({
  activeView = "general",
  onLineupSlotChange,
  onLineupSlotClear,
  onOpenEntity,
  onViewChange,
  rosterSection = "overview",
  team,
  world,
}: {
  readonly activeView?: string;
  readonly onLineupSlotChange?: (slot: LineupSlot, playerId: PlayerId) => void;
  readonly onLineupSlotClear?: (slot: LineupSlot) => void;
  readonly onOpenEntity?: (destination: EntityDestination) => void;
  readonly onViewChange?: (view: string) => void;
  readonly rosterSection?: string;
  readonly team: { readonly id: TeamId; readonly name: string };
  readonly world: GameWorld;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const [ratingView, setRatingView] = useState(activeView);
  const lineup = useMemo(() => getTeamLineup(world, team.id), [world, team.id]);
  const gridRef = useRef<HTMLDivElement>(null);
  const roster = useMemo(() => getTeamRoster(world, team.id), [world, team.id]);
  const rows = useMemo(
    () =>
      roster.filter((player) =>
        `${player.firstName} ${player.lastName}`
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase()),
      ),
    [roster, query],
  );
  const openPlayer = (player: Player) =>
    onOpenEntity?.({
      type: "player",
      playerId: player.id,
      section: "overview",
    });
  const columns = useMemo<readonly DataGridColumn<Player>[]>(
    () => [
      {
        id: "status",
        label: "EST",
        defaultWidth: 62,
        minWidth: 54,
        sortable: true,
        value: () => "OK",
        render: () => <span className="canonical-roster__status">OK</span>,
      },
      {
        id: "player",
        label: "JUGADOR",
        defaultWidth: 270,
        minWidth: 180,
        required: true,
        searchable: true,
        sortable: true,
        value: (player) => `${player.lastName} ${player.firstName}`,
        render: (player) => (
          <button
            className="canonical-roster__player-link"
            onClick={() => openPlayer(player)}
            type="button"
          >
            {player.firstName} {player.lastName}
          </button>
        ),
      },
      {
        id: "position",
        label: "POS",
        defaultWidth: 78,
        minWidth: 64,
        sortable: true,
        value: (player) => player.basketball.primaryPosition,
        render: (player) => (
          <span className="canonical-roster__position">
            {player.basketball.primaryPosition}
          </span>
        ),
      },
      {
        id: "rotation",
        label: "ROT",
        defaultWidth: 120,
        minWidth: 100,
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
        defaultWidth: 72,
        minWidth: 58,
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
        defaultWidth: 100,
        minWidth: 76,
        numeric: true,
        sortable: true,
        value: (player) => getCareerFatigueForPlayer(world, player.id),
        render: (player) => getCareerFatigueForPlayer(world, player.id),
      },
      {
        id: "salary",
        label: "CONTRATO",
        defaultWidth: 138,
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
      ...OFFENSE_RATING_KEYS.map(ratingColumn),
      ...BRAIN_RATING_KEYS.map(ratingColumn),
      ...DEFENSE_RATING_KEYS.map(ratingColumn),
      ...PHYSICAL_RATING_KEYS.map(ratingColumn),
      ...BALL_HANDLING_RATING_KEYS.map(ratingColumn),
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
    ],
    [lineup, onLineupSlotChange, onLineupSlotClear, world],
  );
  const offenseColumnIds = OFFENSE_RATING_KEYS.map((key) => `rating-${key}`);
  const brainColumnIds = BRAIN_RATING_KEYS.map((key) => `rating-${key}`);
  const defenseColumnIds = DEFENSE_RATING_KEYS.map((key) => `rating-${key}`);
  const physicalColumnIds = PHYSICAL_RATING_KEYS.map((key) => `rating-${key}`);
  const ballHandlingColumnIds = BALL_HANDLING_RATING_KEYS.map((key) => `rating-${key}`);
  const personalityColumnIds = PERSONALITY_DIMENSIONS.map((dimension) => `personality-${dimension}`);
  const baseColumnIds = ["status", "player", "position", "rotation", "age"];
  const views: readonly DataGridView[] = [
    {
      id: "general",
      name: "Resumen General",
      columnIds: columns.map((column) => column.id),
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
  return (
    <section className="canonical-roster">
      <header className="canonical-roster__toolbar">
        <div className="canonical-roster__identity">
          <span className="canonical-roster__icon">
            <BdmIcon name="roster" size={28} />
          </span>
          <div>
            <strong>Plantilla ({roster.length})</strong>
            <small>{team.name}</small>
          </div>
        </div>
        <div className="canonical-roster__actions">
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
          <label className="canonical-roster__view-select">
            <span>Preset</span>
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
          <input
            aria-label="Buscar jugador"
            onChange={(event) => setQuery(event.target.value)}
            value={query}
          />
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
          onSelectionChange={(ids) => setSelectedId(ids[0])}
          presentation="fm"
          rows={rows}
          selectedId={selectedId}
          views={[selectedView]}
        />
      </div>
    </section>
  );
}
