// ============================================================
// CashFlow Planner — Calculator Engine Tests
// ============================================================

import { describe, it, expect } from 'vitest'
import { calculateCashFlow } from '../src/renderer/src/shared/engine/calculator'
import type {
  CashFlowFile,
  LineItem,
  RecurrenceRule,
  AmountRule,
  OccurrenceOverride,
  Account,
  AccountBalanceUpdate
} from '../src/renderer/src/shared/types'
import { v4 as uuidv4 } from 'uuid'

// ── Builders ──────────────────────────────────────────────────

function makeFile(overrides: Partial<CashFlowFile> = {}): CashFlowFile {
  return {
    schemaVersion: '1.0.0',
    fileMetadata: {
      name: 'Test File',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      initialLiquidBalance: 0,
      currency: 'USD'
    },
    settings: {
      autosave: false,
      defaultViewScale: 'month',
      defaultCumulativeChartMode: 'separateChart',
      currency: 'USD'
    },
    accounts: [],
    accountBalanceUpdates: [],
    lineItems: [],
    occurrenceOverrides: [],
    reports: [],
    ...overrides
  }
}

function fixedAmount(amount: number): AmountRule {
  return {
    mode: 'fixed',
    fixedAmount: amount,
    useProjectedValues: true,
    useConfirmedValues: true
  }
}

function monthlyRule(startDate: string, interval = 1): RecurrenceRule {
  return {
    mode: 'infinite',
    startDate,
    interval,
    unit: 'month',
    businessDayRule: 'none',
    specialRule: null
  }
}

function annualRule(startDate: string): RecurrenceRule {
  return {
    mode: 'infinite',
    startDate,
    interval: 1,
    unit: 'year',
    businessDayRule: 'none',
    specialRule: null
  }
}

function semiannualRule(startDate: string): RecurrenceRule {
  return {
    mode: 'infinite',
    startDate,
    interval: 6,
    unit: 'month',
    businessDayRule: 'none',
    specialRule: null
  }
}

function incomeItem(name: string, amount: number, rr: RecurrenceRule): LineItem {
  const now = new Date().toISOString()
  return {
    id: uuidv4(),
    type: 'income',
    name,
    category: 'Salary',
    amountRule: fixedAmount(amount),
    recurrenceRule: rr,
    confirmationStatus: 'confirmed',
    isOptional: false,
    createdAt: now,
    updatedAt: now
  }
}

function expenseItem(name: string, amount: number, rr: RecurrenceRule, isOptional = false, optionalThreshold = 0): LineItem {
  const now = new Date().toISOString()
  return {
    id: uuidv4(),
    type: 'expense',
    name,
    category: 'Other',
    amountRule: fixedAmount(amount),
    recurrenceRule: rr,
    confirmationStatus: 'confirmed',
    isOptional,
    optionalRule: isOptional ? { mode: 'includeIfPeriodSurplusGreaterThan', threshold: optionalThreshold } : undefined,
    createdAt: now,
    updatedAt: now
  }
}

const RANGE_2025 = { start: '2025-01-01', end: '2025-12-31' }
const CALC_OPT = { scale: 'month' as const, dateRange: RANGE_2025 }

// ── Basic Period Calculations ─────────────────────────────────

describe('basic period surplus/deficit', () => {
  it('calculates positive net when income exceeds expenses', () => {
    const file = makeFile({
      lineItems: [
        incomeItem('Salary', 3000, monthlyRule('2025-01-15')),
        expenseItem('Rent', 1000, monthlyRule('2025-01-01'))
      ]
    })
    const result = calculateCashFlow(file, CALC_OPT)
    const jan = result.periods.find(p => p.periodKey === '2025-01')!
    expect(jan.cashFlowIn).toBe(3000)
    expect(jan.cashFlowOut).toBe(1000)
    expect(jan.netSurplusDeficit).toBe(2000)
  })

  it('calculates negative net when expenses exceed income', () => {
    const file = makeFile({
      lineItems: [
        incomeItem('Salary', 1000, monthlyRule('2025-01-15')),
        expenseItem('Rent', 2000, monthlyRule('2025-01-01'))
      ]
    })
    const result = calculateCashFlow(file, CALC_OPT)
    const jan = result.periods.find(p => p.periodKey === '2025-01')!
    expect(jan.netSurplusDeficit).toBe(-1000)
  })
})

