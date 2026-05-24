// ============================================================
// CashFlow Planner — Core Type Definitions
// ============================================================

export type LineItemType = 'income' | 'expense'
export type ConfirmationStatus = 'confirmed' | 'projected'
export type ViewScale = 'month' | 'quarter' | 'halfYear' | 'year'
export type CumulativeChartMode = 'sameChart' | 'separateChart' | 'hidden'
export type LiquidityType = 'liquid' | 'tiedUp'
export type BusinessDayRule = 'none' | 'nextBusinessDay' | 'previousBusinessDay'
export type SpecialDayRule = 'firstBusinessDayOfMonth' | 'lastBusinessDayOfMonth' | null
export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'failed'
export type AppPage = 'dashboard' | 'lineItems' | 'accounts' | 'reports' | 'settings'

// ─── File Root ───────────────────────────────────────────────

export interface CashFlowFile {
  schemaVersion: string
  fileMetadata: FileMetadata
  settings: AppSettings
  accounts: Account[]
  assets: Asset[]
  lineItems: LineItem[]
  occurrenceOverrides: OccurrenceOverride[]
  reports: ReportDefinition[]
}

export interface FileMetadata {
  name: string
  createdAt: string   // ISO 8601
  updatedAt: string
  lastOpenedAt?: string
  initialLiquidBalance: number
  currency: string
}

export interface AppSettings {
  autosave: boolean
  defaultViewScale: ViewScale
  defaultCumulativeChartMode: CumulativeChartMode
  currency: string
}

// ─── Accounts & Assets ───────────────────────────────────────

