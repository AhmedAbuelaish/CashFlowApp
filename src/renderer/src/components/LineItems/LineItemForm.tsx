// ============================================================
// CashFlow Planner — Line Item Form
// Add or edit an income or expense line item.
// ============================================================

import React, { useState, useEffect } from 'react'
import { useAppStore } from '../../store/appStore'
import type {
  LineItem,
  LineItemType,
  RecurrenceRule,
  AmountRule,
  ConditionalRule,
  ConfirmationStatus
} from '../../shared/types'
import { generateOccurrences } from '../../shared/engine/recurrence'
import { format, parseISO, addMonths } from 'date-fns'

type Props =
  | {
      mode: 'add'
      itemType?: LineItemType
      onClose: () => void
      onSaved?: (id: string) => void
    }
  | {
      mode: 'edit'
      lineItem: LineItem
      onClose: () => void
      onSaved?: (id: string) => void
    }

function today() {
  return format(new Date(), 'yyyy-MM-dd')
}

function defaultRecurrence(): RecurrenceRule {
  return {
    mode: 'infinite',
    startDate: today(),
    interval: 1,
    unit: 'month',
    businessDayRule: 'none',
    specialRule: null
  }
}

function defaultAmount(): AmountRule {
  return {
    mode: 'fixed',
    fixedAmount: 0,
    percentage: undefined,
    sourceLineItemId: undefined,
    sourceCategory: undefined,
    useProjectedValues: true,
    useConfirmedValues: true
  }
}

