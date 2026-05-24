// ============================================================
// CashFlow Planner — Occurrences List
// Shows generated occurrences for a line item with override support.
// ============================================================

import React, { useState, useMemo } from 'react'
import { useAppStore } from '../../store/appStore'
import type { LineItem, OccurrenceOverride, ConfirmationStatus } from '../../shared/types'
import { generateOccurrences } from '../../shared/engine/recurrence'
import { format, parseISO, subMonths, addMonths } from 'date-fns'

interface Props {
  lineItem: LineItem
  onClose: () => void
}

export default function OccurrencesList({ lineItem, onClose }: Props) {
  const upsertOccurrenceOverride = useAppStore(s => s.upsertOccurrenceOverride)
  const currentFile = useAppStore(s => s.currentFile)

  const overrides = useMemo(() =>
    (currentFile?.occurrenceOverrides ?? []).filter(o => o.lineItemId === lineItem.id),
    [currentFile?.occurrenceOverrides, lineItem.id]
  )

  // Generate occurrences for a wide range
  const [rangeStart] = useState(() => format(subMonths(new Date(), 6), 'yyyy-MM-dd'))
  const [rangeEnd] = useState(() => format(addMonths(new Date(), 24), 'yyyy-MM-dd'))

  const occurrences = useMemo(() => {
    try {
      return generateOccurrences(lineItem, { start: rangeStart, end: rangeEnd })
    } catch {
      return []
    }
  }, [lineItem, rangeStart, rangeEnd])

  const overrideMap = useMemo(() => {
    const m: Record<string, OccurrenceOverride> = {}
    overrides.forEach(o => { m[o.occurrenceDate] = o })
    return m
  }, [overrides])

  // Per-occurrence edit state
  const [editing, setEditing] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editStatus, setEditStatus] = useState<ConfirmationStatus>('projected')
  const [editComment, setEditComment] = useState('')

  function startEdit(date: string) {
    const ov = overrideMap[date]
    const occ = occurrences.find(o => o.date === date)
    setEditAmount(ov?.amountOverride != null ? String(ov.amountOverride) : String(occ?.amount ?? ''))
    setEditStatus(ov?.confirmationStatusOverride ?? occ?.confirmationStatus ?? 'projected')
    setEditComment(ov?.comment ?? '')
    setEditing(date)
  }

  function saveEdit(date: string) {
    const amount = parseFloat(editAmount)
    upsertOccurrenceOverride({
      lineItemId: lineItem.id,
      occurrenceDate: date,
      amountOverride: isNaN(amount) ? undefined : amount,
      confirmationStatusOverride: editStatus,
      comment: editComment || undefined
    })
    setEditing(null)
  }

  function clearOverride(date: string) {
    upsertOccurrenceOverride({
      lineItemId: lineItem.id,
      occurrenceDate: date,
      amountOverride: undefined,
      confirmationStatusOverride: undefined,
      comment: undefined
    })
  }

  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  const fmtDate = (d: string) => { try { return format(parseISO(d), 'MMM d, yyyy') } catch { return d } }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 680, width: '95%', maxHeight: '88vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Occurrences — {lineItem.name}</h2>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {lineItem.category} · {lineItem.recurrenceRule.mode} · Showing ±6 months from today
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {occurrences.length === 0 ? (
          <div className="empty-state" style={{ padding: '2rem' }}>
            <div className="empty-state-icon">📅</div>
            <div className="empty-state-title">No occurrences in range</div>
            <div className="empty-state-desc">Adjust the recurrence rule to generate occurrences.</div>
          </div>
        ) : (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-base)', position: 'sticky', top: 0 }}>
                  <th style={{ padding: '0.6rem 1rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Date</th>
                  <th style={{ padding: '0.6rem 1rem', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Amount</th>
                  <th style={{ padding: '0.6rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Status</th>
                  <th style={{ padding: '0.6rem 1rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Note</th>
                  <th style={{ padding: '0.6rem 1rem', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {occurrences.map(occ => {
                  const ov = overrideMap[occ.date]
                  const isPast = occ.date < todayStr
                  const isEditing = editing === occ.date
                  const displayAmount = ov?.amountOverride ?? occ.amount
                  const displayStatus = ov?.confirmationStatusOverride ?? occ.confirmationStatus
                  const isOverridden = !!ov

                  return (
                    <React.Fragment key={occ.date}>
                      <tr
                        style={{
                          background: isPast ? 'rgba(255,255,255,0.02)' : 'transparent',
                          borderBottom: '1px solid var(--border)',
                          opacity: isPast ? 0.75 : 1
                        }}
                      >
                        <td style={{ padding: '0.6rem 1rem', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                          {fmtDate(occ.date)}
                          {isPast && <span style={{ marginLeft: 6, fontSize: '0.7rem', color: 'var(--text-muted)' }}>past</span>}
                          {isOverridden && <span style={{ marginLeft: 6, fontSize: '0.7rem', color: 'var(--warning)', background: 'rgba(251,191,36,0.1)', padding: '1px 4px', borderRadius: 3 }}>override</span>}
                        </td>
                        <td style={{ padding: '0.6rem 1rem', textAlign: 'right', fontWeight: 600, color: lineItem.type === 'income' ? 'var(--income)' : 'var(--expense)' }}>
                          {fmt(displayAmount)}
                          {isOverridden && ov.amountOverride != null && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                              orig: {fmt(occ.amount)}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>
                          <span style={{
                            fontSize: '0.72rem', padding: '2px 6px', borderRadius: 4, fontWeight: 600,
                            background: displayStatus === 'confirmed' ? 'rgba(52,211,153,0.15)' : 'rgba(251,191,36,0.12)',
                            color: displayStatus === 'confirmed' ? 'var(--income)' : 'var(--warning)'
                          }}>
                            {displayStatus}
                          </span>
                        </td>
                        <td style={{ padding: '0.6rem 1rem', color: 'var(--text-muted)', fontSize: '0.78rem', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ov?.comment ?? '—'}
                        </td>
                        <td style={{ padding: '0.6rem 1rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button
                            className="btn btn-secondary"
                            style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem', marginRight: 4 }}
                            onClick={() => startEdit(occ.date)}
                          >
                            Edit
                          </button>
                          {isOverridden && (
                            <button
                              className="btn btn-secondary"
                              style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem', color: 'var(--expense)' }}
                              onClick={() => clearOverride(occ.date)}
                            >
                              Clear
                            </button>
                          )}
                        </td>
                      </tr>

                      {isEditing && (
                        <tr>
                          <td colSpan={5} style={{ padding: '0.75rem 1rem', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                              <div className="form-group" style={{ flex: 1, minWidth: 120, marginBottom: 0 }}>
                                <label className="form-label">Override Amount</label>
                                <input type="number" className="form-input" value={editAmount}
                                  onChange={e => setEditAmount(e.target.value)} step="0.01" />
                              </div>
                              <div className="form-group" style={{ flex: 1, minWidth: 140, marginBottom: 0 }}>
                                <label className="form-label">Status</label>
                                <select className="form-input" value={editStatus}
                                  onChange={e => setEditStatus(e.target.value as ConfirmationStatus)}>
                                  <option value="projected">Projected</option>
                                  <option value="confirmed">Confirmed</option>
                                </select>
                              </div>
                              <div className="form-group" style={{ flex: 2, minWidth: 160, marginBottom: 0 }}>
                                <label className="form-label">Comment</label>
                                <input type="text" className="form-input" value={editComment}
                                  onChange={e => setEditComment(e.target.value)}
                                  placeholder="Optional note…" />
                              </div>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
                                  onClick={() => saveEdit(occ.date)}>Save</button>
                                <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
                                  onClick={() => setEditing(null)}>Cancel</button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '1rem', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
