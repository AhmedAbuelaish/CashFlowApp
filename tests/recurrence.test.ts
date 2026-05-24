// ============================================================
// CashFlow Planner — Recurrence Engine Tests
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  isBusinessDay,
  adjustForBusinessDay,
  firstBusinessDayOfMonth,
  lastBusinessDayOfMonth,
  generateOccurrenceDates
} from '../src/renderer/src/shared/engine/recurrence'
import { parseISO, getDay } from 'date-fns'
import type { RecurrenceRule } from '../src/renderer/src/shared/types'

// ── Helpers ───────────────────────────────────────────────────

function rule(overrides: Partial<RecurrenceRule>): RecurrenceRule {
  return {
    mode: 'infinite',
    startDate: '2025-01-01',
    interval: 1,
    unit: 'month',
    businessDayRule: 'none',
    specialRule: null,
    ...overrides
  }
}

const RANGE_2025 = { start: '2025-01-01', end: '2025-12-31' }
const RANGE_2YR  = { start: '2025-01-01', end: '2026-12-31' }

// ── Business Day Utilities ────────────────────────────────────

describe('isBusinessDay', () => {
  it('returns true for a Monday', () => {
    expect(isBusinessDay(parseISO('2025-01-06'))).toBe(true) // Monday
  })
  it('returns true for a Friday', () => {
    expect(isBusinessDay(parseISO('2025-01-10'))).toBe(true) // Friday
  })
  it('returns false for a Saturday', () => {
    expect(isBusinessDay(parseISO('2025-01-04'))).toBe(false)
  })
  it('returns false for a Sunday', () => {
    expect(isBusinessDay(parseISO('2025-01-05'))).toBe(false)
  })
})

describe('adjustForBusinessDay', () => {
  it('does not move a weekday', () => {
    const d = parseISO('2025-01-06') // Monday
    expect(adjustForBusinessDay(d, 'nextBusinessDay').toISOString().slice(0,10)).toBe('2025-01-06')
  })
  it('moves Saturday to next Monday with nextBusinessDay', () => {
    const d = parseISO('2025-01-04') // Saturday
    expect(adjustForBusinessDay(d, 'nextBusinessDay').toISOString().slice(0,10)).toBe('2025-01-06')
  })
  it('moves Saturday to Friday with previousBusinessDay', () => {
    const d = parseISO('2025-01-04') // Saturday
    expect(adjustForBusinessDay(d, 'previousBusinessDay').toISOString().slice(0,10)).toBe('2025-01-03')
  })
  it('moves Sunday to next Monday with nextBusinessDay', () => {
    const d = parseISO('2025-01-05') // Sunday
    expect(adjustForBusinessDay(d, 'nextBusinessDay').toISOString().slice(0,10)).toBe('2025-01-06')
  })
  it('does nothing with rule = none', () => {
    const d = parseISO('2025-01-04') // Saturday
    expect(adjustForBusinessDay(d, 'none').toISOString().slice(0,10)).toBe('2025-01-04')
  })
})

describe('firstBusinessDayOfMonth', () => {
  it('returns Jan 2 2025 (Jan 1 is Wednesday, but actually Jan 1 2025 is a Wednesday)', () => {
    // Jan 1 2025 is Wednesday — first business day IS Jan 1
    const d = firstBusinessDayOfMonth(parseISO('2025-01-15'))
    expect(isBusinessDay(d)).toBe(true)
    const dow = getDay(d)
    expect(dow).toBeGreaterThanOrEqual(1)
    expect(dow).toBeLessThanOrEqual(5)
    expect(d.getDate()).toBeLessThanOrEqual(5)
  })
  it('returns a weekday in any month', () => {
    const months = ['2025-02-01','2025-03-01','2025-04-01','2025-05-01','2025-06-01','2025-07-01']
    for (const m of months) {
      const d = firstBusinessDayOfMonth(parseISO(m))
      expect(isBusinessDay(d)).toBe(true)
    }
  })
})

