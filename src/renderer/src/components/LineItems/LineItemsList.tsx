// ============================================================
// CashFlow Planner — Line Items List
// Searchable, filterable list with inline split and edit.
// ============================================================

import React, { useState, useMemo } from 'react'
import { useAppStore } from '../../store/appStore'
import type { LineItem, LineItemType } from '../../shared/types'
import LineItemForm from './LineItemForm'
import OccurrencesList from './OccurrencesList'
import { format, parseISO } from 'date-fns'
import Modal from '../shared/Modal'

export default function LineItemsList() {
  const currentFile = useAppStore(s => s.currentFile)
  const deleteLineItem = useAppStore(s => s.deleteLineItem)
  const splitLineItem = useAppStore(s => s.splitLineItem)

  const lineItems = currentFile?.lineItems ?? []

  // ── UI state ──────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<'all' | LineItemType>('all')
  const [filterCategory, setFilterCategory] = useState('all')
  const [editingItem, setEditingItem] = useState<LineItem | null>(null)
  const [viewingOccurrences, setViewingOccurrences] = useState<LineItem | null>(null)
  const [showAddForm, setShowAddForm] = useState<{ type: LineItemType } | null>(null)
  const [splitTarget, setSplitTarget] = useState<LineItem | null>(null)
  const [splitDate, setSplitDate] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<LineItem | null>(null)

  // ── Derived ───────────────────────────────────────────────
  const allCategories = useMemo(() => {
    const cats = new Set(lineItems.map(li => li.category))
    return Array.from(cats).sort()
  }, [lineItems])

  const filtered = useMemo(() => {
    let items = lineItems
    if (filterType !== 'all') items = items.filter(li => li.type === filterType)
    if (filterCategory !== 'all') items = items.filter(li => li.category === filterCategory)
    if (search.trim()) {
      const q = search.toLowerCase()
      items = items.filter(li =>
        li.name.toLowerCase().includes(q) ||
        li.category.toLowerCase().includes(q) ||
        (li.seriesComment ?? '').toLowerCase().includes(q)
      )
    }
    return [...items].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'income' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }, [lineItems, filterType, filterCategory, search])

  // ── Split handler ─────────────────────────────────────────
  function handleSplit() {
    if (!splitTarget || !splitDate) return
    const newItem: Omit<LineItem, 'id' | 'createdAt' | 'updatedAt'> = {
      ...splitTarget,
      recurrenceRule: {
        ...splitTarget.recurrenceRule,
        startDate: splitDate,
        mode: splitTarget.recurrenceRule.mode === 'finiteByCount' ? 'infinite' : splitTarget.recurrenceRule.mode,
        count: undefined
      },
      parentSeriesId: splitTarget.id,
      splitFromDate: splitDate,
      seriesComment: splitTarget.seriesComment
    }
    splitLineItem(splitTarget.id, splitDate, newItem)
    setSplitTarget(null)
    setSplitDate('')
  }

  const fmt = (rule: LineItem['amountRule']) => {
    if (rule.mode === 'fixed') return `$${(rule.fixedAmount ?? 0).toLocaleString()}`
    if (rule.mode === 'percentageOfLineItem') return `${rule.percentage}% of line item`
    return `${rule.percentage}% of ${rule.sourceCategory}`
  }

  const fmtRecurrence = (rule: LineItem['recurrenceRule']) => {
    switch (rule.mode) {
      case 'singleDate': return `Once on ${rule.singleDate ?? '—'}`
      case 'specificDates': return `${(rule.specificDates ?? []).length} specific dates`
      case 'finiteByCount': return `Every ${rule.interval} ${rule.unit}(s) × ${rule.count}`
      case 'finiteUntilDate': return `Every ${rule.interval} ${rule.unit}(s) until ${rule.untilDate ?? '—'}`
      case 'infinite': return rule.specialRule
        ? rule.specialRule === 'firstBusinessDayOfMonth' ? 'First biz day/month' : 'Last biz day/month'
        : `Every ${rule.interval} ${rule.unit}(s)`
      default: return '—'
    }
  }

  return (
    <div style={{ padding: '1.5rem', height: '100%', overflow: 'auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Line Items</h1>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
            {lineItems.length} item{lineItems.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-primary" style={{ background: 'var(--income)' }}
            onClick={() => setShowAddForm({ type: 'income' })}>
            + Income
          </button>
          <button className="btn btn-primary" style={{ background: 'var(--expense)' }}
            onClick={() => setShowAddForm({ type: 'expense' })}>
            + Expense
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input
          className="form-input"
          style={{ flex: 1, minWidth: 200 }}
          placeholder="Search by name, category, or comment…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="form-input" style={{ width: 140 }} value={filterType}
          onChange={e => setFilterType(e.target.value as any)}>
          <option value="all">All Types</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
        <select className="form-input" style={{ width: 160 }} value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}>
          <option value="all">All Categories</option>
          {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Empty state */}
      {lineItems.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <div className="empty-state-title">No line items yet</div>
          <div className="empty-state-desc">Add your first income or expense to get started.</div>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '1rem' }}>
            <button className="btn btn-primary" style={{ background: 'var(--income)' }}
              onClick={() => setShowAddForm({ type: 'income' })}>+ Add Income</button>
            <button className="btn btn-primary" style={{ background: 'var(--expense)' }}
              onClick={() => setShowAddForm({ type: 'expense' })}>+ Add Expense</button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <div className="empty-state-title">No results</div>
          <div className="empty-state-desc">Try adjusting your search or filters.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filtered.map(item => (
            <div key={item.id} className="card" style={{
              padding: '0.9rem 1rem',
              border: `1px solid ${item.type === 'income' ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)'}`,
              display: 'flex', alignItems: 'center', gap: '1rem'
            }}>
              {/* Type pill */}
              <div style={{
                padding: '3px 8px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 700,
                background: item.type === 'income' ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)',
                color: item.type === 'income' ? 'var(--income)' : 'var(--expense)',
                whiteSpace: 'nowrap', flexShrink: 0
              }}>
                {item.type === 'income' ? '↑ IN' : '↓ OUT'}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.name}
                  </span>
                  {item.isOptional && (
                    <span style={{ fontSize: '0.7rem', padding: '1px 5px', borderRadius: 3, background: 'rgba(167,139,250,0.15)', color: 'var(--cumulative-pos)', flexShrink: 0 }}>
                      optional
                    </span>
                  )}
                  {item.confirmationStatus === 'projected' && (
                    <span style={{ fontSize: '0.7rem', padding: '1px 5px', borderRadius: 3, background: 'rgba(251,191,36,0.12)', color: 'var(--warning)', flexShrink: 0 }}>
                      projected
                    </span>
                  )}
                  {item.parentSeriesId && (
                    <span style={{ fontSize: '0.7rem', padding: '1px 5px', borderRadius: 3, background: 'rgba(96,165,250,0.12)', color: 'var(--surplus)', flexShrink: 0 }}>
                      split series
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  {item.category} · {fmt(item.amountRule)} · {fmtRecurrence(item.recurrenceRule)}
                </div>
                {item.seriesComment && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2, fontStyle: 'italic' }}>
                    "{item.seriesComment}"
                  </div>
                )}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                  onClick={() => setViewingOccurrences(item)}>
                  Dates
                </button>
                <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                  onClick={() => setSplitTarget(item)}>
                  Split
                </button>
                <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                  onClick={() => setEditingItem(item)}>
                  Edit
                </button>
                <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', color: 'var(--expense)' }}
                  onClick={() => setDeleteConfirm(item)}>
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Form Modal */}
      {showAddForm && (
        <LineItemForm
          mode="add"
          itemType={showAddForm.type}
          onClose={() => setShowAddForm(null)}
        />
      )}

      {/* Edit Form Modal */}
      {editingItem && (
        <LineItemForm
          mode="edit"
          lineItem={editingItem}
          onClose={() => setEditingItem(null)}
        />
      )}

      {/* Occurrences Modal */}
      {viewingOccurrences && (
        <OccurrencesList
          lineItem={viewingOccurrences}
          onClose={() => setViewingOccurrences(null)}
        />
      )}

      {/* Split Modal */}
      {splitTarget && (
        <div className="modal-overlay" onClick={() => setSplitTarget(null)}>
          <div className="modal" style={{ maxWidth: 480, width: '90%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Split Series</h2>
              <button className="modal-close" onClick={() => setSplitTarget(null)}>✕</button>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              Splitting <strong style={{ color: 'var(--text-primary)' }}>{splitTarget.name}</strong>.
              The original series will end before the effective date.
              A new series starting on the effective date will be created — you can then edit the new series.
            </p>
            <div className="form-group">
              <label className="form-label">Effective Date (new series starts here) *</label>
              <input
                type="date"
                className="form-input"
                value={splitDate}
                onChange={e => setSplitDate(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
              <button className="btn btn-secondary" onClick={() => setSplitTarget(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSplit} disabled={!splitDate}>
                Split Series
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal" style={{ maxWidth: 400, width: '90%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Delete Line Item?</h2>
              <button className="modal-close" onClick={() => setDeleteConfirm(null)}>✕</button>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              Are you sure you want to delete <strong style={{ color: 'var(--text-primary)' }}>{deleteConfirm.name}</strong>?
              All associated occurrence overrides will also be removed. This cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ background: 'var(--expense)' }}
                onClick={() => { deleteLineItem(deleteConfirm.id); setDeleteConfirm(null) }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
