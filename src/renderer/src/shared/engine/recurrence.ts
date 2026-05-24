// ============================================================
// CashFlow Planner — Recurrence Engine
// Generates payment/income dates from recurrence rules.
// CRITICAL: Never spreads amounts across periods; only generates
// actual scheduled dates as defined by the rule.
// ============================================================

import {
  parseISO,
  addDays,
  addWeeks,
  addMonths,
  addYears,
  isWeekend,
  isBefore,
  isAfter,
  isEqual,
  startOfDay,
  endOfDay,
  format,
  getDaysInMonth,
  getDate,
  setDate,
  getDay,
  startOfMonth,
  endOfMonth,
  lastDayOfMonth
} from 'date-fns'
import type { RecurrenceRule, BusinessDayRule } from './types'

// ─── Business Day Utilities ───────────────────────────────────

/**
 * Returns true if the date falls on a weekday (Mon–Fri).
 * Holiday support is architectured but not required in v1.
 */
export function isBusinessDay(date: Date): boolean {
  return !isWeekend(date)
}

/**
 * Adjusts a date to the nearest business day per the specified rule.
 */
export function adjustForBusinessDay(date: Date, rule: BusinessDayRule): Date {
  if (rule === 'none' || isBusinessDay(date)) return date

  let adjusted = new Date(date)

  if (rule === 'nextBusinessDay') {
    while (!isBusinessDay(adjusted)) {
      adjusted = addDays(adjusted, 1)
    }
  } else if (rule === 'previousBusinessDay') {
    while (!isBusinessDay(adjusted)) {
      adjusted = addDays(adjusted, -1)
    }
  }

  return adjusted
}

/**
 * Returns the first business day of the month containing the given date.
 */
export function firstBusinessDayOfMonth(date: Date): Date {
  let d = startOfMonth(date)
  while (!isBusinessDay(d)) {
    d = addDays(d, 1)
  }
  return d
}

/**
 * Returns the last business day of the month containing the given date.
 */
export function lastBusinessDayOfMonth(date: Date): Date {
  let d = endOfMonth(date)
  while (!isBusinessDay(d)) {
    d = addDays(d, -1)
  }
  return d
}

// ─── Date Advance ─────────────────────────────────────────────

/**
 * Advances a date by one interval step according to the unit.
 */
export function advanceDate(
  date: Date,
  interval: number,
  unit: 'day' | 'week' | 'month' | 'year'
): Date {
  switch (unit) {
    case 'day':   return addDays(date, interval)
    case 'week':  return addWeeks(date, interval)
    case 'month': return addMonths(date, interval)
    case 'year':  return addYears(date, interval)
  }
}

/**
 * Applies dayOfMonth override to a date (e.g. always on the 28th),
 * clamping to the last day of the month if needed.
 */
function applyDayOfMonth(date: Date, dayOfMonth: number): Date {
  const maxDay = getDaysInMonth(date)
  const clampedDay = Math.min(dayOfMonth, maxDay)
  return setDate(date, clampedDay)
}

// ─── Core Occurrence Generator ────────────────────────────────

export interface OccurrenceDateRange {
  start: Date
  end: Date
}

/**
 * Generates all occurrence dates for a recurrence rule within the
 * given date range. Returns dates sorted ascending.
 *
 * This is the only function that should be called externally.
 * It strictly generates dates per the rule — no normalization,
 * no spreading into monthly equivalents.
 */
export function generateOccurrenceDates(
  rule: RecurrenceRule,
  range: OccurrenceDateRange
): Date[] {
  const rangeStart = startOfDay(range.start)
  const rangeEnd = endOfDay(range.end)

  switch (rule.mode) {
    case 'singleDate':
      return generateSingleDate(rule, rangeStart, rangeEnd)
    case 'specificDates':
      return generateSpecificDates(rule, rangeStart, rangeEnd)
    case 'finiteByCount':
      return generateFiniteByCount(rule, rangeStart, rangeEnd)
    case 'finiteUntilDate':
      return generateFiniteUntilDate(rule, rangeStart, rangeEnd)
    case 'infinite':
      return generateInfinite(rule, rangeStart, rangeEnd)
    default:
      return []
  }
}

function generateSingleDate(
  rule: RecurrenceRule,
  rangeStart: Date,
  rangeEnd: Date
): Date[] {
  if (!rule.singleDate) return []
  const d = startOfDay(parseISO(rule.singleDate))
  if (isInRange(d, rangeStart, rangeEnd)) return [d]
  return []
}

function generateSpecificDates(
  rule: RecurrenceRule,
  rangeStart: Date,
  rangeEnd: Date
): Date[] {
  if (!rule.specificDates) return []
  return rule.specificDates
    .map(s => startOfDay(parseISO(s)))
    .filter(d => isInRange(d, rangeStart, rangeEnd))
    .sort((a, b) => a.getTime() - b.getTime())
}

function generateFiniteByCount(
  rule: RecurrenceRule,
  rangeStart: Date,
  rangeEnd: Date
): Date[] {
  if (!rule.startDate || !rule.interval || !rule.unit || !rule.count) return []

  const dates: Date[] = []
  let current = startOfDay(parseISO(rule.startDate))
  let remaining = rule.count

  while (remaining > 0 && !isAfter(current, rangeEnd)) {
    const resolved = resolveSpecialDate(current, rule)
    if (isInRange(resolved, rangeStart, rangeEnd)) {
      dates.push(resolved)
    }
    current = advanceDate(current, rule.interval, rule.unit)
    remaining--
  }

  return dates.sort((a, b) => a.getTime() - b.getTime())
}