// ── Cumulative Surplus/Deficit ────────────────────────────────

describe('cumulative surplus/deficit', () => {
  it('accumulates correctly month over month', () => {
    const file = makeFile({
      lineItems: [
        incomeItem('Salary', 3000, monthlyRule('2025-01-15')),
        expenseItem('Rent', 2500, monthlyRule('2025-01-01'))
      ]
    })
    const result = calculateCashFlow(file, CALC_OPT)

    const jan = result.periods.find(p => p.periodKey === '2025-01')!
    const feb = result.periods.find(p => p.periodKey === '2025-02')!
    const mar = result.periods.find(p => p.periodKey === '2025-03')!

    expect(jan.netSurplusDeficit).toBe(500)
    expect(jan.cumulativeSurplusDeficit).toBe(500)
    expect(feb.cumulativeSurplusDeficit).toBe(1000)
    expect(mar.cumulativeSurplusDeficit).toBe(1500)
  })

  it('shows cumulative going to zero after large annual payment (the critical spec example)', () => {
    // Monthly surplus of $500, then $2000 annual expense in April
    const file = makeFile({
      lineItems: [
        incomeItem('Salary', 3000, monthlyRule('2025-01-01')),
        expenseItem('Regular', 2500, monthlyRule('2025-01-01')),     // $500/month net
        expenseItem('Insurance', 2000, {
          mode: 'singleDate',
          singleDate: '2025-04-01'
        })
      ]
    })
    const result = calculateCashFlow(file, CALC_OPT)

    const jan = result.periods.find(p => p.periodKey === '2025-01')!
    const feb = result.periods.find(p => p.periodKey === '2025-02')!
    const mar = result.periods.find(p => p.periodKey === '2025-03')!
    const apr = result.periods.find(p => p.periodKey === '2025-04')!

    // Cumulative builds up
    expect(jan.cumulativeSurplusDeficit).toBe(500)
    expect(feb.cumulativeSurplusDeficit).toBe(1000)
    expect(mar.cumulativeSurplusDeficit).toBe(1500)

    // April: regular surplus $500 - annual $2000 = -$1500 net
    expect(apr.netSurplusDeficit).toBe(-1500)
    // Cumulative: 1500 + (-1500) = 0
    expect(apr.cumulativeSurplusDeficit).toBe(0)
  })
})

// ── Actual Date Placement (No Normalization) ──────────────────

describe('actual date placement', () => {
  it('places annual payment only in the month it occurs', () => {
    const file = makeFile({
      lineItems: [
        expenseItem('Annual Fee', 1200, annualRule('2025-06-15'))
      ]
    })
    const result = calculateCashFlow(file, CALC_OPT)

    const jun = result.periods.find(p => p.periodKey === '2025-06')!
    expect(jun.cashFlowOut).toBe(1200)

    // All other months should have $0 cash out for this item
    const otherMonths = result.periods.filter(p => p.periodKey !== '2025-06')
    for (const p of otherMonths) {
      expect(p.cashFlowOut).toBe(0)
    }
  })

  it('places semiannual payment only in the two months it occurs', () => {
    const file = makeFile({
      lineItems: [
        expenseItem('Insurance', 600, semiannualRule('2025-01-01'))
      ]
    })
    const result = calculateCashFlow(file, CALC_OPT)

    const periodsWithPayment = result.periods.filter(p => p.cashFlowOut > 0)
    expect(periodsWithPayment).toHaveLength(2)
    expect(periodsWithPayment[0].periodKey).toBe('2025-01')
    expect(periodsWithPayment[1].periodKey).toBe('2025-07')
  })
})

// ── Beginning and Ending Liquid Balance ───────────────────────