describe('lastBusinessDayOfMonth', () => {
  it('returns a weekday for every month', () => {
    const months = ['2025-01-01','2025-02-01','2025-03-01','2025-04-01','2025-11-01','2025-12-01']
    for (const m of months) {
      const d = lastBusinessDayOfMonth(parseISO(m))
      expect(isBusinessDay(d)).toBe(true)
    }
  })
})

// ── Recurrence Mode: singleDate ───────────────────────────────

describe('singleDate', () => {
  it('generates exactly one occurrence on the specified date', () => {
    const dates = generateOccurrenceDates(
      rule({ mode: 'singleDate', singleDate: '2025-06-15' }),
      RANGE_2025
    )
    expect(dates).toEqual(['2025-06-15'])
  })
  it('generates no occurrences outside range', () => {
    const dates = generateOccurrenceDates(
      rule({ mode: 'singleDate', singleDate: '2024-01-01' }),
      RANGE_2025
    )
    expect(dates).toHaveLength(0)
  })
})

// ── Recurrence Mode: specificDates ───────────────────────────

describe('specificDates', () => {
  it('generates occurrences only for dates within range', () => {
    const dates = generateOccurrenceDates(
      rule({ mode: 'specificDates', specificDates: ['2025-03-15','2025-06-15','2026-01-01'] }),
      RANGE_2025
    )
    expect(dates).toEqual(['2025-03-15','2025-06-15'])
  })
  it('handles empty specific dates list', () => {
    const dates = generateOccurrenceDates(
      rule({ mode: 'specificDates', specificDates: [] }),
      RANGE_2025
    )
    expect(dates).toHaveLength(0)
  })
})

// ── Recurrence Mode: infinite monthly ────────────────────────

describe('infinite monthly recurrence', () => {
  it('generates 12 monthly occurrences in a full year', () => {
    const dates = generateOccurrenceDates(
      rule({ mode: 'infinite', startDate: '2025-01-15', interval: 1, unit: 'month' }),
      RANGE_2025
    )
    expect(dates).toHaveLength(12)
  })

  it('generates on the correct day of month each time', () => {
    const dates = generateOccurrenceDates(
      rule({ mode: 'infinite', startDate: '2025-01-10', interval: 1, unit: 'month' }),
      RANGE_2025
    )
    for (const d of dates) {
      expect(parseISO(d).getDate()).toBe(10)
    }
  })

  it('generates 6 bimonthly occurrences in a year', () => {
    const dates = generateOccurrenceDates(
      rule({ mode: 'infinite', startDate: '2025-01-01', interval: 2, unit: 'month' }),
      RANGE_2025
    )
    expect(dates).toHaveLength(6)
  })

  it('generates 2 semiannual occurrences', () => {
    const dates = generateOccurrenceDates(
      rule({ mode: 'infinite', startDate: '2025-01-01', interval: 6, unit: 'month' }),
      RANGE_2025
    )
    expect(dates).toHaveLength(2)
  })

  it('generates 1 annual occurrence in a single year', () => {
    const dates = generateOccurrenceDates(
      rule({ mode: 'infinite', startDate: '2025-03-15', interval: 12, unit: 'month' }),
      RANGE_2025
    )
    expect(dates).toHaveLength(1)
    expect(dates[0]).toBe('2025-03-15')
  })

  it('generates 2 annual occurrences over two years', () => {
    const dates = generateOccurrenceDates(
      rule({ mode: 'infinite', startDate: '2025-03-15', interval: 1, unit: 'year' }),
      RANGE_2YR
    )
    expect(dates).toHaveLength(2)
    expect(dates[0]).toBe('2025-03-15')
    expect(dates[1]).toBe('2026-03-15')
  })
})

// ── Recurrence: first business day of month ───────────────────

