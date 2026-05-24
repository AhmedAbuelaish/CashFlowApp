// ============================================================
// CashFlow Planner — Past Projected Income Review
// Lists projected income occurrences whose dates have passed.
// ============================================================

import React, { useState } from 'react'
import { useAppStore } from '../../store/appStore'
import type { PastProjectedItem, ConfirmationStatus } from '../../shared/types'
import { format, parseISO } from 'date-fns'

interface Props {
  onClose: () => void
}

interface EditState {
  actualAmount: string
  comment: string
  status: ConfirmationStatus
}

export default function PastProjectedReview({ onClose }: Props) {
  const calculationResult = useAppStore(s => s.calculationResult)
  const upsertOccurrenceOverride = useAppStore(s => s.upsertOccurrenceOverride)

  const items = calculationResult?.pastProjectedIncomeReview ?? []

  const [edits, setEdits] = useState<Record<string, EditState>>(() => {
    const init: Record<string, EditState> = {}
    items.forEach(item => {
      const key = `${item.occurrence.lineItemId}|${item.occurrence.date}`
      init[key] = {
        actualAmount: item.existingOverride?.amountOverride != null
          ? String(item.existingOverride.amountOverride)
          : String(item.occurrence.amount),
        comment: item.existingOverride?.comment ?? '',
        status: item.existingOverride?.confirmationStatusOverride ?? 'projected'
      }
    })
    return init
  })

  const [saved, setSaved] = useState<Record<string, boolean>>({})

  function getKey(item: PastProjectedItem) {
    return `${item.occurrence.lineItemId}|${item.occurrence.date}`
  }

  function handleEdit(key: string, field: keyof EditState, value: string) {
    setEdits(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }))
  }

  function handleConfirm(item: PastProjectedItem) {
    const key = getKey(item)
    const edit = edits[key]
    const amount = parseFloat(edit.actualAmount)
    upsertOccurrenceOverride({
      lineItemId: item.occurrence.lineItemId,
      occurrenceDate: item.occurrence.date,
      amountOverride: isNaN(amount) ? undefined : amount,
      confirmationStatusOverride: 'confirmed',
      comment: edit.comment || undefined
    })
    setSaved(prev => ({ ...prev, [key]: true }))
  }

  function handleKeepProjected(item: PastProjectedItem) {
    const key = getKey(item)
    const edit = edits[key]
    upsertOccurrenceOverride({
      lineItemId: item.occurrence.lineItemId,
      occurrenceDate: item.occurrence.date,
      amountOverride: undefined,
      confirmationStatusOverride: 'projected',
      comment: edit.comment || undefined
    })
    setSaved(prev => ({ ...prev, [key]: true }))
  }

  const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 700, width: '90%' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Past Projected Income Review</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {items.length === 0 ? (
          <div className="empty-state" style={{ padding: '2rem' }}>
            <div className="empty-state-icon">✓</div>
            <div className="empty-state-title">All caught up!</div>
            <div className="empty-state-desc">No projected income items require review.</div>
          </div>
        ) : (
          <>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              {items.length} projected income occurrence{items.length !== 1 ? 's' : ''} have passed without confirmation.
              Review each one and mark as confirmed or keep as projected.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '60vh', overflowY: 'auto' }}>
              {items.map(item => {
                const key = getKey(item)
                const edit = edits[key]
                const isSaved = saved[key]
                const daysAgo = item.daysOverdue

                return (
                  <div
                    key={key}
                    className="card"
                    style={{
                      padding: '1rem',
                      border: isSaved
                        ? '1px solid var(--income)'
                        : '1px solid var(--warning)',
                      opacity: isSaved ? 0.7 : 1
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {item.lineItem.name}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                          {item.lineItem.category}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 600, color: 'var(--income)' }}>
                          {fmt(item.occurrence.amount)}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Expected {format(parseISO(item.occurrence.date), 'MMM d, yyyy')}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--warning)' }}>
                          {daysAgo} day{daysAgo !== 1 ? 's' : ''} overdue
                        </div>
                      </div>
                    </div>

                    {isSaved ? (
                      <div style={{ color: 'var(--income)', fontSize: '0.85rem' }}>
                        ✓ Saved
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
                          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                            <label className="form-label">Actual Amount</label>
                            <input
                              type="number"
                              className="form-input"
                              value={edit.actualAmount}
                              onChange={e => handleEdit(key, 'actualAmount', e.target.value)}
                              step="0.01"
                            />
                          </div>
                          <div className="form-group" style={{ flex: 2, marginBottom: 0 }}>
                            <label className="form-label">Comment (optional)</label>
                            <input
                              type="text"
                              className="form-input"
                              value={edit.comment}
                              placeholder="e.g. Received late, partial payment..."
                              onChange={e => handleEdit(key, 'comment', e.target.value)}
                            />
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                          <button
                            className="btn btn-secondary"
                            style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
                            onClick={() => handleKeepProjected(item)}
                          >
                            Keep Projected
                          </button>
                          <button
                            className="btn btn-primary"
                            style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem', background: 'var(--income)' }}
                            onClick={() => handleConfirm(item)}
                          >
                            Mark Confirmed
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
