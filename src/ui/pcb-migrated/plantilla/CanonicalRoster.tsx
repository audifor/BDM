import { useMemo, useRef, useState } from "react";

import type { Player } from "@/domain/player";
import { getPlayerAge } from "@/domain/player";
import {
  getCareerFatigueForPlayer,
  getCurrentPlayerContract,
  getTeamRoster,
} from "@/domain/world";
import type { GameWorld } from "@/domain/world";
import type { TeamId } from "@/domain/ids";
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

export function CanonicalRoster({
  activeView = "general",
  onOpenEntity,
  onViewChange,
  team,
  world,
}: {
  readonly activeView?: string;
  readonly onOpenEntity?: (destination: EntityDestination) => void;
  readonly onViewChange?: (view: string) => void;
  readonly team: { readonly id: TeamId; readonly name: string };
  readonly world: GameWorld;
}) {
  const [query, setQuery] = useState("");
  const [rotation, setRotation] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string>();
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
        value: (player) => rotation[player.id] ?? "B2",
        render: (player) => (
          <select
            aria-label={`Rotación ${player.firstName} ${player.lastName}`}
            className="canonical-roster__rotation"
            onChange={(event) =>
              setRotation((current) => ({
                ...current,
                [player.id]: event.target.value,
              }))
            }
            value={rotation[player.id] ?? "B2"}
          >
            {[
              "PG",
              "SG",
              "SF",
              "PF",
              "C",
              "B1",
              "B2",
              "B3",
              "B4",
              "B5",
              "B6",
              "B7",
            ].map((slot) => (
              <option key={slot}>{slot}</option>
            ))}
          </select>
        ),
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
    ],
    [rotation, world],
  );
  const views: readonly DataGridView[] = [
    {
      id: "general",
      name: "Resumen General",
      columnIds: columns.map((column) => column.id),
    },
    {
      id: "psico",
      name: "Psico",
      columnIds: ["status", "player", "position", "rotation", "age"],
    },
    {
      id: "physical",
      name: "Físico",
      columnIds: [
        "status",
        "player",
        "position",
        "rotation",
        "age",
        "height",
        "weight",
      ],
    },
  ];
  const selectedView =
    views.find((view) => view.id === activeView) ?? views[0]!;
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
