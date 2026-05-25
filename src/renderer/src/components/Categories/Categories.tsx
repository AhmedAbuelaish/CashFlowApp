import React, { useState, useMemo } from 'react'
import { useAppStore } from '../../store/appStore'
import type { Category } from '../../shared/types'

function fmt(n: number, cur = 'USD') {
  return n.toLocaleString('en-US', { style: 'currency', currency: cur, minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export default function Categories() {
  const currentFile           = useAppStore(s => s.currentFile)
  const calcResult            = useAppStore(s => s.calculationResult)
  const addCategory           = useAppStore(s => s.addCategory)
  const deleteCategory        = useAppStore(s => s.deleteCategory)
  const reassignCategory      = useAppStore(s => s.reassignCategory)
  const deleteAllWithCategory = useAppStore(s => s.deleteAllWithCategory)

  const [newName,     setNewName]     = useState('')
  const [newType,     setNewType]     = useState<'income' | 'expense'>('income')
  const [addError,    setAddError]    = useState('')
  const [deleteModal, setDeleteModal] = useState<{ cat: Category; mode: 'reassign' | 'deleteAll' | null } | null>(null)
  const [reassignTo,  setReassignTo]  = useState('Other')
  const [confirmed,   setConfirmed]   = useState(false)

  const currency = currentFile?.fileMetadata.currency ?? 'USD'

  // Compute totals per category from calculation result
  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const period of calcResult?.periods ?? []) {
      for (const occ of period.occurrences) {
        totals[occ.category] = (totals[occ.category] ?? 0) + occ.amount
      }
    }
    return totals
  }, [calcResult?.periods])

  const categories = currentFile?.categories ?? []

  const incomeCategories = [...categories.filter(c => c.type === 'income')]
    .sort((a, b) => (categoryTotals[b.name] ?? 0) - (categoryTotals[a.name] ?? 0))
  const expenseCategories = [...categories.filter(c => c.type === 'expense')]
    .sort((a, b) => (categoryTotals[b.name] ?? 0) - (categoryTotals[a.name] ?? 0))

  function handleAdd() {
    if (!newName.trim()) { setAddError('Name is required.'); return }
    const exists = categories.some(c => c.type === newType && c.name.toLowerCase() === newName.trim().toLowerCase())
    if (exists) { setAddError('A category with this name already exists.'); return }
    addCategory({ name: newName.trim(), type: newType })
    setNewName(''); setAddError('')
  }

  function handleDelete() {
    if (!deleteModal) return
    if (deleteModal.mode === 'reassign') {
      reassignCategory(deleteModal.cat.id, reassignTo || 'Other')
    } else if (deleteModal.mode === 'deleteAll' && confirmed) {
      deleteAllWithCategory(deleteModal.cat.id)
    }
    setDeleteModal(null); setReassignTo('Other'); setConfirmed(false)
  }

  function renderCategoryList(cats: Category[], label: string) {
    return (
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ fontWeight: 700, color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
          {label}
        </div>
        {cats.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No categories yet.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Category</th>
                <th style={{ textAlign: 'right' }}>Total to Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cats.map(cat => (
                <tr key={cat.id}>
                  <td style={{ fontWeight: 500 }}>{cat.name}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {fmt(categoryTotals[cat.name] ?? 0, currency)}
                  </td>
                  <td>
                    <button
                      className="btn btn-xs btn-danger-ghost"
                      onClick={() => { setDeleteModal({ cat, mode: null }); setReassignTo('Other'); setConfirmed(false) }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    )
  }

  if (!currentFile) {
    return (
      <div style={{ padding: '2rem' }}>
        <div className="empty-state">
          <div className="empty-state-icon">🏷</div>
          <div className="empty-state-title">No file open</div>
          <div className="empty-state-desc">Open or create a cash-flow file to manage categories.</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: 720, height: '100%', overflow: 'auto' }}>
      <h1 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1.5rem' }}>Categories</h1>

      {/* Add new */}
      <div className="card" style={{ padding: '1rem', marginBottom: '2rem', background: 'var(--bg-card)' }}>
        <div style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' }}>
          Add Category
        </div>
        {addError && <div style={{ color: 'var(--color-expense)', fontSize: '0.82rem', marginBottom: '0.4rem' }}>{addError}</div>}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ flex: 1, margin: 0 }}>
            <label className="form-label">Name *</label>
            <input className="form-input" value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()} placeholder="e.g. Freelance" />
          </div>
          <div className="form-group" style={{ width: 140, margin: 0 }}>
            <label className="form-label">Type</label>
            <select className="form-input" value={newType} onChange={e => setNewType(e.target.value as 'income' | 'expense')}>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
          </div>
          <button className="btn btn-primary" onClick={handleAdd} style={{ marginBottom: 1 }}>Add</button>
        </div>
      </div>

      {renderCategoryList(incomeCategories, 'Income Categories')}
      {renderCategoryList(expenseCategories, 'Expense Categories')}

      {/* Delete modal */}
      {deleteModal && (
        <div className="modal-overlay" onClick={() => setDeleteModal(null)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Delete "{deleteModal.cat.name}"</h3>
              <button className="modal-close" onClick={() => setDeleteModal(null)}>✕</button>
            </div>
            <div style={{ padding: '1rem 1.5rem' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '1.25rem' }}>
                Choose how to handle line items currently assigned to this category:
              </p>

              {/* Option 1: Reassign */}
              <div
                style={{ padding: '0.75rem', borderRadius: 6, border: `2px solid ${deleteModal.mode === 'reassign' ? 'var(--color-primary, #6366f1)' : 'var(--border)'}`, marginBottom: '0.75rem', cursor: 'pointer' }}
                onClick={() => setDeleteModal(d => d ? { ...d, mode: 'reassign' } : null)}
              >
                <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '0.4rem' }}>Reassign to another category</div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>New category name:</span>
                  <input
                    className="form-input"
                    style={{ flex: 1, padding: '0.25rem 0.5rem', fontSize: '0.82rem' }}
                    value={reassignTo}
                    onChange={e => setReassignTo(e.target.value)}
                    onClick={e => { e.stopPropagation(); setDeleteModal(d => d ? { ...d, mode: 'reassign' } : null) }}
                    placeholder="Other"
                  />
                </div>
              </div>

              {/* Option 2: Delete all */}
              <div
                style={{ padding: '0.75rem', borderRadius: 6, border: `2px solid ${deleteModal.mode === 'deleteAll' ? 'var(--color-expense)' : 'var(--border)'}`, cursor: 'pointer' }}
                onClick={() => setDeleteModal(d => d ? { ...d, mode: 'deleteAll' } : null)}
              >
                <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--color-expense)', marginBottom: '0.4rem' }}>Delete category and all associated line items</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                  This will permanently delete all income/expense entries with this category. This cannot be undone.
                </div>
                {deleteModal.mode === 'deleteAll' && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
                    <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} onClick={e => e.stopPropagation()} />
                    I understand this is permanent and cannot be undone
                  </label>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', padding: '1rem 1.5rem', borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-ghost" onClick={() => setDeleteModal(null)}>Cancel</button>
              <button
                className="btn btn-danger"
                disabled={!deleteModal.mode || (deleteModal.mode === 'deleteAll' && !confirmed)}
                onClick={handleDelete}
              >
                {deleteModal.mode === 'reassign' ? 'Reassign & Delete' : 'Delete All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
