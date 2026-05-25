// ============================================================
// CashFlow Planner — Calculation Engine
//
// Calculation sequence:
//  1. Generate income/expense occurrences from recurrence rules
//  2. Apply occurrence overrides
//  3. Resolve linked amounts (with cycle detection)
//  4. Aggregate occurrences by period
//  5. Calculate required period surplus/deficit
//  6. Calculate preliminary cumulative surplus/deficit
//  7. Evaluate optional expenses
//  8. Recalculate final surplus/deficit and cumulative
//  9. Calculate liquid balances
// 10. Flag past projected income for review
// 11. Generate warnings (negative cumulative, large obligations)
// ============================================================

import {
  parseISO,
  isAfter,
  isBefore,
  isEqual,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  addDays,
  addWeeks,
  addMonths,
  addQuarters,
  addYears,
  format,
  differenceInDays,
  isSameMonth,
  getMonth,
  getYear,
  getQuarter,
  getISOWeek
} from 'date-fns'
import { v4 as uuidv4 } from 'uuid'

import {
  generateOccurrenceDates,
  toISODate,
  fromISODate
} from './recurrence'

import type {
  CashFlowFile,
  LineItem,
  LineItemType,
  Occurrence,
  OccurrenceOverride,
  PeriodSummary,
  CalculationResult,
  ViewScale,
  CashFlowWarning,
  PastProjectedItem,
  AmountRule,
  ConditionalRule,
  TraceabilityRecord,
  AccountBalanceUpdate,
  BalanceTraceRecord,
  ReconciliationVariance,
  LiquidityType
} from '../types'

// ─── Public API ───────────────────────────────────────────────

export interface CalculationOptions {
  scale: ViewScale
  dateRange: { start: string; end: string }
}

/**
 * Main entry point. Calculates the full cash-flow model for the
 * given file and date range, returning period summaries, warnings,
 * and past-projected review items.
 */
export function calculateCashFlow(
  file: CashFlowFile,
  options: CalculationOptions
): CalculationResult {
  const rangeStart = fromISODate(options.dateRange.start)
  const rangeEnd = fromISODate(options.dateRange.end)
  const initialBalance = file.fileMetadata.initialLiquidBalance ?? 0

  // Prepare balance update records sorted by effectiveAt ascending
  const balanceUpdates = (file.accountBalanceUpdates ?? [])
    .slice()
    .sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt))

  // Map of accountId -> { name, setupBalance, liquidity }
  const allAccounts = buildAccountMap(file)

  // 1. Generate all raw occurrences
  const rawOccurrences = generateAllOccurrences(file.lineItems, rangeStart, rangeEnd)

  // 2. Apply overrides (amount, confirmation status, comments)
  const occurrences = applyOverrides(rawOccurrences, file.occurrenceOverrides)

  // 3. Resolve linked amounts (topological sort, cycle detection)
  const resolvedOccurrences = resolveLinkedAmounts(occurrences, file.lineItems)

  // 4. Separate required vs optional
  const required = resolvedOccurrences.filter(o => !o.isOptional)
  const optional = resolvedOccurrences.filter(o => o.isOptional)

  // 5–9. Build period summaries with two-pass optional evaluation and balance history
  const periods = buildPeriods(options.scale, rangeStart, rangeEnd)
  const summaries = computePeriodSummaries(
    periods,
    required,
    optional,
    file.lineItems,
    initialBalance,
    balanceUpdates,
    allAccounts,
    rangeStart
  )

  // 10. Flag past projected income
  const today = startOfDay(new Date())
  const pastProjectedIncomeReview = findPastProjectedIncome(
    resolvedOccurrences,
    file.lineItems,
    file.occurrenceOverrides,
    today
  )

  // 11. Build warnings
  const warnings = buildWarnings(summaries)

  // 12. Reconciliation variances
  const reconciliationVariances = computeReconciliationVariances(
    balanceUpdates,
    allAccounts,
    summaries,
    initialBalance
  )

  return {
    scale: options.scale,
    dateRange: options.dateRange,
    periods: summaries,
    pastProjectedIncomeReview,
    warnings,
    initialLiquidBalance: initialBalance,
    reconciliationVariances
  }
}

// ─── Step 1: Generate Occurrences ────────────────────────────

