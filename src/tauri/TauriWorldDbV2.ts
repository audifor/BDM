import { invoke } from '@tauri-apps/api/core';
export interface WorldDbV2Entity {
    readonly entity_id: string;
    readonly parent_id: string | null;
    readonly source_table: string;
    readonly reference_data: Record<string, any>;
}
export interface WorldDbV2Pilot {
    readonly competitionId: string;
    readonly name: string;
    readonly minimumOriginalRoster: number;
    readonly masterSha256: string;
    readonly teams: readonly {
        key: string;
        name: string;
        code: string;
    }[];
}
export interface WorldDbV2Snapshot {
    readonly freeStaff?: readonly WorldDbV2Entity[];
    readonly freeAgents?: readonly WorldDbV2Entity[];
    readonly freeAgentSelection?: { readonly eligibleOriginals: number; readonly selected: number; readonly policy: string };
    readonly physicalContent?: import('@/domain/worldDb/GameBootstrap').WorldDbPhysicalContentV1;
    readonly manifest: {
        master: {
            sha256: string;
        };
        configuration: {
            start_date: string;
            seed: string;
        };
    };
    readonly countries: readonly WorldDbV2Entity[];
    readonly clubs: readonly WorldDbV2Entity[];
    readonly people: readonly WorldDbV2Entity[];
    readonly competitions: readonly WorldDbV2Entity[];
}
export const discoverWorldDbV2 = (sourceRoot: string, competitionId?: string) => invoke<WorldDbV2Pilot>('world_db_v2', { request: { method: 'discover', sourceRoot, competitionId } });
export const buildWorldDbV2 = (sourceRoot: string, startDate: string, seed: string, competitionId?: string) => invoke<WorldDbV2Snapshot>('world_db_v2', { request: { method: 'build', sourceRoot, startDate, seed, competitionId } });
