// ============================================================
// CashFlow Planner — Core Type Definitions
// ============================================================

export type LineItemType = 'income' | 'expense'
export type ConfirmationStatus = 'confirmed' | 'projected'
export type ViewScale = 'day' | 'week' | 'month' | 'quarter' | 'halfYear' | 'year'
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
  /** @deprecated Assets are now embedded in Account.assets. Kept for migration only. */
  assets?: LegacyAsset[]
  accountBalanceUpdates: AccountBalanceUpdate[]
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

// ─── Accounts ─────────────────────────────────────────────────
// Assets are now sub-items embedded within each Account.

export interface AccountAsset {
  id: string
  name: string
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

export interface Account {
  id: string
  name: string
  type: string            // e.g. "checking", "savings", "retirement"
  balance: number         // initial setup balance — not overwritten after creation
  currency: string
  liquidity: LiquidityType
  /** Account-level liquidation rule (e.g. early withdrawal penalty for CDs) */
  liquidationRule?: LiquidationRule
  /** Account-level fees (e.g. account maintenance fee) */
  fees?: FeeRule[]
  taxPercentage?: number
  notes?: string
  /** Sub-assets held within this account, each with their own liquidation rules */
  assets?: AccountAsset[]
  createdAt: string
  updatedAt: string
}

/** Kept only for migrating old .cashflow.json files that still have a top-level assets array */
export interface LegacyAsset {
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

// ─── Account Balance Updates ──────────────────────────────────

export type ReconciliationReason =
  | 'manualAdjustment'
  | 'untrackedIncome'
  | 'untrackedExpense'
  | 'transferCorrection'
  | 'balanceCorrection'
  | 'other'

export interface AccountBalanceUpdate {
  id: string
  accountId: string
  effectiveAt: string        // ISO 8601 datetime (includes time)
  balance: number
  liquidity: LiquidityType
  /** True for the auto-generated record created when the account is first added */
  isInitialSetup?: boolean
  /** True for auto-generated records created by a transfer */
  isTransfer?: boolean
  /** ID of the paired transfer update on the other account */
  transferPairId?: string
  comment?: string
  reconciliationReason?: ReconciliationReason
  createdAt: string
  updatedAt: string
}

export interface BalanceTraceRecord {
  accountId: string
  accountName: string
  balance: number
  liquidity: LiquidityType
  sourceUpdateId?: string
  effectiveAt?: string
  fallbackToSetup: boolean
}

export interface ReconciliationVariance {
  updateId: string
  accountId: string
  accountName: string
  effectiveAt: string
  actualBalance: number
  expectedBalance: number
  variance: number
  reconciliationReason?: ReconciliationReason
  comment?: string
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
  parentSeriesId?: string
  splitFromDate?: string
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
  startDate?: string
  singleDate?: string
  specificDates?: string[]
  interval?: number
  unit?: 'day' | 'week' | 'month' | 'year'
  dayOfMonth?: number
  businessDayRule?: BusinessDayRule
  specialRule?: SpecialDayRule
  count?: number
  untilDate?: string
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
  date: string
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
  occurrenceDate: string
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
  periodKey: string
  periodLabel: string
  periodStart: string
  periodEnd: string
  cashFlowIn: number
  cashFlowOut: number
  netSurplusDeficit: number
  cumulativeSurplusDeficit: number
  beginningLiquidBalance: number
  endingLiquidBalance: number
  beginningIlliquidBalance: number
  occurrences: Occurrence[]
  hasProjected: boolean
  hasConfirmed: boolean
  optionalExpensesIncluded: Occurrence[]
  optionalExpensesExcluded: Occurrence[]
  beginningBalanceTrace: BalanceTraceRecord[]
  /** True when beginningLiquidBalance was anchored to a user-defined AccountBalanceUpdate (sync point) */
  isSyncPoint?: boolean
}

export interface CalculationResult {
  scale: ViewScale
  dateRange: { start: string; end: string }
  periods: PeriodSummary[]
  pastProjectedIncomeReview: PastProjectedItem[]
  warnings: CashFlowWarning[]
  initialLiquidBalance: number
  reconciliationVariances: ReconciliationVariance[]
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

// ─── Notifications ────────────────────────────────────────────

export interface AppNotification {
  /** Stable ID derived from warning type + periodKey, or 'pastProjected' */
  id: string
  type: CashFlowWarning['type'] | 'pastProjected'
  title: string
  description: string
}

// ─── Reports ──────────────────────────────────────────────────

export interface ReportDefinition {
  id: string
  name: string
  type: 'monthly' | 'quarterly' | 'halfYearly' | 'yearly'
  startPeriod: string
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
  /** IDs of notifications the user has dismissed this session */
  dismissedNotificationIds: string[]
}

export interface RecentFile {
  path: string
  name: string
  lastOpenedAt: string
}

// ─── IPC Bridge (preload API) ─────────────────────────────────

export interface FileAPI {
  newFile: (filePath: string, initialData: CashFlowFile) => Promise<{ success: boolean; error?: string }>
  openFile: (filePath?: string) => Promise<{ success: boolean; data?: CashFlowFile; filePath?: string; error?: string }>
  saveFile: (filePath: string, data: CashFlowFile) => Promise<{ success: boolean; error?: string }>
  showSaveDialog: (defaultName: string) => Promise<{ canceled: boolean; filePath?: string }>
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