function generateAllOccurrences(
  lineItems: LineItem[],
  rangeStart: Date,
  rangeEnd: Date
): Occurrence[] {
  const result: Occurrence[] = []

  for (const item of lineItems) {
    const dates = generateOccurrenceDates(item.recurrenceRule, {
      start: rangeStart,
      end: rangeEnd
    })

    for (const date of dates) {
      const occurrence: Occurrence = {
        id: `${item.id}::${toISODate(date)}`,
        lineItemId: item.id,
        date: toISODate(date),
        amount: item.amountRule.mode === 'fixed'
          ? (item.amountRule.fixedAmount ?? 0)
          : 0, // linked amounts resolved in step 3
        type: item.type,
        category: item.category,
        name: item.name,
        confirmationStatus: item.confirmationStatus,
        isOptional: item.isOptional,
        isOptionalIncluded: !item.isOptional, // required items always "included"
        isOverridden: false,
        traceability: [
          {
            sourceType: 'lineItem',
            sourceId: item.id,
            description: `Generated from recurrence rule (${item.recurrenceRule.mode})`
          }
        ]
      }
      result.push(occurrence)
    }
  }

  return result
}

// ─── Step 2: Apply Overrides ──────────────────────────────────

function applyOverrides(
  occurrences: Occurrence[],
  overrides: OccurrenceOverride[]
): Occurrence[] {
  const overrideMap = new Map<string, OccurrenceOverride>()
  for (const ov of overrides) {
    overrideMap.set(`${ov.lineItemId}::${ov.occurrenceDate}`, ov)
  }

  return occurrences.map(occ => {
    const key = `${occ.lineItemId}::${occ.date}`
    const override = overrideMap.get(key)
    if (!override) return occ

    const updated = { ...occ, isOverridden: true }
    if (override.amountOverride !== undefined) {
      updated.amount = override.amountOverride
    }
    if (override.confirmationStatusOverride) {
      updated.confirmationStatus = override.confirmationStatusOverride
    }
    updated.traceability = [
      ...occ.traceability,
      {
        sourceType: 'override',
        sourceId: override.id,
        description: override.comment
          ? `Override applied: ${override.comment}`
          : 'Override applied'
      }
    ]
    return updated
  })
}

// ─── Step 3: Resolve Linked Amounts ───────────────────────────

/**
 * Resolves percentage-based linked amounts using topological sort.
 * Detects circular references and throws if found.
 */
function resolveLinkedAmounts(
  occurrences: Occurrence[],
  lineItems: LineItem[]
): Occurrence[] {
  const itemMap = new Map<string, LineItem>()
  for (const item of lineItems) {
    itemMap.set(item.id, item)
  }

  // Only process linked items
  const linkedItems = lineItems.filter(
    li => li.amountRule.mode !== 'fixed'
  )
  if (linkedItems.length === 0) return occurrences

  // Topological sort to detect cycles
  const order = topologicalSort(lineItems)

  // Build a map of confirmed income totals by lineItemId
  // (for percentage-of-lineitem calculations)
  const amountByLineItem = new Map<string, number>()

  // First pass: compute fixed amounts
  for (const occ of occurrences) {
    const item = itemMap.get(occ.lineItemId)
    if (!item || item.amountRule.mode === 'fixed') {
      if (occ.amount > 0) {
        amountByLineItem.set(occ.lineItemId, (amountByLineItem.get(occ.lineItemId) ?? 0) + occ.amount)
      }
    }
  }

  // Second pass in topological order: resolve linked amounts
  const resolved = [...occurrences]
  for (const item of order) {
    if (item.amountRule.mode === 'fixed') continue

    for (let i = 0; i < resolved.length; i++) {
      const occ = resolved[i]
      if (occ.lineItemId !== item.id || occ.isOverridden) continue

      const amount = resolveAmountForOccurrence(occ, item.amountRule, amountByLineItem, lineItems)
      resolved[i] = {
        ...occ,
        amount,
        traceability: [
          ...occ.traceability,
          {
            sourceType: 'linkedFormula',
            sourceId: item.amountRule.sourceLineItemId ?? item.amountRule.sourceCategory ?? '',
            description: buildLinkedDescription(item.amountRule, amount)
          }
        ]
      }
      amountByLineItem.set(item.id, (amountByLineItem.get(item.id) ?? 0) + amount)
    }
  }

  return resolved
}

