import React, { useState } from 'react'
import { useAppStore } from '../../store/appStore'
import type { CalculationResult, PeriodSummary, Occurrence } from '../../shared/types'

interface Props {
  result: CalculationResult
  currency: string
}

function fmt(value: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}

function AmountCell({
  value,
  currency,
  type
}: {
  value: number
  currency: string
  type: 'income' | 'expense' | 'net' | 'cumulative' | 'balance'
}) {
  const absVal = Math.abs(value)
  let className = ''
  let display = fmt(Math.abs(value), currency)

  if (type === 'income') {
    className = 'amount-positive'
  } else if (type === 'expense') {
    className = value > 0 ? 'amount-negative' : 'amount-positive'
    display = value > 0 ? `(${fmt(value, currency)})` : fmt(0, currency)
  } else if (type === 'net') {
    className = value >= 0 ? 'amount-surplus' : 'amount-deficit'
    display = value >= 0 ? fmt(value, currency) : `(${fmt(-value, currency)})`
  } else if (type === 'cumulative') {
    className = value >= 0 ? 'amount-cumulative-pos' : 'amount-cumulative-neg'
    display = value >= 0 ? fmt(value, currency) : `(${fmt(-value, currency)})`
  } else {
    className = value >= 0 ? 'amount-positive' : 'amount-negative'
    display = value >= 0 ? fmt(value, currency) : `(${fmt(-value, currency)})`
  }

  return <span className={className}>{display}</span>
}

interface DrillDownProps {
  period: PeriodSummary
  currency: string
  onClose: () => void
}

function DrillDown({ period, currency, onClose }: DrillDownProps) {
  const income = period.occurrences.filter(o => o.type === 'income')
  const expenses = period.occurrences.filter(o => o.type === 'expense')
  const excluded = period.optionalExpensesExcluded

  return (
    <div style={{
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      background: 'var(--bg-panel)',
      border: '1px solid var(--border-light)',
      borderRadius: '12px',
      boxShadow: 'var(--shadow-lg)',
      width: '560px',
      maxHeight: '80vh',
      overflow: 'auto',
      zIndex: 200,
      padding: '0'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
          {period.periodLabel} — Detail
        </h3>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '18px' }}
        >✕</button>
      </div>

      <div style={{ padding: '16px 20px' }}>
        {/* Income */}
        {income.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--income)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '.5px' }}>
              Income
            </p>
            {income.map(occ => (
              <OccurrenceRow key={occ.id} occ={occ} currency={currency} />
            ))}
          </div>
        )}

        {/* Expenses */}
        {expenses.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--expense)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '.5px' }}>
              Expenses
            </p>
            {expenses.map(occ => (
              <OccurrenceRow key={occ.id} occ={occ} currency={currency} />
            ))}
          </div>
        )}

        {/* Excluded optional */}
        {excluded.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '.5px' }}>
              Optional Expenses (Excluded)
            </p>
            {excluded.map(occ => (
              <OccurrenceRow key={occ.id} occ={occ} currency={currency} excluded />
            ))}
          </div>
        )}

        {/* Summary */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <SummaryRow label="Cash Flow In"  value={period.cashFlowIn}  type="income"     currency={currency} />
          <SummaryRow label="Cash Flow Out" value={period.cashFlowOut} type="expense"    currency={currency} />
          <SummaryRow label="Net Surplus/Deficit" value={period.netSurplusDeficit} type="net" currency={currency} bold />
          <SummaryRow label="Cumulative Surplus/Deficit" value={period.cumulativeSurplusDeficit} type="cumulative" currency={currency} bold />
          <SummaryRow label="Beginning Balance" value={period.beginningLiquidBalance} type="balance" currency={currency} />
          <SummaryRow label="Ending Balance"    value={period.endingLiquidBalance}    type="balance" currency={currency} bold />
        </div>
      </div>
    </div>
  )
}

