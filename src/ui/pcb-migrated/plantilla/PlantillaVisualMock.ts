/** Temporary UI-only visual scaffold for the PCB Plantilla migration. */
export type PlantillaVisualRow = {
  readonly id: string
  readonly status: string
  readonly name: string
  readonly values: readonly number[]
}

export const PSYCHOLOGY_COLUMNS = ['CLUTCH', 'CONSISTENCIA', 'ÉTICA DE TRABAJO', 'DUREZA MENTAL', 'AGRESIVIDAD', 'LIDERAZGO VOCAL', 'QUÍMICA VESTUARIO', 'ADAPTABILIDAD', 'PROFESIONALIDAD', 'TEMPERAMENTO', 'AMBICIÓN', 'LEALTAD', 'AVARICIA', 'RESIST. PRESIÓN', 'EXTROVERSIÓN'] as const

const names = ['Sergio De Larrea', 'Lucas Langarita', 'Santi Yusta', 'Jahlil Okafor', 'Trae Bell-Haynes', 'Dylan Ennis', 'Jaime Fernández', 'Mads Bonde Stürup', 'Emir Sulejmanović', 'Miguel González', 'Youssouf Traoré', 'Andrés A. Pérez'] as const

export const PLANTILLA_VISUAL_MOCK_ROWS: readonly PlantillaVisualRow[] = names.map((name, index) => ({
  id: `plantilla-visual-${index + 1}`,
  status: 'OK',
  name,
  values: PSYCHOLOGY_COLUMNS.map((_, valueIndex) => 42 + ((index * 13 + valueIndex * 7) % 54)),
}))
