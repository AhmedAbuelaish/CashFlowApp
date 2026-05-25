// ============================================================
// CashFlow Planner — Validator
// Validates user input and loaded JSON files.
// ============================================================

import type {
  CashFlowFile,
  LineItem,
  RecurrenceRule,
  AmountRule,
  Account,
  ValidationResult
} from '../types'

import { detectCircularReferences } from './calculator'

// ─── File Schema Validation ───────────────────────────────────

/**
 * Validates a parsed JSON object as a CashFlowFile.
 * Returns all errors and warnings found.
 * Never throws — always returns a ValidationResult.
 */
export function validateFile(data: unknown): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['File is not a valid JSON object'], warnings }
  }

  const f = data as Record<string, unknown>

  if (typeof f.schemaVersion !== 'string') {
    errors.push('Missing or invalid schemaVersion')
  }

  if (!f.fileMetadata || typeof f.fileMetadata !== 'object') {
    errors.push('Missing fileMetadata')
  } else {
    const meta = f.fileMetadata as Record<string, unknown>
    if (typeof meta.name !== 'string') errors.push('fileMetadata.name is required')
    if (typeof meta.createdAt !== 'string') errors.push('fileMetadata.createdAt is required')
    if (typeof meta.updatedAt !== 'string') errors.push('fileMetadata.updatedAt is required')
  }

  if (!f.settings || typeof f.settings !== 'object') {
    errors.push('Missing settings')
  }

  if (!Array.isArray(f.lineItems)) {
    errors.push('lineItems must be an array')
  } else {
    for (let i = 0; i < f.lineItems.length; i++) {
      const itemErrors = validateLineItem(f.lineItems[i])
      for (const e of itemErrors.errors) {
        errors.push(`lineItems[${i}]: ${e}`)
      }
    }
  }

  if (!Array.isArray(f.accounts)) warnings.push('accounts is missing or not an array')
  if (!Array.isArray(f.occurrenceOverrides)) warnings.push('occurrenceOverrides is missing')
  if (!Array.isArray(f.reports)) warnings.push('reports is missing or not an array')

  // Check for circular references in line items
  if (Array.isArray(f.lineItems)) {
    const cycles = detectCircularReferences(f.lineItems as LineItem[])
    if (cycles.length > 0) {
      errors.push(`Circular linked calculation detected involving: ${cycles.join(', ')}`)
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}

// ─── Line Item Validation ─────────────────────────────────────

export function validateLineItem(item: unknown): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!item || typeof item !== 'object') {
    return { valid: false, errors: ['Line item is not an object'], warnings }
  }

  const li = item as Record<string, unknown>

  if (typeof li.id !== 'string' || !li.id) errors.push('id is required')
  if (li.type !== 'income' && li.type !== 'expense') errors.push('type must be "income" or "expense"')
  if (typeof li.name !== 'string' || !li.name) errors.push('name is required')
  if (typeof li.category !== 'string') warnings.push('category is missing')

  if (li.amountRule) {
    const arErrors = validateAmountRule(li.amountRule, li.id as string)
    errors.push(...arErrors.errors)
    warnings.push(...arErrors.warnings)
  } else {
    errors.push('amountRule is required')
  }

  if (li.recurrenceRule) {
    const rrErrors = validateRecurrenceRule(li.recurrenceRule)
    errors.push(...rrErrors.errors)
    warnings.push(...rrErrors.warnings)
  } else {
    errors.push('recurrenceRule is required')
  }

  return { valid: errors.length === 0, errors, warnings }
}