function generateFiniteUntilDate(
  rule: RecurrenceRule,
  rangeStart: Date,
  rangeEnd: Date
): Date[] {
  if (!rule.startDate || !rule.interval || !rule.unit || !rule.untilDate) return []

  const until = startOfDay(parseISO(rule.untilDate))
  const effectiveEnd = isBefore(until, rangeEnd) ? until : rangeEnd

  const dates: Date[] = []
  let current = startOfDay(parseISO(rule.startDate))

  while (!isAfter(current, effectiveEnd)) {
    const resolved = resolveSpecialDate(current, rule)
    if (isInRange(resolved, rangeStart, rangeEnd)) {
      dates.push(resolved)
    }
    current = advanceDate(current, rule.interval, rule.unit)
  }

  return dates.sort((a, b) => a.getTime() - b.getTime())
}

function generateInfinite(
  rule: RecurrenceRule,
  rangeStart: Date,
  rangeEnd: Date
): Date[] {
  // Infinite rules require a bounded range to generate occurrences.
  // The caller must always provide a meaningful rangeEnd.
  if (!rule.startDate || !rule.interval || !rule.unit) return []

  const dates: Date[] = []
  let current = startOfDay(parseISO(rule.startDate))

  // Safety cap: never generate more than 10 years of occurrences
  const absoluteMax = addYears(rangeStart, 10)
  const effectiveEnd = isBefore(rangeEnd, absoluteMax) ? rangeEnd : absoluteMax

  while (!isAfter(current, effectiveEnd)) {
    const resolved = resolveSpecialDate(current, rule)
    if (isInRange(resolved, rangeStart, rangeEnd)) {
      dates.push(resolved)
    } else if (isAfter(resolved, rangeEnd)) {
      // Past the range end — stop
      break
    }
    current = advanceDate(current, rule.interval, rule.unit)
  }

  return dates.sort((a, b) => a.getTime() - b.getTime())
}

// ─── Special Date Resolution ──────────────────────────────────

/**
 * Resolves a raw iteration date to its final date, applying:
 *  1. dayOfMonth override (e.g. always on the 15th)
 *  2. specialRule (first/last business day of month)
 *  3. businessDayRule adjustment
 */
function resolveSpecialDate(current: Date, rule: RecurrenceRule): Date {
  let resolved = new Date(current)

  // Apply special rules first (they set the day within the month)
  if (rule.specialRule === 'firstBusinessDayOfMonth') {
    return firstBusinessDayOfMonth(resolved)
  }
  if (rule.specialRule === 'lastBusinessDayOfMonth') {
    return lastBusinessDayOfMonth(resolved)
  }

  // Apply fixed day of month
  if (rule.dayOfMonth !== undefined && rule.unit === 'month') {
    resolved = applyDayOfMonth(resolved, rule.dayOfMonth)
  }

  // Apply business day adjustment
  if (rule.businessDayRule && rule.businessDayRule !== 'none') {
    resolved = adjustForBusinessDay(resolved, rule.businessDayRule)
  }

  return resolved
}

// ─── Helpers ──────────────────────────────────────────────────

function isInRange(date: Date, start: Date, end: Date): boolean {
  return (isEqual(date, start) || isAfter(date, start)) &&
         (isEqual(date, end) || isBefore(date, end))
}

/**
 * Formats a Date to ISO date string YYYY-MM-DD (no time component).
 */
export function toISODate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

/**
 * Parses an ISO date string to a Date at start of day.
 */
export function fromISODate(s: string): Date {
  return startOfDay(parseISO(s))
}

/**
 * Returns a human-readable description of a recurrence rule.
 */
export function describeRecurrenceRule(rule: RecurrenceRule): string {
  switch (rule.mode) {
    case 'singleDate':
      return `Once on ${rule.singleDate ?? 'unset'}`
    case 'specificDates':
      return `On ${rule.specificDates?.length ?? 0} specific dates`
    case 'finiteByCount':
      return `Every ${rule.interval} ${rule.unit}(s) for ${rule.count} occurrences starting ${rule.startDate}`
    case 'finiteUntilDate':
      return `Every ${rule.interval} ${rule.unit}(s) from ${rule.startDate} until ${rule.untilDate}`
    case 'infinite':
      if (rule.specialRule === 'firstBusinessDayOfMonth') {
        return `First business day of every month starting ${rule.startDate}`
      }
      if (rule.specialRule === 'lastBusinessDayOfMonth') {
        return `Last business day of every month starting ${rule.startDate}`
      }
      if (rule.dayOfMonth) {
        return `Day ${rule.dayOfMonth} of every ${rule.interval} month(s) starting ${rule.startDate}`
      }
      return `Every ${rule.interval} ${rule.unit}(s) starting ${rule.startDate}`
    default:
      return 'Unknown recurrence'
  }
}

// ─── High-level wrapper ───────────────────────────────────────

import type { LineItem, Occurrence } from './types'
import { v4 as uuidv4 } from 'uuid'

/**
 * Generate Occurrence objects for a line item within a date range.
 * Convenience wrapper used by the UI for previews and occurrence lists.
 */
export function generateOccurrences(
  lineItem: LineItem,
  dateRange: { start: string; end: string }
): Occurrence[] {
  const dates = generateOccurrenceDates(lineItem.recurrenceRule, dateRange)
  return dates.map(date => ({
    id: uuidv4(),
    lineItemId: lineItem.id,
    date,
    amount: lineItem.amountRule.fixedAmount ?? 0,
    type: lineItem.type,
    category: lineItem.category,
    name: lineItem.name,
    confirmationStatus: lineItem.confirmationStatus,
    isOptional: lineItem.isOptional,
    isOverridden: false,
    traceability: [{
      sourceType: 'lineItem',
      sourceId: lineItem.id,
      description: `Generated from recurrence rule (${lineItem.recurrenceRule.mode})`
    }]
  }))
}