describe('liquid balance', () => {
  it('beginning balance of first period equals initial liquid balance', () => {
    const file = makeFile({
      fileMetadata: {
        name: 'Test',
        createdAt: '',
        updatedAt: '',
        initialLiquidBalance: 5000,
        currency: 'USD'
      }
    })
    const result = calculateCashFlow(file, CALC_OPT)
    const jan = result.periods[0]
    expect(jan.beginningLiquidBalance).toBe(5000)
  })

  it('ending balance = beginning balance + net surplus', () => {
    const file = makeFile({
      fileMetadata: {
        name: 'Test',
        createdAt: '',
        updatedAt: '',
        initialLiquidBalance: 1000,
        currency: 'USD'
      },
      lineItems: [
        incomeItem('Salary', 2000, monthlyRule('2025-01-15')),
        expenseItem('Rent', 1500, monthlyRule('2025-01-01'))
      ]
    })
    const result = calculateCashFlow(file, CALC_OPT)
    const jan = result.periods.find(p => p.periodKey === '2025-01')!
    expect(jan.beginningLiquidBalance).toBe(1000)
    expect(jan.netSurplusDeficit).toBe(500)
    expect(jan.endingLiquidBalance).toBe(1500)
  })

  it('each period begins where the previous ended', () => {
    const file = makeFile({
      fileMetadata: {
        name: 'Test',
        createdAt: '',
        updatedAt: '',
        initialLiquidBalance: 0,
        currency: 'USD'
      },
      lineItems: [
        incomeItem('Salary', 3000, monthlyRule('2025-01-01'))
      ]
    })
    const result = calculateCashFlow(file, CALC_OPT)
    for (let i = 1; i < result.periods.length; i++) {
      expect(result.periods[i].beginningLiquidBalance).toBe(result.periods[i-1].endingLiquidBalance)
    }
  })
})

// ── Optional Expenses ─────────────────────────────────────────

describe('optional expenses', () => {
  it('includes optional expense when period surplus exceeds threshold', () => {
    const file = makeFile({
      lineItems: [
        incomeItem('Salary', 3000, monthlyRule('2025-01-01')),
        expenseItem('Required', 1000, monthlyRule('2025-01-01')),
        // Surplus before optional = $2000, threshold = $500 → included
        expenseItem('Optional Gym', 50, monthlyRule('2025-01-01'), true, 500)
      ]
    })
    const result = calculateCashFlow(file, CALC_OPT)
    const jan = result.periods.find(p => p.periodKey === '2025-01')!
    expect(jan.optionalExpensesIncluded.length).toBeGreaterThan(0)
    expect(jan.cashFlowOut).toBe(1050) // $1000 + $50
  })

  it('excludes optional expense when surplus is below threshold', () => {
    const file = makeFile({
      lineItems: [
        incomeItem('Salary', 1100, monthlyRule('2025-01-01')),
        expenseItem('Required', 1000, monthlyRule('2025-01-01')),
        // Surplus before optional = $100, threshold = $500 → excluded
        expenseItem('Optional Gym', 50, monthlyRule('2025-01-01'), true, 500)
      ]
    })
    const result = calculateCashFlow(file, CALC_OPT)
    const jan = result.periods.find(p => p.periodKey === '2025-01')!
    expect(jan.optionalExpensesExcluded.length).toBeGreaterThan(0)
    expect(jan.cashFlowOut).toBe(1000) // only required
  })
})

// ── Linked Percentage Amounts ─────────────────────────────────