function OccurrenceRow({ occ, currency, excluded }: { occ: Occurrence; currency: string; excluded?: boolean }) {
  const [showTrace, setShowTrace] = useState(false)

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      borderBottom: '1px solid rgba(42,48,80,.5)',
      padding: '6px 0',
      opacity: excluded ? 0.5 : 1
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>
            {occ.name}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>
            {occ.date}
          </span>
          {occ.confirmationStatus === 'projected' && (
            <span className="badge badge-projected" style={{ marginLeft: '6px' }}>projected</span>
          )}
          {excluded && <span className="badge" style={{ marginLeft: '6px', background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>excluded</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: occ.type === 'income' ? 'var(--income)' : 'var(--expense)' }}>
            {occ.type === 'income' ? '+' : '-'}{fmt(occ.amount, currency)}
          </span>
          <button
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '11px' }}
            onClick={() => setShowTrace(!showTrace)}
          >
            {showTrace ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {showTrace && (
        <div style={{ marginTop: '6px', paddingLeft: '12px', borderLeft: '2px solid var(--border)' }}>
          {occ.traceability.map((t, i) => (
            <div key={i} style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{t.sourceType}</span>: {t.description}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SummaryRow({ label, value, type, currency, bold }: {
  label: string; value: number; type: 'income' | 'expense' | 'net' | 'cumulative' | 'balance'; currency: string; bold?: boolean
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: bold ? 700 : 400 }}>
      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{label}</span>
      <AmountCell value={value} currency={currency} type={type} />
    </div>
  )
}

export default function CashFlowTable({ result, currency }: Props) {
  const [drillDownPeriod, setDrillDownPeriod] = useState<PeriodSummary | null>(null)
  const currentFile = useAppStore(s => s.currentFile)
  const lineItems = currentFile?.lineItems ?? []

  const periods = result.periods

  // Build row data: line items grouped by type
  const incomeItems = lineItems.filter(li => li.type === 'income')
  const expenseItems = lineItems.filter(li => li.type === 'expense')

  const getOccurrenceAmount = (lineItemId: string, period: PeriodSummary): number => {
    return period.occurrences
      .filter(o => o.lineItemId === lineItemId)
      .reduce((s, o) => s + o.amount, 0)
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ overflowX: 'auto', overflowY: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ minWidth: '200px', textAlign: 'left' }}>Line Item</th>
              {periods.map(p => (
                <th
                  key={p.periodKey}
                  style={{ minWidth: '110px', cursor: 'pointer' }}
                  onClick={() => setDrillDownPeriod(p)}
                  title="Click to drill into period"
                >
                  <div>{p.periodLabel}</div>
                  {p.hasProjected && (
                    <div style={{ fontSize: '9px', color: 'var(--projected)', fontWeight: 400 }}>projected</div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Income section */}
            <tr>
              <td colSpan={periods.length + 1} style={{
                background: 'var(--bg-card)',
                color: 'var(--text-secondary)',
                fontSize: '10px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '.5px',
                padding: '4px 12px'
              }}>
                Income
              </td>
            </tr>
            {incomeItems.map(item => (
              <tr key={item.id} className="row-income">
                <td style={{ color: 'var(--text-primary)' }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.name}
                    {item.confirmationStatus === 'projected' && (
                      <span className="badge badge-projected" style={{ marginLeft: '6px', fontSize: '9px' }}>~</span>
                    )}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{item.category}</div>
                </td>
                {periods.map(p => {
                  const amt = getOccurrenceAmount(item.id, p)
                  return (
                    <td key={p.periodKey} style={{ fontFamily: 'var(--font-mono)' }}>
                      {amt > 0 ? (
                        <span className="amount-positive">{fmt(amt, currency)}</span>
                      ) : (
                        <span style={{ color: 'var(--text-disabled)' }}>—</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}

            {/* Total cash flow in */}
            <tr className="row-summary" style={{ background: 'rgba(52,211,153,.08)' }}>
              <td style={{ color: 'var(--income)', fontWeight: 700 }}>Total Cash Flow In</td>
              {periods.map(p => (
                <td key={p.periodKey} style={{ fontFamily: 'var(--font-mono)' }}>
                  <AmountCell value={p.cashFlowIn} currency={currency} type="income" />
                </td>
              ))}
            </tr>

            {/* Spacer */}
            <tr style={{ height: '4px' }}><td colSpan={periods.length + 1} /></tr>

            {/* Expense section */}
            <tr>
              <td colSpan={periods.length + 1} style={{
                background: 'var(--bg-card)',
                color: 'var(--text-secondary)',
                fontSize: '10px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '.5px',
                padding: '4px 12px'
              }}>
                Expenses
              </td>
            </tr>
            {expenseItems.map(item => {
              return (
                <tr key={item.id} className="row-expense">
                  <td style={{ color: 'var(--text-primary)' }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.name}
                      {item.isOptional && (
                        <span className="badge badge-optional" style={{ marginLeft: '6px', fontSize: '9px' }}>optional</span>
                      )}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{item.category}</div>
                  </td>
                  {periods.map(p => {
                    const included = p.occurrences.filter(o => o.lineItemId === item.id)
                    const excluded = p.optionalExpensesExcluded.filter(o => o.lineItemId === item.id)
                    const amt = included.reduce((s, o) => s + o.amount, 0)
                    const exclAmt = excluded.reduce((s, o) => s + o.amount, 0)

                    return (
                      <td key={p.periodKey} style={{ fontFamily: 'var(--font-mono)' }}>
                        {amt > 0 ? (
                          <span className="amount-negative">{fmt(amt, currency)}</span>
                        ) : exclAmt > 0 ? (
                          <span style={{ color: 'var(--text-disabled)', textDecoration: 'line-through', fontSize: '10px' }}>
                            {fmt(exclAmt, currency)}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-disabled)' }}>—</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}

            {/* Total cash flow out */}
            <tr className="row-summary" style={{ background: 'rgba(248,113,113,.08)' }}>
              <td style={{ color: 'var(--expense)', fontWeight: 700 }}>Total Cash Flow Out</td>
              {periods.map(p => (
                <td key={p.periodKey} style={{ fontFamily: 'var(--font-mono)' }}>
                  <AmountCell value={p.cashFlowOut} currency={currency} type="expense" />
                </td>
              ))}
            </tr>

            {/* Spacer */}
            <tr style={{ height: '8px' }}><td colSpan={periods.length + 1} style={{ borderBottom: '2px solid var(--border)' }} /></tr>

            {/* Net surplus/deficit */}
            <tr className="row-summary">
              <td style={{ color: 'var(--text-primary)', fontWeight: 700 }}>Period Net Surplus / Deficit</td>
              {periods.map(p => (
                <td key={p.periodKey} style={{ fontFamily: 'var(--font-mono)' }}>
                  <AmountCell value={p.netSurplusDeficit} currency={currency} type="net" />
                </td>
              ))}
            </tr>

            {/* Cumulative */}
            <tr className="row-summary row-cumulative">
              <td style={{ color: 'var(--cumulative-pos)', fontWeight: 700 }}>
                Cumulative Surplus / Deficit
              </td>
              {periods.map(p => (
                <td key={p.periodKey} style={{ fontFamily: 'var(--font-mono)' }}>
                  <AmountCell value={p.cumulativeSurplusDeficit} currency={currency} type="cumulative" />
                </td>
              ))}
            </tr>

            {/* Balances */}
            <tr style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ color: 'var(--text-secondary)' }}>Beginning Liquid Balance</td>
              {periods.map(p => (
                <td key={p.periodKey} style={{ fontFamily: 'var(--font-mono)' }}>
                  <AmountCell value={p.beginningLiquidBalance} currency={currency} type="balance" />
                </td>
              ))}
            </tr>
            <tr className="row-summary">
              <td style={{ color: 'var(--text-primary)', fontWeight: 700 }}>Ending Liquid Balance</td>
              {periods.map(p => (
                <td
                  key={p.periodKey}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    background: p.endingLiquidBalance < 0 ? 'rgba(248,113,113,.12)' : undefined
                  }}
                >
                  <AmountCell value={p.endingLiquidBalance} currency={currency} type="balance" />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Drill-down overlay */}
      {drillDownPeriod && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 199 }}
            onClick={() => setDrillDownPeriod(null)}
          />
          <DrillDown
            period={drillDownPeriod}
            currency={currency}
            onClose={() => setDrillDownPeriod(null)}
          />
        </>
      )}
    </div>
  )
}
