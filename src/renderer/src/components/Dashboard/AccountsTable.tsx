import React, { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import type { Account, AccountAsset, AssetValueEntry, PeriodSummary } from '../../shared/types'

interface Props {
  accounts: Account[]
  periods: PeriodSummary[]
  currency: string
}

function fmt(n: number, cur = 'USD') {
  return n.toLocaleString('en-US', { style: 'currency', currency: cur, minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

type CellStatus = 'updated-up' | 'updated-down' | 'updated-same' | 'assumed'

function getAssetPeriodInfo(
  asset: AccountAsset,
  period: PeriodSummary,
  prevPeriod: PeriodSummary | null
): { value: number; status: CellStatus } {
  const history = [...(asset.valueHistory ?? [])].sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt))
  const periodEndISO = period.periodEnd + 'T23:59:59'
  const applicable = history.filter(e => e.effectiveAt <= periodEndISO)
  const currentEntry = applicable[applicable.length - 1]
  const value = currentEntry?.value ?? asset.currentValue

  const updatedInPeriod = applicable.some(e => e.effectiveAt >= period.periodStart)
  if (!updatedInPeriod) return { value, status: 'assumed' }

  let prevValue = asset.currentValue
  if (prevPeriod) {
    const prevPeriodEnd = prevPeriod.periodEnd + 'T23:59:59'
    const prevApplicable = history.filter(e => e.effectiveAt <= prevPeriodEnd)
    const prevEntry = prevApplicable[prevApplicable.length - 1]
    prevValue = prevEntry?.value ?? asset.currentValue
  }

  if (value > prevValue) return { value, status: 'updated-up' }
  if (value < prevValue) return { value, status: 'updated-down' }
  return { value, status: 'updated-same' }
}

const STATUS_STYLE: Record<CellStatus, React.CSSProperties> = {
  'updated-up':   { color: 'var(--color-income)',   fontWeight: 600 },
  'updated-down': { color: 'var(--color-expense)',  fontWeight: 600 },
  'updated-same': { color: 'var(--text-primary)',   fontWeight: 600 },
  'assumed':      { color: 'var(--text-muted)',     fontStyle: 'italic' }
}

export default function AccountsTable({ accounts, periods, currency }: Props) {
  const rows = useMemo(() => {
    const result: Array<{ type: 'account'; account: Account } | { type: 'asset'; account: Account; asset: AccountAsset }> = []
    for (const account of accounts) {
      result.push({ type: 'account', account })
      for (const asset of account.assets ?? []) {
        result.push({ type: 'asset', account, asset })
      }
    }
    return result
  }, [accounts])

  if (accounts.length === 0) return null

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="data-table">
        <thead>
          <tr>
            <th style={{ minWidth: 200, textAlign: 'left' }}>Account / Asset</th>
            {periods.map(p => (
              <th key={p.periodKey} style={{ minWidth: 110 }}>{p.periodLabel}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => {
            if (row.type === 'account') {
              const totalByPeriod = periods.map(p => {
                const assets = row.account.assets ?? []
                return assets.reduce((sum, asset) => sum + getAssetPeriodInfo(asset, p, rowIdx > 0 ? periods[periods.indexOf(p) - 1] ?? null : null).value, 0)
              })
              return (
                <tr key={row.account.id} style={{ background: 'var(--bg-card)' }}>
                  <td style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                    {row.account.name}
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: 6, fontWeight: 400, textTransform: 'capitalize' }}>{row.account.type}</span>
                  </td>
                  {periods.map((p, pi) => (
                    <td key={p.periodKey} style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {fmt(totalByPeriod[pi], row.account.currency)}
                    </td>
                  ))}
                </tr>
              )
            }

            const { account, asset } = row
            return (
              <tr key={asset.id} className="row-income">
                <td style={{ paddingLeft: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                  <div>{asset.name}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {asset.liquidity === 'liquid' ? 'Liquid' : 'Tied up'}
                  </div>
                </td>
                {periods.map((p, pi) => {
                  const prev = pi > 0 ? periods[pi - 1] : null
                  const { value, status } = getAssetPeriodInfo(asset, p, prev)
                  return (
                    <td key={p.periodKey} style={{ fontFamily: 'var(--font-mono)', ...STATUS_STYLE[status] }}>
                      {fmt(value, asset.currency)}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
      <div style={{ marginTop: '0.4rem', display: 'flex', gap: '1.25rem', fontSize: '0.72rem', color: 'var(--text-muted)', paddingLeft: 4 }}>
        <span style={{ color: 'var(--color-income)', fontWeight: 600 }}>↑ Increased</span>
        <span style={{ color: 'var(--color-expense)', fontWeight: 600 }}>↓ Decreased</span>
        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>— Updated (unchanged)</span>
        <span style={{ fontStyle: 'italic' }}>Assumed / not updated</span>
      </div>
    </div>
  )
}