describe('linked percentage income', () => {
  it('calculates amount as percentage of source line item', () => {
    const now = new Date().toISOString()
    const baseIncomeId = uuidv4()
    const baseIncome: LineItem = {
      id: baseIncomeId,
      type: 'income',
      name: 'Base Salary',
      category: 'Salary',
      amountRule: fixedAmount(5000),
      recurrenceRule: monthlyRule('2025-01-15'),
      confirmationStatus: 'confirmed',
      isOptional: false,
      createdAt: now,
      updatedAt: now
    }
    const bonusIncome: LineItem = {
      id: uuidv4(),
      type: 'income',
      name: 'Commission',
      category: 'Bonus',
      amountRule: {
        mode: 'percentageOfLineItem',
        percentage: 10,
        sourceLineItemId: baseIncomeId,
        useProjectedValues: true,
        useConfirmedValues: true
      },
      recurrenceRule: monthlyRule('2025-01-15'),
      confirmationStatus: 'confirmed',
      isOptional: false,
      createdAt: now,
      updatedAt: now
    }

    const file = makeFile({ lineItems: [baseIncome, bonusIncome] })
    const result = calculateCashFlow(file, CALC_OPT)
    const jan = result.periods.find(p => p.periodKey === '2025-01')!
    // 5000 (base) + 500 (10% of 5000) = 5500
    expect(jan.cashFlowIn).toBe(5500)
  })
})

// ── Occurrence Override ───────────────────────────────────────

describe('occurrence overrides', () => {
  it('applies amount override to a specific occurrence', () => {
    const item = incomeItem('Bonus', 1000, monthlyRule('2025-03-15'))
    const override: OccurrenceOverride = {
      id: uuidv4(),
      lineItemId: item.id,
      occurrenceDate: '2025-03-15',
      amountOverride: 1500,
      confirmationStatusOverride: 'confirmed',
      updatedAt: new Date().toISOString()
    }

    const file = makeFile({
      lineItems: [item],
      occurrenceOverrides: [override]
    })
    const result = calculateCashFlow(file, CALC_OPT)
    const mar = result.periods.find(p => p.periodKey === '2025-03')!
    expect(mar.cashFlowIn).toBe(1500)
  })
})

// ── Past Projected Income Review ──────────────────────────────

describe('past projected income review', () => {
  it('flags projected income past due date', () => {
    const now = new Date().toISOString()
    const pastDate = '2020-01-15' // Clearly in the past

    const projectedItem: LineItem = {
      id: uuidv4(),
      type: 'income',
      name: 'Past Projected',
      category: 'Freelance',
      amountRule: fixedAmount(500),
      recurrenceRule: { mode: 'singleDate', singleDate: pastDate },
      confirmationStatus: 'projected',
      isOptional: false,
      createdAt: now,
      updatedAt: now
    }

    const file = makeFile({
      lineItems: [projectedItem],
    })

    const result = calculateCashFlow(file, {
      scale: 'month',
      dateRange: { start: '2020-01-01', end: '2020-12-31' }
    })

    expect(result.pastProjectedIncomeReview.length).toBeGreaterThan(0)
    const review = result.pastProjectedIncomeReview[0]
    expect(review.lineItem.name).toBe('Past Projected')
    expect(review.daysOverdue).toBeGreaterThan(0)
  })

  it('does not flag confirmed income', () => {
    const now = new Date().toISOString()
    const confirmedItem: LineItem = {
      id: uuidv4(),
      type: 'income',
      name: 'Confirmed Income',
      category: 'Salary',
      amountRule: fixedAmount(1000),
      recurrenceRule: { mode: 'singleDate', singleDate: '2020-06-01' },
      confirmationStatus: 'confirmed',
      isOptional: false,
      createdAt: now,
      updatedAt: now
    }

    const file = makeFile({ lineItems: [confirmedItem] })
    const result = calculateCashFlow(file, {
      scale: 'month',
      dateRange: { start: '2020-01-01', end: '2020-12-31' }
    })
    expect(result.pastProjectedIncomeReview).toHaveLength(0)
  })
})

// ── Warnings ──────────────────────────────────────────────────

describe('warnings', () => {
  it('generates a negativeCumulative warning when cumulative goes negative', () => {
    const file = makeFile({
      lineItems: [
        incomeItem('Salary', 500, monthlyRule('2025-01-01')),
        expenseItem('Big Bill', 10000, { mode: 'singleDate', singleDate: '2025-06-01' })
      ]
    })
    const result = calculateCashFlow(file, CALC_OPT)
    const negativeWarning = result.warnings.find(w => w.type === 'negativeCumulative')
    expect(negativeWarning).toBeDefined()
  })
})