export default function LineItemForm(props: Props) {
  const { onClose, onSaved } = props

  const addLineItem = useAppStore(s => s.addLineItem)
  const updateLineItem = useAppStore(s => s.updateLineItem)
  const currentFile = useAppStore(s => s.currentFile)

  const isEdit = props.mode === 'edit'
  const existingItem = isEdit ? (props as any).lineItem as LineItem : null

  // ── Form state ────────────────────────────────────────────

  const [type, setType] = useState<LineItemType>(
    existingItem?.type ?? (props.mode === 'add' ? (props as any).itemType ?? 'income' : 'income')
  )
  const [name, setName] = useState(existingItem?.name ?? '')
  const [category, setCategory] = useState(existingItem?.category ?? '')
  const [customCategory, setCustomCategory] = useState('')
  const [seriesComment, setSeriesComment] = useState(existingItem?.seriesComment ?? '')
  const [confirmationStatus, setConfirmationStatus] = useState<ConfirmationStatus>(
    existingItem?.confirmationStatus ?? 'projected'
  )
  const [isOptional, setIsOptional] = useState(existingItem?.isOptional ?? false)
  const [amountRule, setAmountRule] = useState<AmountRule>(existingItem?.amountRule ?? defaultAmount())
  const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule>(
    existingItem?.recurrenceRule ?? defaultRecurrence()
  )
  const [optionalRule, setOptionalRule] = useState<ConditionalRule>(
    existingItem?.optionalRule ?? { mode: 'includeIfPeriodSurplusGreaterThan', threshold: 0 }
  )

  const [errors, setErrors] = useState<string[]>([])
  const [previewOccurrences, setPreviewOccurrences] = useState<string[]>([])
  const [showPreview, setShowPreview] = useState(false)

  const allCategories = useAppStore(s => s.currentFile?.categories ?? [])
  const typedCategories = allCategories.filter(c => c.type === type)

  const isOneTime = ['singleDate', 'specificDates'].includes(recurrenceRule.mode)
  const [scheduleType, setScheduleType] = useState<'onetime' | 'recurring'>(isOneTime ? 'onetime' : 'recurring')
  const [finiteMode, setFiniteMode] = useState<'byCount' | 'untilDate'>(
    recurrenceRule.mode === 'finiteByCount' ? 'byCount' : 'untilDate'
  )
  const [noEnd, setNoEnd] = useState(recurrenceRule.mode === 'infinite')

  const lineItems = currentFile?.lineItems ?? []
  const incomeItems = lineItems.filter(li => li.id !== existingItem?.id && li.amountRule.mode === 'fixed')

  // ── Computed ──────────────────────────────────────────────

  const effectiveCategory = category === '__custom__' ? customCategory : category

  // ── Validation ────────────────────────────────────────────

  function validate(): string[] {
    const errs: string[] = []
    if (!name.trim()) errs.push('Name is required.')
    if (!effectiveCategory.trim()) errs.push('Category is required.')

    if (amountRule.mode === 'fixed') {
      if (amountRule.fixedAmount == null || isNaN(amountRule.fixedAmount) || amountRule.fixedAmount < 0)
        errs.push('Amount must be a non-negative number.')
    } else if (amountRule.mode === 'percentageOfLineItem') {
      if (!amountRule.sourceLineItemId) errs.push('Source line item is required for percentage mode.')
      if (amountRule.percentage == null || isNaN(amountRule.percentage) || amountRule.percentage <= 0)
        errs.push('Percentage must be a positive number.')
      if (amountRule.sourceLineItemId === existingItem?.id)
        errs.push('A line item cannot reference itself as a linked source.')
    } else if (amountRule.mode === 'percentageOfCategory') {
      if (!amountRule.sourceCategory) errs.push('Source category is required.')
      if (amountRule.percentage == null || isNaN(amountRule.percentage) || amountRule.percentage <= 0)
        errs.push('Percentage must be a positive number.')
    }

    const rr = recurrenceRule
    if (scheduleType === 'onetime') {
      if (!rr.specificDates || rr.specificDates.length === 0) errs.push('At least one date is required.')
    } else {
      if (!rr.startDate) errs.push('Start date is required.')
      if (!rr.interval || rr.interval < 1) errs.push('Interval must be at least 1.')
      if (!rr.unit) errs.push('Recurrence unit is required.')
      if (!noEnd) {
        if (finiteMode === 'byCount' && (!rr.count || rr.count < 1)) errs.push('Count must be at least 1.')
        if (finiteMode === 'untilDate') {
          if (!rr.untilDate) errs.push('End date is required.')
          if (rr.startDate && rr.untilDate && rr.untilDate <= rr.startDate) errs.push('End date must be after start date.')
        }
      }
    }
    if (isOptional && isNaN(optionalRule.threshold))
      errs.push('Optional threshold must be a number.')
    return errs
  }

  // ── Preview occurrences ───────────────────────────────────

  function handlePreview() {
    const previewRange = {
      start: today(),
      end: format(addMonths(new Date(), 12), 'yyyy-MM-dd')
    }
    try {
      const occ = generateOccurrences(
        { ...buildLineItem(), id: '__preview__', createdAt: '', updatedAt: '' },
        previewRange
      )
      setPreviewOccurrences(occ.map(o => o.date).slice(0, 20))
      setShowPreview(true)
    } catch (e) {
      setPreviewOccurrences([])
      setShowPreview(true)
    }
  }

  function buildLineItem(): Omit<LineItem, 'id' | 'createdAt' | 'updatedAt'> {
    return {
      type,
      name: name.trim(),
      category: effectiveCategory.trim(),
      amountRule,
      recurrenceRule,
      confirmationStatus,
      isOptional,
      optionalRule: isOptional ? optionalRule : undefined,
      seriesComment: seriesComment || undefined
    }
  }

  function handleSave() {
    const errs = validate()
    if (errs.length > 0) { setErrors(errs); return }
    setErrors([])
    const data = buildLineItem()
    if (isEdit && existingItem) {
      updateLineItem(existingItem.id, data)
      onSaved?.(existingItem.id)
    } else {
      const id = addLineItem(data)
      onSaved?.(id)
    }
    onClose()
  }

  // ── Specific dates helper ─────────────────────────────────

  const [newSpecificDate, setNewSpecificDate] = useState('')

  function addSpecificDate() {
    if (!newSpecificDate) return
    setRecurrenceRule(prev => ({
      ...prev,
      specificDates: [...(prev.specificDates ?? []), newSpecificDate].sort()
    }))
    setNewSpecificDate('')
  }

  function removeSpecificDate(d: string) {
    setRecurrenceRule(prev => ({
      ...prev,
      specificDates: (prev.specificDates ?? []).filter(x => x !== d)
    }))
  }

  const fmt = (d: string) => { try { return format(parseISO(d), 'MMM d, yyyy') } catch { return d } }

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 680, width: '95%', maxHeight: '92vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="modal-title">
            {isEdit ? `Edit ${existingItem?.type === 'income' ? 'Income' : 'Expense'}` : 'Add Line Item'}
          </h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Type toggle (add mode only) */}
        {!isEdit && (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
            {(['income', 'expense'] as LineItemType[]).map(t => (
              <button
                key={t}
                onClick={() => { setType(t); setCategory('') }}
                style={{
                  flex: 1, padding: '0.5rem', border: 'none', borderRadius: 6, cursor: 'pointer',
                  fontWeight: 600, fontSize: '0.9rem',
                  background: type === t
                    ? (t === 'income' ? 'var(--income)' : 'var(--expense)')
                    : 'var(--bg-card)',
                  color: type === t ? '#fff' : 'var(--text-muted)'
                }}
              >
                {t === 'income' ? '↑ Income' : '↓ Expense'}
              </button>
            ))}
          </div>
        )}

        {/* Errors */}
        {errors.length > 0 && (
          <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid var(--expense)', borderRadius: 6, padding: '0.75rem', marginBottom: '1rem' }}>
            {errors.map((e, i) => <div key={i} style={{ fontSize: '0.82rem', color: 'var(--expense)' }}>• {e}</div>)}
          </div>
        )}

        {/* Basic info */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label className="form-label">Name *</label>
            <input
              className="form-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={type === 'income' ? 'e.g. Monthly Salary' : 'e.g. Mortgage Payment'}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Category *</label>
            <select className="form-input" value={category} onChange={e => setCategory(e.target.value)}>
              <option value="">— Select —</option>
              {typedCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              <option value="__custom__">Custom…</option>
            </select>
          </div>

          {category === '__custom__' && (
            <div className="form-group">
              <label className="form-label">Custom Category *</label>
              <input
                className="form-input"
                value={customCategory}
                onChange={e => setCustomCategory(e.target.value)}
                placeholder="Enter category name"
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Status</label>
            <select
              className="form-input"
              value={confirmationStatus}
              onChange={e => setConfirmationStatus(e.target.value as ConfirmationStatus)}
            >
              <option value="projected">Projected / Estimated</option>
              <option value="confirmed">Confirmed</option>
            </select>
          </div>
        </div>

        {/* Amount Section */}
        <div style={{ marginTop: '1rem' }}>
          <div style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' }}>
            Amount
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Amount Type</label>
              <select
                className="form-input"
                value={amountRule.mode}
                onChange={e => setAmountRule(prev => ({ ...prev, mode: e.target.value as AmountRule['mode'] }))}
              >
                <option value="fixed">Fixed Amount</option>
                <option value="percentageOfLineItem">% of Line Item</option>
                <option value="percentageOfCategory">% of Category</option>
              </select>
            </div>

            {amountRule.mode === 'fixed' && (
              <div className="form-group">
                <label className="form-label">Amount *</label>
                <input
                  type="number"
                  className="form-input"
                  value={amountRule.fixedAmount ?? ''}
                  onChange={e => setAmountRule(prev => ({ ...prev, fixedAmount: parseFloat(e.target.value) || 0 }))}
                  min="0" step="0.01"
                  placeholder="0.00"
                />
              </div>
            )}

            {amountRule.mode === 'percentageOfLineItem' && (
              <>
                <div className="form-group">
                  <label className="form-label">Percentage *</label>
                  <input
                    type="number"
                    className="form-input"
                    value={amountRule.percentage ?? ''}
                    onChange={e => setAmountRule(prev => ({ ...prev, percentage: parseFloat(e.target.value) || 0 }))}
                    min="0" max="100" step="0.1"
                    placeholder="e.g. 10"
                  />
                </div>
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label className="form-label">Source Line Item *</label>
                  <select
                    className="form-input"
                    value={amountRule.sourceLineItemId ?? ''}
                    onChange={e => setAmountRule(prev => ({ ...prev, sourceLineItemId: e.target.value || undefined }))}
                  >
                    <option value="">— Select Source —</option>
                    {incomeItems.map(li => (
                      <option key={li.id} value={li.id}>{li.name} ({li.category})</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label className="form-label">Use Values</label>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: 'var(--text-primary)' }}>
                      <input type="checkbox" checked={amountRule.useConfirmedValues}
                        onChange={e => setAmountRule(prev => ({ ...prev, useConfirmedValues: e.target.checked }))} />
                      Confirmed
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: 'var(--text-primary)' }}>
                      <input type="checkbox" checked={amountRule.useProjectedValues}
                        onChange={e => setAmountRule(prev => ({ ...prev, useProjectedValues: e.target.checked }))} />
                      Projected
                    </label>
                  </div>
                </div>
              </>
            )}

            {amountRule.mode === 'percentageOfCategory' && (
              <>
                <div className="form-group">
                  <label className="form-label">Percentage *</label>
                  <input
                    type="number"
                    className="form-input"
                    value={amountRule.percentage ?? ''}
                    onChange={e => setAmountRule(prev => ({ ...prev, percentage: parseFloat(e.target.value) || 0 }))}
                    min="0" max="100" step="0.1"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Source Category *</label>
                  <select
                    className="form-input"
                    value={amountRule.sourceCategory ?? ''}
                    onChange={e => setAmountRule(prev => ({ ...prev, sourceCategory: e.target.value || undefined }))}
                  >
                    <option value="">— Select Category —</option>
                    {allCategories.map(c => (
                      <option key={c.id} value={c.name}>{c.name} ({c.type})</option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Schedule */}
        <div style={{ marginTop: '1.25rem' }}>
          <div style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' }}>
            Schedule
          </div>

          {/* One-time / Recurring toggle */}
          <div style={{ display: 'flex', gap: '0', marginBottom: '1rem', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)', width: 'fit-content' }}>
            {(['onetime', 'recurring'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => {
                  setScheduleType(mode)
                  if (mode === 'onetime') {
                    setRecurrenceRule(prev => ({ ...prev, mode: 'specificDates', specificDates: prev.specificDates ?? [] }))
                  } else {
                    const rMode = noEnd ? 'infinite' : finiteMode === 'byCount' ? 'finiteByCount' : 'finiteUntilDate'
                    setRecurrenceRule(prev => ({ ...prev, mode: rMode, startDate: prev.startDate ?? today(), interval: prev.interval ?? 1, unit: prev.unit ?? 'month' }))
                  }
                }}
                style={{
                  padding: '0.35rem 0.9rem', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem',
                  background: scheduleType === mode ? 'var(--color-primary, #6366f1)' : 'var(--bg-card)',
                  color: scheduleType === mode ? '#fff' : 'var(--text-muted)'
                }}
              >
                {mode === 'onetime' ? 'One-time' : 'Recurring'}
              </button>
            ))}
          </div>

          {/* One-time: date picker */}
          {scheduleType === 'onetime' && (
            <div className="form-group">
              <label className="form-label">Date(s) *</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input
                  type="date" className="form-input" value={newSpecificDate}
                  onChange={e => setNewSpecificDate(e.target.value)} style={{ flex: 1 }}
                />
                <button className="btn btn-secondary" onClick={addSpecificDate} style={{ whiteSpace: 'nowrap' }}>Add Date</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(recurrenceRule.specificDates ?? []).map(d => (
                  <span key={d} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                    {fmt(d)}
                    <button onClick={() => removeSpecificDate(d)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.75rem' }}>✕</button>
                  </span>
                ))}
              </div>
              {(recurrenceRule.specificDates ?? []).length === 0 && (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>Add one or more dates above.</div>
              )}
            </div>
          )}

          {/* Recurring: interval + end */}
          {scheduleType === 'recurring' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label className="form-label">Start Date *</label>
                  <input type="date" className="form-input" value={recurrenceRule.startDate ?? ''} onChange={e => setRecurrenceRule(prev => ({ ...prev, startDate: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Every</label>
                  <input type="number" className="form-input" value={recurrenceRule.interval ?? 1} onChange={e => setRecurrenceRule(prev => ({ ...prev, interval: parseInt(e.target.value) || 1 }))} min="1" />
                </div>
                <div className="form-group">
                  <label className="form-label">Unit</label>
                  <select className="form-input" value={recurrenceRule.unit ?? 'month'} onChange={e => setRecurrenceRule(prev => ({ ...prev, unit: e.target.value as RecurrenceRule['unit'] }))}>
                    <option value="day">Day(s)</option>
                    <option value="week">Week(s)</option>
                    <option value="month">Month(s)</option>
                    <option value="year">Year(s)</option>
                  </select>
                </div>
              </div>

              {recurrenceRule.unit === 'month' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label">Special Day Rule</label>
                    <select className="form-input" value={recurrenceRule.specialRule ?? ''} onChange={e => setRecurrenceRule(prev => ({ ...prev, specialRule: (e.target.value || null) as any, dayOfMonth: e.target.value ? undefined : prev.dayOfMonth }))}>
                      <option value="">None (use start day)</option>
                      <option value="firstBusinessDayOfMonth">First business day of month</option>
                      <option value="lastBusinessDayOfMonth">Last business day of month</option>
                    </select>
                  </div>
                  {!recurrenceRule.specialRule && (
                    <div className="form-group">
                      <label className="form-label">Day of Month Override</label>
                      <input type="number" className="form-input" value={recurrenceRule.dayOfMonth ?? ''} onChange={e => setRecurrenceRule(prev => ({ ...prev, dayOfMonth: parseInt(e.target.value) || undefined }))} min="1" max="31" placeholder="e.g. 15" />
                    </div>
                  )}
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Business Day Adjustment</label>
                <select className="form-input" value={recurrenceRule.businessDayRule ?? 'none'} onChange={e => setRecurrenceRule(prev => ({ ...prev, businessDayRule: e.target.value as any }))}>
                  <option value="none">No adjustment</option>
                  <option value="nextBusinessDay">Move to next business day</option>
                  <option value="previousBusinessDay">Move to previous business day</option>
                </select>
              </div>

              {/* End condition */}
              <div style={{ background: 'var(--bg-card)', borderRadius: 6, padding: '0.75rem', marginTop: '0.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: noEnd ? 0 : '0.6rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
                    <input type="checkbox" checked={noEnd} onChange={e => {
                      const checked = e.target.checked
                      setNoEnd(checked)
                      setRecurrenceRule(prev => ({ ...prev, mode: checked ? 'infinite' : finiteMode === 'byCount' ? 'finiteByCount' : 'finiteUntilDate' }))
                    }} />
                    No end date
                  </label>
                  {!noEnd && (
                    <div style={{ display: 'flex', gap: 0, borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)' }}>
                      {(['byCount', 'untilDate'] as const).map(m => (
                        <button key={m} onClick={() => {
                          setFiniteMode(m)
                          setRecurrenceRule(prev => ({ ...prev, mode: m === 'byCount' ? 'finiteByCount' : 'finiteUntilDate' }))
                        }}
                          style={{ padding: '0.2rem 0.65rem', border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
                            background: finiteMode === m ? 'var(--color-primary, #6366f1)' : 'var(--bg-base)',
                            color: finiteMode === m ? '#fff' : 'var(--text-muted)' }}>
                          {m === 'byCount' ? 'After count' : 'Until date'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {!noEnd && finiteMode === 'byCount' && (
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Number of Occurrences *</label>
                    <input type="number" className="form-input" value={recurrenceRule.count ?? ''} onChange={e => setRecurrenceRule(prev => ({ ...prev, count: parseInt(e.target.value) || undefined }))} min="1" />
                  </div>
                )}
                {!noEnd && finiteMode === 'untilDate' && (
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">End Date *</label>
                    <input type="date" className="form-input" value={recurrenceRule.untilDate ?? ''} onChange={e => setRecurrenceRule(prev => ({ ...prev, untilDate: e.target.value }))} />
                  </div>
                )}
              </div>
            </>
          )}

          {/* Preview */}
          <div style={{ marginTop: '0.5rem' }}>
            <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }} onClick={handlePreview}>
              Preview Next 12 Months
            </button>
            {showPreview && (
              <div style={{ marginTop: '0.5rem', background: 'var(--bg-card)', borderRadius: 6, padding: '0.75rem', fontSize: '0.82rem' }}>
                {previewOccurrences.length === 0 ? (
                  <span style={{ color: 'var(--text-muted)' }}>No occurrences in next 12 months.</span>
                ) : (
                  <>
                    <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>
                      {previewOccurrences.length} occurrence{previewOccurrences.length !== 1 ? 's' : ''} (showing up to 20):
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {previewOccurrences.map(d => (
                        <span key={d} style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px', color: 'var(--text-primary)' }}>
                          {fmt(d)}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Optional Expense (expense only) */}
        {type === 'expense' && (
          <div style={{ marginTop: '1.25rem' }}>
            <div style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' }}>
              Conditionality
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
              <input
                type="checkbox"
                checked={isOptional}
                onChange={e => setIsOptional(e.target.checked)}
              />
              This is an optional / conditional expense
            </label>

            {isOptional && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', background: 'var(--bg-card)', padding: '0.75rem', borderRadius: 6 }}>
                <div className="form-group">
                  <label className="form-label">Include Condition</label>
                  <select
                    className="form-input"
                    value={optionalRule.mode}
                    onChange={e => setOptionalRule(prev => ({ ...prev, mode: e.target.value as ConditionalRule['mode'] }))}
                  >
                    <option value="includeIfPeriodSurplusGreaterThan">Period surplus &gt; threshold</option>
                    <option value="includeIfPeriodSurplusGreaterThanOrEqual">Period surplus ≥ threshold</option>
                    <option value="includeIfEndingLiquidBalanceGreaterThan">Ending balance &gt; threshold</option>
                    <option value="includeIfCumulativeSurplusGreaterThan">Cumulative surplus &gt; threshold</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Threshold ($) *</label>
                  <input
                    type="number"
                    className="form-input"
                    value={optionalRule.threshold}
                    onChange={e => setOptionalRule(prev => ({ ...prev, threshold: parseFloat(e.target.value) || 0 }))}
                    step="0.01"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Comment */}
        <div className="form-group" style={{ marginTop: '1.25rem' }}>
          <label className="form-label">Series Comment</label>
          <textarea
            className="form-input"
            value={seriesComment}
            onChange={e => setSeriesComment(e.target.value)}
            rows={2}
            placeholder="Notes about this income/expense series…"
            style={{ resize: 'vertical' }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            style={{ background: type === 'income' ? 'var(--income)' : 'var(--expense)' }}
            onClick={handleSave}
          >
            {isEdit ? 'Save Changes' : `Add ${type === 'income' ? 'Income' : 'Expense'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