function resolveAmountForOccurrence(
  occ: Occurrence,
  rule: AmountRule,
  amountByLineItem: Map<string, number>,
  lineItems: LineItem[]
): number {
  const pct = (rule.percentage ?? 0) / 100

  if (rule.mode === 'percentageOfLineItem') {
    const sourceTotal = amountByLineItem.get(rule.sourceLineItemId ?? '') ?? 0
    return sourceTotal * pct
  }

  if (rule.mode === 'percentageOfCategory') {
    let categoryTotal = 0
    for (const [id, amount] of amountByLineItem.entries()) {
      const item = lineItems.find(li => li.id === id)
      if (item?.category === rule.sourceCategory) {
        categoryTotal += amount
      }
    }
    return categoryTotal * pct
  }

  return 0
}

function buildLinkedDescription(rule: AmountRule, resolvedAmount: number): string {
  const pct = rule.percentage ?? 0
  if (rule.mode === 'percentageOfLineItem') {
    return `${pct}% of source line item → $${resolvedAmount.toFixed(2)}`
  }
  if (rule.mode === 'percentageOfCategory') {
    return `${pct}% of category "${rule.sourceCategory}" → $${resolvedAmount.toFixed(2)}`
  }
  return `Resolved linked amount: $${resolvedAmount.toFixed(2)}`
}

/**
 * Topological sort of line items by their dependency graph.
 * Throws if a circular reference is detected.
 */
function topologicalSort(lineItems: LineItem[]): LineItem[] {
  const idToItem = new Map<string, LineItem>()
  const deps = new Map<string, string[]>()

  for (const item of lineItems) {
    idToItem.set(item.id, item)
    const dep = item.amountRule.sourceLineItemId
    deps.set(item.id, dep ? [dep] : [])
  }

  const visited = new Set<string>()
  const inStack = new Set<string>()
  const result: LineItem[] = []

  function visit(id: string) {
    if (inStack.has(id)) {
      throw new Error(`Circular reference detected involving line item: ${id}`)
    }
    if (visited.has(id)) return

    inStack.add(id)
    for (const dep of deps.get(id) ?? []) {
      if (idToItem.has(dep)) visit(dep)
    }
    inStack.delete(id)
    visited.add(id)
    const item = idToItem.get(id)
    if (item) result.push(item)
  }

  for (const item of lineItems) {
    visit(item.id)
  }

  return result
}

/**
 * Detects circular references without throwing.
 * Returns an array of item IDs involved in cycles.
 */
export function detectCircularReferences(lineItems: LineItem[]): string[] {
  try {
    topologicalSort(lineItems)
    return []
  } catch (err) {
    // Extract IDs from error message
    const msg = err instanceof Error ? err.message : ''
    const match = msg.match(/line item: (.+)$/)
    return match ? [match[1]] : ['unknown']
  }
}

// ─── Step 4: Build Period Buckets ─────────────────────────────

interface PeriodBucket {
  key: string
  label: string
  start: Date
  end: Date
}

function buildPeriods(
  scale: ViewScale,
  rangeStart: Date,
  rangeEnd: Date
): PeriodBucket[] {
  const periods: PeriodBucket[] = []
  let current = rangeStart

  while (!isAfter(current, rangeEnd)) {
    let bucket: PeriodBucket
    switch (scale) {
      case 'day': {
        const s = startOfDay(current)
        const e = endOfDay(current)
        bucket = {
          key: format(s, 'yyyy-MM-dd'),
          label: format(s, 'MMM d, yyyy'),
          start: s,
          end: e
        }
        current = addDays(s, 1)
        break
      }
      case 'week': {
        const s = startOfWeek(current, { weekStartsOn: 1 }) // Monday start
        const e = endOfWeek(current, { weekStartsOn: 1 })
        const wk = getISOWeek(s)
        bucket = {
          key: `${getYear(s)}-W${String(wk).padStart(2, '0')}`,
          label: `W${wk} ${format(s, 'MMM d')}`,
          start: s,
          end: e
        }
        current = addWeeks(s, 1)
        break
      }
      case 'month': {
        const s = startOfMonth(current)
        const e = endOfMonth(current)
        bucket = {
          key: format(s, 'yyyy-MM'),
          label: format(s, 'MMM yyyy'),
          start: s,
          end: e
        }
        current = addMonths(s, 1)
        break
      }
      case 'quarter': {
        const s = startOfQuarter(current)
        const e = endOfQuarter(current)
        const q = getQuarter(s)
        bucket = {
          key: `${getYear(s)}-Q${q}`,
          label: `Q${q} ${getYear(s)}`,
          start: s,
          end: e
        }
        current = addQuarters(s, 1)
        break
      }
      case 'halfYear': {
        const yr = getYear(current)
        const mo = getMonth(current)
        const isFirstHalf = mo < 6
        const s = isFirstHalf ? new Date(yr, 0, 1) : new Date(yr, 6, 1)
        const e = isFirstHalf ? new Date(yr, 5, 30, 23, 59, 59) : new Date(yr, 11, 31, 23, 59, 59)
        bucket = {
          key: `${yr}-H${isFirstHalf ? 1 : 2}`,
          label: `H${isFirstHalf ? 1 : 2} ${yr}`,
          start: s,
          end: e
        }
        current = isFirstHalf ? new Date(yr, 6, 1) : new Date(yr + 1, 0, 1)
        break
      }
      case 'year': {
        const s = startOfYear(current)
        const e = endOfYear(current)
        bucket = {
          key: `${getYear(s)}`,
          label: `${getYear(s)}`,
          start: s,
          end: e
        }
        current = addYears(s, 1)
        break
      }
    }
    periods.push(bucket)
  }

  return periods
}