describe('firstBusinessDayOfMonth special rule', () => {
  it('generates 12 occurrences in a year', () => {
    const dates = generateOccurrenceDates(
      rule({
        mode: 'infinite',
        startDate: '2025-01-01',
        interval: 1,
        unit: 'month',
        specialRule: 'firstBusinessDayOfMonth'
      }),
      RANGE_2025
    )
    expect(dates).toHaveLength(12)
  })

  it('all generated dates are on weekdays', () => {
    const dates = generateOccurrenceDates(
      rule({
        mode: 'infinite',
        startDate: '2025-01-01',
        interval: 1,
        unit: 'month',
        specialRule: 'firstBusinessDayOfMonth'
      }),
      RANGE_2025
    )
    for (const d of dates) {
      const parsed = parseISO(d)
      expect(isBusinessDay(parsed)).toBe(true)
    }
  })
})

// ── Recurrence Mode: finiteByCount ───────────────────────────

describe('finiteByCount', () => {
  it('generates exactly the specified count of occurrences', () => {
    const dates = generateOccurrenceDates(
      rule({
        mode: 'finiteByCount',
        startDate: '2025-01-01',
        interval: 1,
        unit: 'month',
        count: 6
      }),
      { start: '2025-01-01', end: '2030-12-31' }
    )
    expect(dates).toHaveLength(6)
  })

  it('generates 26 biweekly occurrences (1 year)', () => {
    const dates = generateOccurrenceDates(
      rule({
        mode: 'finiteByCount',
        startDate: '2025-01-01',
        interval: 2,
        unit: 'week',
        count: 26
      }),
      { start: '2025-01-01', end: '2030-12-31' }
    )
    expect(dates).toHaveLength(26)
  })

  it('stops at range end even if count not reached', () => {
    const dates = generateOccurrenceDates(
      rule({
        mode: 'finiteByCount',
        startDate: '2025-01-01',
        interval: 1,
        unit: 'month',
        count: 100
      }),
      RANGE_2025
    )
    expect(dates.length).toBeLessThanOrEqual(12)
  })

  it('does not generate if start is outside range', () => {
    const dates = generateOccurrenceDates(
      rule({
        mode: 'finiteByCount',
        startDate: '2020-01-01',
        interval: 1,
        unit: 'year',
        count: 3
      }),
      RANGE_2025
    )
    expect(dates).toHaveLength(0)
  })
})

// ── Recurrence Mode: finiteUntilDate ─────────────────────────

describe('finiteUntilDate', () => {
  it('generates monthly occurrences up to the end date', () => {
    const dates = generateOccurrenceDates(
      rule({
        mode: 'finiteUntilDate',
        startDate: '2025-01-01',
        interval: 1,
        unit: 'month',
        untilDate: '2025-06-30'
      }),
      RANGE_2025
    )
    expect(dates.every(d => d <= '2025-06-30')).toBe(true)
    expect(dates.length).toBeGreaterThan(0)
  })

  it('generates weekly occurrences until stop date', () => {
    const dates = generateOccurrenceDates(
      rule({
        mode: 'finiteUntilDate',
        startDate: '2025-01-06',
        interval: 1,
        unit: 'week',
        untilDate: '2025-03-31'
      }),
      RANGE_2025
    )
    expect(dates.length).toBeGreaterThan(0)
    expect(dates.every(d => d <= '2025-03-31')).toBe(true)
  })
})

// ── Sorting guarantee ─────────────────────────────────────────

describe('output ordering', () => {
  it('returns dates in ascending order for monthly recurrence', () => {
    const dates = generateOccurrenceDates(
      rule({ mode: 'infinite', startDate: '2025-01-15', interval: 1, unit: 'month' }),
      RANGE_2025
    )
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] > dates[i-1]).toBe(true)
    }
  })
})

// ── Day-of-month override ─────────────────────────────────────

describe('dayOfMonth override', () => {
  it('uses the specified day of month instead of start date day', () => {
    const dates = generateOccurrenceDates(
      rule({
        mode: 'infinite',
        startDate: '2025-01-01',
        interval: 1,
        unit: 'month',
        dayOfMonth: 28
      }),
      RANGE_2025
    )
    for (const d of dates) {
      // day might be adjusted to end of month for Feb, etc.
      expect(parseISO(d).getDate()).toBeGreaterThanOrEqual(28)
    }
  })
})
