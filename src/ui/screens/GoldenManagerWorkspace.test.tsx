import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { createDefaultTacticalPlan } from '@/engine/match'
import { GoldenManagerWorkspace, type GoldenManagerSection } from './GoldenManagerWorkspace'
const render=(section:GoldenManagerSection)=>renderToStaticMarkup(createElement(GoldenManagerWorkspace,{initialSection:section,onTacticsChange:()=>undefined,onTacticsReset:()=>undefined,onTrainingFocus:()=>undefined,onTrainingIntensity:()=>undefined,tacticalPlan:createDefaultTacticalPlan(),world:createNewGame()}))
describe('GoldenManagerWorkspace',()=>{it('uses the full app client area, without PCB global navigation',()=>{const markup=render('squad');expect(markup).toContain('Plantilla');for(const label of ['Hub','Scouting','Mercado'])expect(markup).not.toContain(label)});it('retains every internal Golden Master tab set',()=>{for(const [section,labels] of [['training',['Equipo','Individual','Carga','Staff','Módulos']],['tactics',['Pizarra','Diseñador','Emparejamientos','Rotaciones','Jugadas','Partido']],['competition',['Calendario','Próximos','Clasificación','Resultados','Estadísticas','Copas']],['club',['Visión General','Instalaciones','Staff &amp; Roles','Junta Directiva','Finanzas','Analítica','Historia']],['medical',['Resumen','Lesionados','Historial','Instalaciones','Staff','Prevención']]] as const){const markup=render(section);for(const label of labels)expect(markup).toContain(label)}})})