// ─── Steps 5–9: Period Summaries with Two-Pass Optional ───────

function computePeriodSummaries(
  periods: PeriodBucket[],
  required: Occurrence[],
  optional: Occurrence[],
  lineItems: LineItem[],
  initialBalance: number,
  balanceUpdates: AccountBalanceUpdate[],
  allAccounts: AccountMap,
  rangeStart: Date
): PeriodSummary[] {
  let cumulativeSurplus = 0
  // Determine the opening liquid balance from account balances.
  // Falls back to fileMetadata.initialLiquidBalance when no accounts are defined.
  let beginningBalance = initialBalance
  let beginningIlliquid = sumSetupIlliquid(allAccounts)
  // lastSyncDate tracks which AccountBalanceUpdate was most recently applied so
  // we only override the running balance when a *new* update arrives (sync point).
  let lastSyncDate: string | null = null

  if (allAccounts.size > 0) {
    const initial = getEffectiveBalances(allAccounts, balanceUpdates, rangeStart)
    beginningBalance = initial.liquid
    beginningIlliquid = initial.illiquid
    lastSyncDate = initial.latestUpdateDate
  }

  const summaries: PeriodSummary[] = []

  for (const period of periods) {
    const periodRequired = occurrencesInPeriod(required, period.start, period.end)
    const periodOptional = occurrencesInPeriod(optional, period.start, period.end)

    // Check for a sync point: a new AccountBalanceUpdate has become applicable
    // since the previous period.  When found, override the running balance with
    // the user-defined total; otherwise carry forward from the previous ending balance.
    const { liquid, illiquid, trace, latestUpdateDate } =
      getEffectiveBalances(allAccounts, balanceUpdates, period.start)

    let isSyncPoint = false
    if (allAccounts.size > 0 && latestUpdateDate !== lastSyncDate) {
      beginningBalance = liquid
      beginningIlliquid = illiquid
      lastSyncDate = latestUpdateDate
      isSyncPoint = true
    }

    // Pass 1: required only
    const reqIn  = sumIncome(periodRequired)
    const reqOut = sumExpenses(periodRequired)
    const preliminarySurplus = reqIn - reqOut
    const preliminaryCumulative = cumulativeSurplus + preliminarySurplus

    // Pass 2: evaluate optional expenses
    const includedOptional: Occurrence[] = []
    const excludedOptional: Occurrence[] = []

    for (const occ of periodOptional) {
      const item = lineItems.find(li => li.id === occ.lineItemId)
      const rule = item?.optionalRule

      if (evaluateConditional(rule, preliminarySurplus, preliminaryCumulative, beginningBalance)) {
        includedOptional.push({ ...occ, isOptionalIncluded: true })
      } else {
        excludedOptional.push({ ...occ, isOptionalIncluded: false })
      }
    }

    // Final calculation including optional expenses that passed condition
    const allIncluded = [...periodRequired, ...includedOptional]
    const cashFlowIn  = sumIncome(allIncluded)
    const cashFlowOut = sumExpenses(allIncluded)
    const netSurplus  = cashFlowIn - cashFlowOut
    const newCumulative = cumulativeSurplus + netSurplus
    const endingBalance = beginningBalance + netSurplus

    summaries.push({
      periodKey: period.key,
      periodLabel: period.label,
      periodStart: toISODate(period.start),
      periodEnd: toISODate(period.end),
      cashFlowIn,
      cashFlowOut,
      netSurplusDeficit: netSurplus,
      cumulativeSurplusDeficit: newCumulative,
      beginningLiquidBalance: beginningBalance,
      endingLiquidBalance: endingBalance,
      beginningIlliquidBalance: beginningIlliquid,
      occurrences: allIncluded,
      hasProjected: allIncluded.some(o => o.confirmationStatus === 'projected'),
      hasConfirmed: allIncluded.some(o => o.confirmationStatus === 'confirmed'),
      optionalExpensesIncluded: includedOptional,
      optionalExpensesExcluded: excludedOptional,
      beginningBalanceTrace: trace,
      isSyncPoint: isSyncPoint || undefined
    })

    cumulativeSurplus = newCumulative
    beginningBalance = endingBalance  // always carry forward to the next period
  }

  return summaries
}