// ── Scale: Quarter ────────────────────────────────────────────

describe('quarterly scale', () => {
  it('generates 4 quarterly periods for a full year', () => {
    const file = makeFile({
      lineItems: [incomeItem('Salary', 3000, monthlyRule('2025-01-15'))]
    })
    const result = calculateCashFlow(file, { scale: 'quarter', dateRange: RANGE_2025 })
    expect(result.periods).toHaveLength(4)
    expect(result.periods[0].periodKey).toBe('2025-Q1')
    expect(result.periods[3].periodKey).toBe('2025-Q4')
  })

  it('aggregates monthly income into quarters correctly', () => {
    const file = makeFile({
      lineItems: [incomeItem('Salary', 1000, monthlyRule('2025-01-15'))]
    })
    const result = calculateCashFlow(file, { scale: 'quarter', dateRange: RANGE_2025 })
    // Q1: Jan+Feb+Mar = $3000
    expect(result.periods[0].cashFlowIn).toBe(3000)
  })
})

// ── Annual Report Totals ──────────────────────────────────────

describe('annual totals via yearly scale', () => {
  it('aggregates all income into a single yearly period', () => {
    const file = makeFile({
      lineItems: [
        incomeItem('Salary', 5000, monthlyRule('2025-01-01')),  // 12 × $5000 = $60,000
        expenseItem('Rent', 2000, monthlyRule('2025-01-01'))    // 12 × $2000 = $24,000
      ]
    })
    const result = calculateCashFlow(file, { scale: 'year', dateRange: RANGE_2025 })
    expect(result.periods).toHaveLength(1)
    expect(result.periods[0].cashFlowIn).toBe(60000)
    expect(result.periods[0].cashFlowOut).toBe(24000)
    expect(result.periods[0].netSurplusDeficit).toBe(36000)
  })
})

// ── Series Split Isolation ────────────────────────────────────

describe('series split isolation', () => {
  it('old series ends before split date, new series starts at split date', () => {
    const oldId = uuidv4()
    const now = new Date().toISOString()

    const oldSeries: LineItem = {
      id: oldId,
      type: 'income',
      name: 'Salary (old)',
      category: 'Salary',
      amountRule: fixedAmount(3000),
      recurrenceRule: {
        mode: 'finiteUntilDate',
        startDate: '2025-01-01',
        interval: 1,
        unit: 'month',
        untilDate: '2025-05-31',
        businessDayRule: 'none',
        specialRule: null
      },
      confirmationStatus: 'confirmed',
      isOptional: false,
      createdAt: now,
      updatedAt: now
    }

    const newSeries: LineItem = {
      id: uuidv4(),
      type: 'income',
      name: 'Salary (new)',
      category: 'Salary',
      amountRule: fixedAmount(3500),
      recurrenceRule: {
        mode: 'infinite',
        startDate: '2025-06-01',
        interval: 1,
        unit: 'month',
        businessDayRule: 'none',
        specialRule: null
      },
      confirmationStatus: 'confirmed',
      isOptional: false,
      parentSeriesId: oldId,
      splitFromDate: '2025-06-01',
      createdAt: now,
      updatedAt: now
    }

    const file = makeFile({ lineItems: [oldSeries, newSeries] })
    const result = calculateCashFlow(file, CALC_OPT)

    const jan = result.periods.find(p => p.periodKey === '2025-01')!
    const jun = result.periods.find(p => p.periodKey === '2025-06')!
    const dec = result.periods.find(p => p.periodKey === '2025-12')!

    expect(jan.cashFlowIn).toBe(3000) // Old rate
    expect(jun.cashFlowIn).toBe(3500) // New rate
    expect(dec.cashFlowIn).toBe(3500) // Still new rate
  })
})

// ── Sync-Point Balance Anchoring ──────────────────────────────