export interface Account {
  id: string
  name: string
  type: string           // e.g. "checking", "savings", "investment"
  balance: number
  currency: string
  liquidity: LiquidityType
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface Asset {
  id: string
  name: string
  accountId: string
  currentValue: number
  currency: string
  liquidity: LiquidityType
  liquidationRule?: LiquidationRule
  fees?: FeeRule[]
  taxPercentage?: number
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface LiquidationRule {
  mode: 'fixedDelay' | 'periodicAvailability' | 'specificDates'
  saleDelayDays?: number
  transferDelayDays?: number
  useBusinessDays?: boolean
  periodicInterval?: number
  periodicUnit?: 'month' | 'quarter' | 'year'
  specificDates?: string[]
}

export interface FeeRule {
  id: string
  mode: 'fixed' | 'percentage'
  amount?: number
  percentage?: number
  label?: string
}

// ─── Line Items ───────────────────────────────────────────────

export interface LineItem {
  id: string
  type: LineItemType
  name: string
  category: string
  amountRule: AmountRule
  recurrenceRule: RecurrenceRule
  confirmationStatus: ConfirmationStatus
  isOptional: boolean
  optionalRule?: ConditionalRule
  seriesComment?: string
  parentSeriesId?: string   // Set when this series was created by splitting another
  splitFromDate?: string    // Effective date this series started after a split
  createdAt: string
  updatedAt: string
}

export interface AmountRule {
  mode: 'fixed' | 'percentageOfLineItem' | 'percentageOfCategory'
  fixedAmount?: number
  percentage?: number
  sourceLineItemId?: string
  sourceCategory?: string
  useProjectedValues: boolean
  useConfirmedValues: boolean
}

export interface RecurrenceRule {
  mode: 'singleDate' | 'specificDates' | 'finiteByCount' | 'finiteUntilDate' | 'infinite'
  startDate?: string           // ISO date YYYY-MM-DD
  singleDate?: string
  specificDates?: string[]
  interval?: number            // e.g. 1 for monthly, 2 for bi-monthly
  unit?: 'day' | 'week' | 'month' | 'year'
  dayOfMonth?: number          // e.g. 15 for the 15th of every month
  businessDayRule?: BusinessDayRule
  specialRule?: SpecialDayRule
  count?: number               // for finiteByCount
  untilDate?: string           // for finiteUntilDate
}

export interface ConditionalRule {
  mode:
    | 'includeIfPeriodSurplusGreaterThan'
    | 'includeIfPeriodSurplusGreaterThanOrEqual'
    | 'includeIfEndingLiquidBalanceGreaterThan'
    | 'includeIfCumulativeSurplusGreaterThan'
  threshold: number
}

// ─── Occurrences ─────────────────────────────────────────────

export interface Occurrence {
  id: string
  lineItemId: string
  date: string               // ISO date YYYY-MM-DD
  amount: number
  type: LineItemType
  category: string
  name: string
  confirmationStatus: ConfirmationStatus
  isOptional: boolean
  isOptionalIncluded?: boolean
  isOverridden: boolean
  traceability: TraceabilityRecord[]
}

export interface OccurrenceOverride {
  id: string
  lineItemId: string
  occurrenceDate: string     // ISO date YYYY-MM-DD
  amountOverride?: number
  confirmationStatusOverride?: ConfirmationStatus
  comment?: string
  updatedAt: string
}

export interface TraceabilityRecord {
  sourceType: 'lineItem' | 'occurrence' | 'override' | 'linkedFormula' | 'optionalRule'
  sourceId: string
  description: string
}

// ─── Period Aggregation ───────────────────────────────────────

export interface PeriodSummary {
  periodKey: string          // e.g. "2025-01", "2025-Q1", "2025-H1", "2025"
  periodLabel: string        // Human-readable: "Jan 2025", "Q1 2025", etc.
  periodStart: string        // ISO date
  periodEnd: string          // ISO date
  cashFlowIn: number
  cashFlowOut: number
  netSurplusDeficit: number
  cumulativeSurplusDeficit: number
  beginningLiquidBalance: number
  endingLiquidBalance: number
  occurrences: Occurrence[]
  hasProjected: boolean
  hasConfirmed: boolean
  optionalExpensesIncluded: Occurrence[]
  optionalExpensesExcluded: Occurrence[]
}

export interface CalculationResult {
  scale: ViewScale
  dateRange: { start: string; end: string }
  periods: PeriodSummary[]
  pastProjectedIncomeReview: PastProjectedItem[]
  warnings: CashFlowWarning[]
  initialLiquidBalance: number
}

export interface PastProjectedItem {
  occurrence: Occurrence
  lineItem: LineItem
  daysOverdue: number
  existingOverride?: OccurrenceOverride
}

export interface CashFlowWarning {
  type: 'negativeCumulative' | 'negativeBalance' | 'largeFutureObligation'
  periodKey: string
  periodLabel: string
  amount: number
  description: string
}

// ─── Reports ──────────────────────────────────────────────────

export interface ReportDefinition {
  id: string
  name: string
  type: 'monthly' | 'quarterly' | 'halfYearly' | 'yearly'
  startPeriod: string        // ISO date or period key
  endPeriod?: string
  numberOfPeriods?: number
  createdAt: string
}

export interface ReportOutput {
  definition: ReportDefinition
  generatedAt: string
  periods: PeriodSummary[]
  lineItemTotals: LineItemTotal[]
  categoryTotals: CategoryTotal[]
  totalCashFlowIn: number
  totalCashFlowOut: number
  totalSurplusDeficit: number
  finalCumulativeSurplusDeficit: number
  beginningLiquidBalance: number
  endingLiquidBalance: number
}

export interface LineItemTotal {
  lineItemId: string
  name: string
  type: LineItemType
  category: string
  total: number
  periodTotals: Record<string, number>
}

export interface CategoryTotal {
  category: string
  type: LineItemType
  total: number
  periodTotals: Record<string, number>
}

// ─── App State (not persisted) ────────────────────────────────

export interface AppState {
  currentFile: CashFlowFile | null
  currentFilePath: string | null
  hasUnsavedChanges: boolean
  saveStatus: SaveStatus
  lastSavedAt: Date | null
  currentPage: AppPage
  viewScale: ViewScale
  cumulativeChartMode: CumulativeChartMode
  dashboardDateRange: { start: string; end: string }
  calculationResult: CalculationResult | null
  recentFiles: RecentFile[]
  selectedLineItemId: string | null
  drillDownPeriodKey: string | null
}

export interface RecentFile {
  path: string
  name: string
  lastOpenedAt: string
}

// ─── IPC Bridge (preload API) ─────────────────────────────────

export interface FileAPI {
  newFile: (
    filePath: string,
    initialData: CashFlowFile
  ) => Promise<{ success: boolean; error?: string }>
  openFile: (
    filePath?: string
  ) => Promise<{ success: boolean; data?: CashFlowFile; filePath?: string; error?: string }>
  saveFile: (
    filePath: string,
    data: CashFlowFile
  ) => Promise<{ success: boolean; error?: string }>
  showSaveDialog: (
    defaultName: string
  ) => Promise<{ canceled: boolean; filePath?: string }>
  showOpenDialog: () => Promise<{ canceled: boolean; filePath?: string }>
  getRecentFiles: () => Promise<RecentFile[]>
  setRecentFile: (file: RecentFile) => Promise<void>
  onMenuNew: (callback: () => void) => () => void
  onMenuOpen: (callback: () => void) => () => void
  onMenuSave: (callback: () => void) => () => void
  onBeforeClose: (callback: () => Promise<boolean>) => () => void
  exportCSV: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>
  exportJSON: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>
}

// ─── Validation ───────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}