// ─── Account Balance History Helpers ─────────────────────────

interface AccountEntry {
  id: string
  name: string
  setupBalance: number
  liquidity: LiquidityType
  /** True when the account has at least one sub-asset — balance is derived from asset sum */
  hasAssets: boolean
}
type AccountMap = Map<string, AccountEntry>

/** Returns the authoritative balance for an account.
 *  If the account has sub-assets, that is the sum of their currentValue.
 *  Otherwise it is account.balance (the setup balance). */
function accountSetupBalance(a: import('../types').Account): number {
  const assets = a.assets ?? []
  if (assets.length > 0) return assets.reduce((s, asset) => s + asset.currentValue, 0)
  return a.balance
}

function buildAccountMap(file: CashFlowFile): AccountMap {
  const map: AccountMap = new Map()
  for (const a of file.accounts ?? []) {
    map.set(a.id, {
      id: a.id, name: a.name,
      setupBalance: accountSetupBalance(a),
      liquidity: a.liquidity,
      hasAssets: (a.assets ?? []).length > 0
    })
  }
  return map
}

function sumSetupIlliquid(allAccounts: AccountMap): number {
  let total = 0
  for (const a of allAccounts.values()) {
    if (a.liquidity === 'tiedUp') total += a.setupBalance
  }
  return total
}

/**
 * For each account, find the most recent AccountBalanceUpdate whose effectiveAt
 * is <= periodStart.  If none exists, use the account's setup balance.
 * Returns separate liquid and illiquid totals, a trace array, and the latest
 * effectiveAt date seen across all accounts (null when all fell back to setup).
 * The latestUpdateDate is used by computePeriodSummaries to detect sync points.
 */
function getEffectiveBalances(
  allAccounts: AccountMap,
  balanceUpdates: AccountBalanceUpdate[],
  periodStart: Date
): { liquid: number; illiquid: number; trace: BalanceTraceRecord[]; latestUpdateDate: string | null } {
  const periodStartISO = periodStart.toISOString()
  let liquid = 0
  let illiquid = 0
  const trace: BalanceTraceRecord[] = []
  let latestUpdateDate: string | null = null

  for (const account of allAccounts.values()) {
    // For asset-backed accounts the initial auto-created update had balance=0
    // (account was created with no assets yet). Skip it so the asset sum is used instead.
    const applicable = balanceUpdates.filter(
      u => u.accountId === account.id &&
           u.effectiveAt <= periodStartISO &&
           !(account.hasAssets && u.isInitialSetup)
    )

    if (applicable.length > 0) {
      // Latest applicable update
      const latest = applicable[applicable.length - 1]
      if (latest.liquidity === 'liquid') {
        liquid += latest.balance
      } else {
        illiquid += latest.balance
      }
      trace.push({
        accountId: account.id,
        accountName: account.name,
        balance: latest.balance,
        liquidity: latest.liquidity,
        sourceUpdateId: latest.id,
        effectiveAt: latest.effectiveAt,
        fallbackToSetup: false
      })
      if (!latestUpdateDate || latest.effectiveAt > latestUpdateDate) {
        latestUpdateDate = latest.effectiveAt
      }
    } else {
      // Fall back to setup balance
      if (account.liquidity === 'liquid') {
        liquid += account.setupBalance
      } else {
        illiquid += account.setupBalance
      }
      trace.push({
        accountId: account.id,
        accountName: account.name,
        balance: account.setupBalance,
        liquidity: account.liquidity,
        fallbackToSetup: true
      })
    }
  }

  return { liquid, illiquid, trace, latestUpdateDate }
}

/**
 * For each AccountBalanceUpdate, determine what the engine would have
 * predicted for that account at that moment, then compute the variance.
 */
