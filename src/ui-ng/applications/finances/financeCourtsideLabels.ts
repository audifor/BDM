
/* Only UI labels change. Canonical financial facts, identifiers and trace links stay untouched. */
const names: Record<string, string> = {
  'Converted cash for reporting': 'Caja convertida a moneda de informe',
  'Financial position by original currency': 'Situación por moneda',
  'Performance and planning': 'Resultado y compromisos',
  'Objective distress signals': 'Alertas registradas',
  'Cash accounts': 'Cuentas y saldos',
  'Period cash flow': 'Entradas y salidas',
  'Known liquidity': 'Caja prevista',
  'Receivables': 'Cobros pendientes',
  'Payables': 'Pagos pendientes',
  'Cash movements': 'Movimientos de caja',
  'Settlements': 'Cobros y pagos realizados',
  'Budget · actual · committed · forecast': 'Presupuesto frente a realidad',
  'Revenue sources': 'Origen de ingresos',
  'Recognized revenue': 'Ingresos contabilizados',
  'Revenue budget and forecast': 'Presupuesto de ingresos',
  'Cost sources': 'Origen de gastos',
  'Recognized expenses': 'Gastos contabilizados',
  'Commitments': 'Pagos comprometidos',
  'Cost budget and forecast': 'Presupuesto de gastos',
  'Player and staff commitments by season': 'Salarios previstos por temporada',
  'Contract obligations': 'Vencimientos de contratos',
  'Recognized payroll': 'Nóminas contabilizadas',
  'Debt instruments': 'Préstamos vigentes',
  'Upcoming service': 'Próximos vencimientos',
  'Owner funding and distributions': 'Aportaciones de propietarios',
  'Authorized competition facts': 'Derechos económicos',
  'Entitlements': 'Ingresos por recibir',
  'Recognized competition economics': 'Balance económico de competiciones',
  'Recorded assessments': 'Controles financieros',
  'Forecast lines': 'Previsión por conceptos',
  'Projected 30-day liquidity': 'Caja prevista a 30 días',
  'Valuation components': 'Cálculo del valor',
  'Recorded recommendations': 'Recomendaciones registradas',
}
const columns: Record<string, string> = {
  'Currency': 'Moneda', 'Account': 'Cuenta', 'Restriction': 'Disponibilidad',
  'Balance': 'Saldo', 'Opening': 'Inicio', 'Inflows': 'Entradas',
  'Outflows': 'Salidas', 'Closing': 'Final', 'Horizon': 'Plazo',
  'Receivables': 'Por cobrar', 'Payables': 'Por pagar',
  'Projected closing': 'Caja estimada', 'Due': 'Vencimiento',
  'Remaining': 'Pendiente', 'Status': 'Estado', 'Date': 'Fecha',
  'Direction': 'Tipo', 'Amount': 'Importe', 'Transaction': 'Movimiento',
  'Kind': 'Concepto', 'Obligation': 'Obligación', 'Category': 'Categoría',
  'Budget': 'Presupuesto', 'Actual': 'Contabilizado', 'Committed': 'Comprometido',
  'Forecast': 'Previsto', 'Projected variance': 'Desviación prevista',
  'Source': 'Origen', 'Known amount': 'Importe registrado', 'Period': 'Periodo',
  'Collected': 'Cobrado', 'Uncollected': 'Sin cobrar', 'Paid': 'Pagado',
  'Unpaid': 'Sin pagar', 'Nature': 'Tipo de coste', 'Season': 'Temporada',
  'Guarantee': 'Garantía', 'Lender': 'Prestamista', 'Type': 'Tipo',
  'Original': 'Inicial', 'Outstanding': 'Pendiente', 'Maturity': 'Vencimiento',
  'Instrument': 'Préstamo', 'Competition': 'Competición', 'Rule / version': 'Norma',
  'Metric': 'Indicador', 'Measured': 'Medido', 'Threshold': 'Límite',
  'State': 'Estado', 'Consequence': 'Consecuencia',
  'Assumption': 'Hipótesis', 'Cash now': 'Caja actual',
  'Debt service': 'Pagos de deuda', 'Explicit assumptions': 'Supuestos',
  'Projected': 'Proyectado', 'Original currency': 'Moneda original',
  'Converted reporting value': 'Valor convertido', 'FX rate': 'Cambio',
  'Action': 'Propuesta', 'Evidence': 'Datos', 'Expected impact': 'Impacto previsto',
  'Risks': 'Riesgos', 'Authority': 'Autorización', 'Actor': 'Responsable',
  'Net recognized': 'Resultado contabilizado', 'Recognized revenue': 'Ingresos contabilizados',
  'Recognized fees': 'Cuotas contabilizadas', 'Cash': 'Caja', 'Unrestricted': 'Disponible',
  'Receivables due': 'Por cobrar', 'Payables due': 'Por pagar', 'Projected cash': 'Caja prevista',
  'Operating result': 'Resultado', 'Debt': 'Deuda',
  'Recognized expense': 'Gastos contabilizados', 'Budget variance': 'Desviación',
  'Commitments': 'Compromisos', 'Forecast result': 'Resultado previsto',
  'Debt service burden': 'Vencimientos de deuda',
}
const empty: Record<string, string> = {
  'No recorded cash movements in this period.': 'Aún no hay movimientos de caja en este periodo.',
  'No dated cash obligations available.': 'Sin cobros ni pagos fechados para proyectar.',
  'No cash accounts recorded.': 'No hay cuentas de caja registradas.',
  'No approved budget lines.': 'Todavía no hay presupuesto aprobado.',
  'No active player contracts.': 'Sin contratos de jugadores activos.',
  'No salary exceptions.': 'Sin excepciones salariales.',
  'No recorded recommendations.': 'No hay recomendaciones registradas.',
  'No recorded assessments.': 'Sin controles financieros registrados.',
}

export function financeTableLabel(label: string): string { return names[label] ?? label }
export function financeColumnLabel(label: string): string { return columns[label] ?? label }
export function financeEmptyLabel(label: string): string { return empty[label] ?? label }
export function financeValueLabel(value: string, column: string): string {
  if (column === 'Direction') return ({ INCOME: 'Ingreso', EXPENSE: 'Gasto', INFLOW: 'Entrada', OUTFLOW: 'Salida' } as Record<string, string>)[value] ?? value
  if (column === 'Guarantee') return ({ GUARANTEED: 'Garantizado', CONDITIONAL: 'Condicional', NON_GUARANTEED: 'No garantizado' } as Record<string, string>)[value] ?? value
  if (column === 'Status' || column === 'State') return ({ PAID: 'Pagado', OPEN: 'Pendiente', OVERDUE: 'Vencido', RECOMMENDED: 'Propuesto', APPROVED: 'Aprobado', REJECTED: 'Rechazado', ACTIVE: 'Activo' } as Record<string, string>)[value] ?? value
  return value
}