function liquidAccount(name: string, balance: number, setupDate: string): {
  account: Account
  update: AccountBalanceUpdate
} {
  const now = new Date().toISOString()
  const accountId = uuidv4()
  const account: Account = {
    id: accountId,
    name,
    type: 'checking',
    balance,
    currency: 'USD',
    liquidity: 'liquid',
    createdAt: now,
    updatedAt: now
  }
  const update: AccountBalanceUpdate = {
    id: uuidv4(),
    accountId,
    effectiveAt: setupDate + 'T00:00:00.000Z',
    balance,
    liquidity: 'liquid',
    isInitialSetup: true,
    createdAt: now,
    updatedAt: now
  }
  return { account, update }
}

describe('sync point balance anchoring', () => {
  it('carries forward the running liquid balance when no new account updates arrive', () => {
    const { account, update } = liquidAccount('Checking', 1000, '2025-01-01')
    const file = makeFile({
      accounts: [account],
      accountBalanceUpdates: [update],
      lineItems: [
        incomeItem('Salary', 500, monthlyRule('2025-01-15'))
      ]
    })
    const result = calculateCashFlow(file, CALC_OPT)

    // Each period's beginning should equal the previous period's ending
    for (let i = 1; i < result.periods.length; i++) {
      expect(result.periods[i].beginningLiquidBalance)
        .toBe(result.periods[i - 1].endingLiquidBalance)
    }

    // January should start from the account balance
    const jan = result.periods.find(p => p.periodKey === '2025-01')!
    expect(jan.beginningLiquidBalance).toBe(1000)
    expect(jan.endingLiquidBalance).toBe(1500)

    // February should carry forward, not reset
    const feb = result.periods.find(p => p.periodKey === '2025-02')!
    expect(feb.beginningLiquidBalance).toBe(1500)
  })

  it('applies a sync point when a new balance update arrives and carries forward from there', () => {
    const { account, update } = liquidAccount('Checking', 1000, '2025-01-01')

    // User records actual balance on March 15: $2500 (higher than projected)
    const now = new Date().toISOString()
    const syncUpdate: AccountBalanceUpdate = {
      id: uuidv4(),
      accountId: account.id,
      effectiveAt: '2025-03-15T00:00:00.000Z',
      balance: 2500,
      liquidity: 'liquid',
      reconciliationReason: 'manualAdjustment',
      createdAt: now,
      updatedAt: now
    }

    const file = makeFile({
      accounts: [account],
      accountBalanceUpdates: [update, syncUpdate],
      lineItems: [
        incomeItem('Salary', 500, monthlyRule('2025-01-15'))
      ]
    })
    const result = calculateCashFlow(file, CALC_OPT)

    // Jan and Feb carry forward normally (no new update)
    const jan = result.periods.find(p => p.periodKey === '2025-01')!
    const feb = result.periods.find(p => p.periodKey === '2025-02')!
    expect(jan.beginningLiquidBalance).toBe(1000)
    expect(feb.beginningLiquidBalance).toBe(1500)

    // With per-day computation, the March 15 update is first applicable on March 15
    // itself, so March is the sync month.  March income ($500 on the 15th) is added
    // on top of the synced balance: 2500 + 500 = 3000 ending balance.
    const mar = result.periods.find(p => p.periodKey === '2025-03')!
    expect(mar.isSyncPoint).toBe(true)
    expect(mar.endingLiquidBalance).toBe(3000)

    // April carries forward from March's ending (not from the raw sync value)
    const apr = result.periods.find(p => p.periodKey === '2025-04')!
    expect(apr.beginningLiquidBalance).toBe(3000)

    // May carries forward from April's ending
    const may = result.periods.find(p => p.periodKey === '2025-05')!
    expect(may.beginningLiquidBalance).toBe(apr.endingLiquidBalance)
  })

  it('marks the sync period with isSyncPoint and leaves non-sync periods without it', () => {
    const { account, update } = liquidAccount('Checking', 1000, '2025-01-01')

    const now = new Date().toISOString()
    const syncUpdate: AccountBalanceUpdate = {
      id: uuidv4(),
      accountId: account.id,
      effectiveAt: '2025-03-15T00:00:00.000Z',
      balance: 2500,
      liquidity: 'liquid',
      createdAt: now,
      updatedAt: now
    }

    const file = makeFile({
      accounts: [account],
      accountBalanceUpdates: [update, syncUpdate],
      lineItems: []
    })
    const result = calculateCashFlow(file, CALC_OPT)

    // With per-day computation, the March 15 update fires in the March daily bucket,
    // so the March monthly period is the sync point.
    const mar = result.periods.find(p => p.periodKey === '2025-03')!
    expect(mar.isSyncPoint).toBe(true)

    const jan = result.periods.find(p => p.periodKey === '2025-01')!
    const feb = result.periods.find(p => p.periodKey === '2025-02')!
    const apr = result.periods.find(p => p.periodKey === '2025-04')!
    expect(jan.isSyncPoint).toBeFalsy()
    expect(feb.isSyncPoint).toBeFalsy()
    expect(apr.isSyncPoint).toBeFalsy()
  })
})