function computeReconciliationVariances(
  balanceUpdates: AccountBalanceUpdate[],
  allAccounts: AccountMap,
  summaries: PeriodSummary[],
  initialBalance: number
): ReconciliationVariance[] {
  const variances: ReconciliationVariance[] = []
  if (balanceUpdates.length === 0) return variances

  for (const update of balanceUpdates) {
    const account = allAccounts.get(update.accountId)
    if (!account) continue

    // Find the period summary that covers this update's effectiveAt date
    const updateDate = update.effectiveAt.slice(0, 10)   // YYYY-MM-DD
    const coveringPeriod = summaries.find(
      s => s.periodStart <= updateDate && s.periodEnd >= updateDate
    )

    // Expected balance = the beginning balance of the period that contains
    // this update.  (Simple heuristic: a more precise implementation would
    // interpolate within-period cash flow, but beginning-of-period balance
    // is the right anchor per the spec.)
    const expectedLiquid = coveringPeriod
      ? coveringPeriod.beginningLiquidBalance
      : initialBalance

    // We compare per-account: distribute the total expected liquid balance
    // proportionally by setup balance.  This is an approximation — a future
    // per-account ledger would give exact values.
    const totalSetupLiquid = Array.from(allAccounts.values())
      .filter(a => a.liquidity === 'liquid')
      .reduce((s, a) => s + a.setupBalance, 0)

    const accountShare = totalSetupLiquid > 0
      ? account.setupBalance / totalSetupLiquid
      : 0

    const expectedForAccount = account.liquidity === 'liquid'
      ? expectedLiquid * accountShare
      : 0   // illiquid accounts: engine doesn't move their balance through cash-flow

    const variance = update.balance - expectedForAccount

    if (Math.abs(variance) > 0.01) {
      variances.push({
        updateId: update.id,
        accountId: update.accountId,
        accountName: account.name,
        effectiveAt: update.effectiveAt,
        actualBalance: update.balance,
        expectedBalance: Math.round(expectedForAccount * 100) / 100,
        variance: Math.round(variance * 100) / 100,
        reconciliationReason: update.reconciliationReason,
        comment: update.comment
      })
    }
  }

  return variances
}

function occurrencesInPeriod(occs: Occurrence[], start: Date, end: Date): Occurrence[] {
  return occs.filter(o => {
    const d = fromISODate(o.date)
    return (isEqual(d, start) || isAfter(d, start)) &&
           (isEqual(d, end) || isBefore(d, end))
  })
}

function sumIncome(occs: Occurrence[]): number {
  return occs.filter(o => o.type === 'income').reduce((s, o) => s + o.amount, 0)
}

function sumExpenses(occs: Occurrence[]): number {
  return occs.filter(o => o.type === 'expense').reduce((s, o) => s + o.amount, 0)
}

function evaluateConditional(
  rule: ConditionalRule | undefined,
  periodSurplus: number,
  cumulativeSurplus: number,
  beginningBalance: number
): boolean {
  if (!rule) return true // No rule = always include

  switch (rule.mode) {
    case 'includeIfPeriodSurplusGreaterThan':
      return periodSurplus > rule.threshold
    case 'includeIfPeriodSurplusGreaterThanOrEqual':
      return periodSurplus >= rule.threshold
    case 'includeIfEndingLiquidBalanceGreaterThan':
      return (beginningBalance + periodSurplus) > rule.threshold
    case 'includeIfCumulativeSurplusGreaterThan':
      return cumulativeSurplus > rule.threshold
    default:
      return true
  }
}

// ─── Step 10: Past Projected Income Review ────────────────────

function findPastProjectedIncome(
  occurrences: Occurrence[],
  lineItems: LineItem[],
  overrides: OccurrenceOverride[],
  today: Date
): PastProjectedItem[] {
  const overrideMap = new Map<string, OccurrenceOverride>()
  for (const ov of overrides) {
    overrideMap.set(`${ov.lineItemId}::${ov.occurrenceDate}`, ov)
  }

  const result: PastProjectedItem[] = []

  for (const occ of occurrences) {
    if (occ.type !== 'income') continue
    if (occ.confirmationStatus !== 'projected') continue

    const occDate = fromISODate(occ.date)
    if (!isBefore(occDate, today)) continue // Only past occurrences

    const lineItem = lineItems.find(li => li.id === occ.lineItemId)
    if (!lineItem) continue

    const existing = overrideMap.get(`${occ.lineItemId}::${occ.date}`)

    result.push({
      occurrence: occ,
      lineItem,
      daysOverdue: differenceInDays(today, occDate),
      existingOverride: existing
    })
  }

  return result.sort((a, b) => a.occurrence.date.localeCompare(b.occurrence.date))
}