function validateAmountRule(rule: unknown, selfId: string): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!rule || typeof rule !== 'object') {
    return { valid: false, errors: ['amountRule must be an object'], warnings }
  }

  const r = rule as Record<string, unknown>
  const validModes = ['fixed', 'percentageOfLineItem', 'percentageOfCategory']

  if (!validModes.includes(r.mode as string)) {
    errors.push(`amountRule.mode must be one of: ${validModes.join(', ')}`)
  }

  if (r.mode === 'fixed') {
    if (typeof r.fixedAmount !== 'number' || r.fixedAmount < 0) {
      errors.push('amountRule.fixedAmount must be a non-negative number')
    }
  }

  if (r.mode === 'percentageOfLineItem') {
    if (typeof r.percentage !== 'number' || r.percentage <= 0 || r.percentage > 1000) {
      errors.push('amountRule.percentage must be between 0 and 1000')
    }
    if (typeof r.sourceLineItemId !== 'string' || !r.sourceLineItemId) {
      errors.push('amountRule.sourceLineItemId is required for percentageOfLineItem mode')
    }
    if (r.sourceLineItemId === selfId) {
      errors.push('A line item cannot reference itself as a linked source')
    }
  }

  if (r.mode === 'percentageOfCategory') {
    if (typeof r.percentage !== 'number' || r.percentage <= 0) {
      errors.push('amountRule.percentage must be positive for percentageOfCategory mode')
    }
    if (typeof r.sourceCategory !== 'string' || !r.sourceCategory) {
      errors.push('amountRule.sourceCategory is required for percentageOfCategory mode')
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}

function validateRecurrenceRule(rule: unknown): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!rule || typeof rule !== 'object') {
    return { valid: false, errors: ['recurrenceRule must be an object'], warnings }
  }

  const r = rule as Record<string, unknown>
  const validModes = ['singleDate', 'specificDates', 'finiteByCount', 'finiteUntilDate', 'infinite']

  if (!validModes.includes(r.mode as string)) {
    errors.push(`recurrenceRule.mode must be one of: ${validModes.join(', ')}`)
    return { valid: false, errors, warnings }
  }

  if (r.mode === 'singleDate') {
    if (!isValidDate(r.singleDate)) errors.push('singleDate must be a valid date')
  }

  if (r.mode === 'specificDates') {
    if (!Array.isArray(r.specificDates) || r.specificDates.length === 0) {
      errors.push('specificDates must be a non-empty array')
    } else {
      for (const d of r.specificDates) {
        if (!isValidDate(d)) errors.push(`specificDates contains invalid date: ${d}`)
      }
    }
  }

  if (r.mode === 'finiteByCount' || r.mode === 'finiteUntilDate' || r.mode === 'infinite') {
    if (!isValidDate(r.startDate)) errors.push('startDate must be a valid date')
    if (typeof r.interval !== 'number' || r.interval <= 0) {
      errors.push('interval must be a positive number')
    }
    const validUnits = ['day', 'week', 'month', 'year']
    if (!validUnits.includes(r.unit as string)) {
      errors.push(`unit must be one of: ${validUnits.join(', ')}`)
    }
  }

  if (r.mode === 'finiteByCount') {
    if (typeof r.count !== 'number' || r.count <= 0 || !Number.isInteger(r.count)) {
      errors.push('count must be a positive integer')
    }
  }

  if (r.mode === 'finiteUntilDate') {
    if (!isValidDate(r.untilDate)) errors.push('untilDate must be a valid date')
    if (isValidDate(r.startDate) && isValidDate(r.untilDate)) {
      if (new Date(r.untilDate as string) <= new Date(r.startDate as string)) {
        errors.push('untilDate must be after startDate')
      }
    }
  }

  if (r.dayOfMonth !== undefined) {
    if (typeof r.dayOfMonth !== 'number' || r.dayOfMonth < 1 || r.dayOfMonth > 31) {
      errors.push('dayOfMonth must be between 1 and 31')
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}

// ─── Account Validation ───────────────────────────────────────

export function validateAccount(account: unknown): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!account || typeof account !== 'object') {
    return { valid: false, errors: ['Account must be an object'], warnings }
  }

  const a = account as Record<string, unknown>

  if (typeof a.name !== 'string' || !a.name) errors.push('Account name is required')
  if (typeof a.balance !== 'number') errors.push('Account balance must be a number')
  if (a.liquidity !== 'liquid' && a.liquidity !== 'tiedUp') {
    errors.push('Account liquidity must be "liquid" or "tiedUp"')
  }

  return { valid: errors.length === 0, errors, warnings }
}

// ─── Form Input Validation ────────────────────────────────────

export function validateAmount(value: string): string | null {
  if (!value.trim()) return 'Amount is required'
  const n = parseFloat(value)
  if (isNaN(n)) return 'Amount must be a number'
  if (n < 0) return 'Amount must be non-negative'
  return null
}

export function validatePercentage(value: string): string | null {
  if (!value.trim()) return 'Percentage is required'
  const n = parseFloat(value)
  if (isNaN(n)) return 'Percentage must be a number'
  if (n <= 0 || n > 1000) return 'Percentage must be between 0 and 1000'
  return null
}

export function validateDateString(value: string): string | null {
  if (!value.trim()) return 'Date is required'
  if (!isValidDate(value)) return 'Date must be a valid date (YYYY-MM-DD)'
  return null
}

export function validatePositiveInteger(value: string): string | null {
  const n = parseInt(value, 10)
  if (isNaN(n) || n <= 0) return 'Must be a positive integer'
  return null
}

// ─── Helpers ──────────────────────────────────────────────────

function isValidDate(value: unknown): boolean {
  if (typeof value !== 'string') return false
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(value)
  return !isNaN(d.getTime())
}