// ── Cumulative = Running Liquid Balance ───────────────────────

describe('cumulative surplus equals running liquid balance', () => {
  it('cumulativeSurplusDeficit equals endingLiquidBalance every period when accounts exist', () => {
    const { account, update } = liquidAccount('Checking', 5000, '2025-01-01')
    const file = makeFile({
      accounts: [account],
      accountBalanceUpdates: [update],
      lineItems: [
        incomeItem('Salary', 3000, monthlyRule('2025-01-15')),
        expenseItem('Rent', 2000, monthlyRule('2025-01-01'))
      ]
    })
    const result = calculateCashFlow(file, CALC_OPT)

    for (const period of result.periods) {
      expect(period.cumulativeSurplusDeficit).toBe(period.endingLiquidBalance)
    }
  })

  it('cumulative starts from the account balance, not zero', () => {
    const { account, update } = liquidAccount('Checking', 5000, '2025-01-01')
    const file = makeFile({
      accounts: [account],
      accountBalanceUpdates: [update],
      lineItems: [
        incomeItem('Salary', 1000, monthlyRule('2025-01-15'))
      ]
    })
    const result = calculateCashFlow(file, CALC_OPT)
    const jan = result.periods.find(p => p.periodKey === '2025-01')!

    // Cumulative should be 5000 (starting balance) + 1000 (income) = 6000, not just 1000
    expect(jan.cumulativeSurplusDeficit).toBe(6000)
  })

  it('shows a deficit when expenses drain the account below zero', () => {
    const { account, update } = liquidAccount('Checking', 500, '2025-01-01')
    const file = makeFile({
      accounts: [account],
      accountBalanceUpdates: [update],
      lineItems: [
        expenseItem('BigBill', 2000, { mode: 'singleDate', singleDate: '2025-02-01' })
      ]
    })
    const result = calculateCashFlow(file, CALC_OPT)
    const feb = result.periods.find(p => p.periodKey === '2025-02')!

    // 500 starting - 2000 expense = -1500 deficit
    expect(feb.cumulativeSurplusDeficit).toBe(-1500)
    expect(feb.endingLiquidBalance).toBe(-1500)
  })

  it('sync point resets the cumulative to the new actual balance', () => {
    const { account, update } = liquidAccount('Checking', 1000, '2025-01-01')
    const now = new Date().toISOString()
    const syncUpdate: AccountBalanceUpdate = {
      id: uuidv4(),
      accountId: account.id,
      effectiveAt: '2025-03-15T00:00:00.000Z',
      balance: 8000,
      liquidity: 'liquid',
      createdAt: now,
      updatedAt: now
    }
    const file = makeFile({
      accounts: [account],
      accountBalanceUpdates: [update, syncUpdate],
      lineItems: []
    })
    const result = calculateCashFlow(file, CALC_OPT)

    // April is the sync period: cumulative resets to 8000
    const apr = result.periods.find(p => p.periodKey === '2025-04')!
    expect(apr.beginningLiquidBalance).toBe(8000)
    expect(apr.cumulativeSurplusDeficit).toBe(8000)
    expect(apr.cumulativeSurplusDeficit).toBe(apr.endingLiquidBalance)
  })
})