// ─── Step 11: Build Warnings ──────────────────────────────────

function buildWarnings(summaries: PeriodSummary[]): CashFlowWarning[] {
  const warnings: CashFlowWarning[] = []
  const today = toISODate(startOfDay(new Date()))
  let foundFirstNegativeCumulative = false
  let foundFirstNegativeBalance = false

  for (const period of summaries) {
    if (period.periodEnd < today) continue

    if (!foundFirstNegativeCumulative && period.cumulativeSurplusDeficit < 0) {
      foundFirstNegativeCumulative = true
      warnings.push({
        type: 'negativeCumulative',
        periodKey: period.periodKey,
        periodLabel: period.periodLabel,
        amount: period.cumulativeSurplusDeficit,
        description: `Cumulative surplus first goes negative (${formatCurrency(period.cumulativeSurplusDeficit)}) in ${period.periodLabel}`
      })
    }

    if (!foundFirstNegativeBalance && period.endingLiquidBalance < 0) {
      foundFirstNegativeBalance = true
      warnings.push({
        type: 'negativeBalance',
        periodKey: period.periodKey,
        periodLabel: period.periodLabel,
        amount: period.endingLiquidBalance,
        description: `Projected liquid balance first goes negative in ${period.periodLabel}`
      })
    }
  }

  // Largest future obligation
  const futureExpensePeriods = summaries.filter(p => p.periodStart >= today)
  if (futureExpensePeriods.length > 0) {
    const maxOut = futureExpensePeriods.reduce(
      (max, p) => (p.cashFlowOut > max.cashFlowOut ? p : max),
      futureExpensePeriods[0]
    )
    if (maxOut.cashFlowOut > 0) {
      warnings.push({
        type: 'largeFutureObligation',
        periodKey: maxOut.periodKey,
        periodLabel: maxOut.periodLabel,
        amount: maxOut.cashFlowOut,
        description: `Largest future outflow: ${formatCurrency(maxOut.cashFlowOut)} in ${maxOut.periodLabel}`
      })
    }
  }

  return warnings
}

// ─── Report Generation ────────────────────────────────────────

export function generateReport(
  file: CashFlowFile,
  definition: import('../types').ReportDefinition
): import('../types').ReportOutput {
  const scale: ViewScale = definition.type === 'monthly'
    ? 'month'
    : definition.type === 'quarterly'
    ? 'quarter'
    : definition.type === 'halfYearly'
    ? 'halfYear'
    : 'year'

  const startDate = definition.startPeriod
  let endDate = definition.endPeriod

  if (!endDate && definition.numberOfPeriods) {
    const s = fromISODate(startDate)
    let e: Date
    switch (scale) {
      case 'month':    e = addMonths(s, definition.numberOfPeriods - 1); break
      case 'quarter':  e = addMonths(s, definition.numberOfPeriods * 3 - 1); break
      case 'halfYear': e = addMonths(s, definition.numberOfPeriods * 6 - 1); break
      case 'year':     e = addYears(s, definition.numberOfPeriods - 1); break
    }
    endDate = toISODate(e)
  }

  if (!endDate) endDate = toISODate(addYears(fromISODate(startDate), 1))

  const result = calculateCashFlow(file, {
    scale,
    dateRange: { start: startDate, end: endDate }
  })

  // Build line item totals
  const lineItemTotals = new Map<string, import('../types').LineItemTotal>()
  for (const period of result.periods) {
    for (const occ of period.occurrences) {
      if (!lineItemTotals.has(occ.lineItemId)) {
        lineItemTotals.set(occ.lineItemId, {
          lineItemId: occ.lineItemId,
          name: occ.name,
          type: occ.type,
          category: occ.category,
          total: 0,
          periodTotals: {}
        })
      }
      const lt = lineItemTotals.get(occ.lineItemId)!
      lt.total += occ.amount
      lt.periodTotals[period.periodKey] = (lt.periodTotals[period.periodKey] ?? 0) + occ.amount
    }
  }

  // Build category totals
  const categoryTotals = new Map<string, import('../types').CategoryTotal>()
  for (const lt of lineItemTotals.values()) {
    const key = `${lt.type}::${lt.category}`
    if (!categoryTotals.has(key)) {
      categoryTotals.set(key, {
        category: lt.category,
        type: lt.type,
        total: 0,
        periodTotals: {}
      })
    }
    const ct = categoryTotals.get(key)!
    ct.total += lt.total
    for (const [pk, amt] of Object.entries(lt.periodTotals)) {
      ct.periodTotals[pk] = (ct.periodTotals[pk] ?? 0) + amt
    }
  }

  const lastPeriod = result.periods[result.periods.length - 1]

  return {
    definition,
    generatedAt: new Date().toISOString(),
    periods: result.periods,
    lineItemTotals: Array.from(lineItemTotals.values()),
    categoryTotals: Array.from(categoryTotals.values()),
    totalCashFlowIn: result.periods.reduce((s, p) => s + p.cashFlowIn, 0),
    totalCashFlowOut: result.periods.reduce((s, p) => s + p.cashFlowOut, 0),
    totalSurplusDeficit: result.periods.reduce((s, p) => s + p.netSurplusDeficit, 0),
    finalCumulativeSurplusDeficit: lastPeriod?.cumulativeSurplusDeficit ?? 0,
    beginningLiquidBalance: result.periods[0]?.beginningLiquidBalance ?? result.initialLiquidBalance,
    endingLiquidBalance: lastPeriod?.endingLiquidBalance ?? result.initialLiquidBalance
  }
}

// ─── CSV / JSON Export ────────────────────────────────────────

export function exportReportAsCSV(report: import('../types').ReportOutput): string {
  const lines: string[] = []
  lines.push(`"CashFlow Planner Report","${report.definition.name}"`)
  lines.push(`"Generated","${new Date(report.generatedAt).toLocaleString()}"`)
  lines.push('')

  const periodKeys = report.periods.map(p => p.periodKey)
  lines.push(['Line Item', 'Type', 'Category', ...periodKeys, 'Total'].map(q).join(','))

  for (const lt of report.lineItemTotals) {
    const row = [lt.name, lt.type, lt.category]
    for (const pk of periodKeys) {
      row.push(String(lt.periodTotals[pk] ?? 0))
    }
    row.push(String(lt.total))
    lines.push(row.map(q).join(','))
  }

  lines.push('')
  lines.push(['Summary', '', '', ...periodKeys.map(pk => {
    const p = report.periods.find(x => x.periodKey === pk)
    return p ? '' : ''
  })].map(q).join(','))

  const addSummaryRow = (label: string, getValue: (p: import('../types').PeriodSummary) => number) => {
    const row = [label, '', '']
    for (const pk of periodKeys) {
      const p = report.periods.find(x => x.periodKey === pk)
      row.push(p ? String(getValue(p)) : '0')
    }
    row.push('')
    lines.push(row.map(q).join(','))
  }

  addSummaryRow('Total Cash Flow In', p => p.cashFlowIn)
  addSummaryRow('Total Cash Flow Out', p => p.cashFlowOut)
  addSummaryRow('Net Surplus/Deficit', p => p.netSurplusDeficit)
  addSummaryRow('Cumulative Surplus/Deficit', p => p.cumulativeSurplusDeficit)
  addSummaryRow('Beginning Liquid Balance', p => p.beginningLiquidBalance)
  addSummaryRow('Ending Liquid Balance', p => p.endingLiquidBalance)

  return lines.join('\n')
}

function q(s: string): string {
  return `"${String(s).replace(/"/g, '""')}"`
}

// ─── Utility ──────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}

/**
 * Returns the default date range for a given scale: 12 months back,
 * 24 months forward (or appropriate for other scales).
 */
export function defaultDateRange(scale: ViewScale): { start: string; end: string } {
  const today = new Date()
  let start: Date, end: Date

  switch (scale) {
    case 'day':
      start = addDays(startOfDay(today), -14)
      end   = addDays(startOfDay(today), 60)
      break
    case 'week':
      start = addWeeks(startOfWeek(today, { weekStartsOn: 1 }), -4)
      end   = addWeeks(startOfWeek(today, { weekStartsOn: 1 }), 16)
      break
    case 'month':
      start = addMonths(startOfMonth(today), -12)
      end   = addMonths(startOfMonth(today), 24)
      break
    case 'quarter':
      start = addMonths(startOfQuarter(today), -12)
      end   = addMonths(startOfQuarter(today), 36)
      break
    case 'halfYear':
      start = addMonths(today, -24)
      end   = addMonths(today, 60)
      break
    case 'year':
      start = startOfYear(addYears(today, -2))
      end   = startOfYear(addYears(today, 5))
      break
  }

  return { start: toISODate(start), end: toISODate(end) }
}
