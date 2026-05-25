// ============================================================
// AccountBalanceUpdateForm
// Modal form for recording an actual account balance at a
// specific effective date/time.  Defaults to the current
// local date/time, but both fields are fully editable.
// ============================================================

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import Modal from '../shared/Modal'
import type {
  Account,
  Asset,
  AccountBalanceUpdate,
  LiquidityType,
  ReconciliationReason
} from '../../shared/types'

// ─── Helpers ─────────────────────────────────────────────────

function nowLocalISO(): string {
  // Returns "YYYY-MM-DDTHH:mm" suitable for <input type="datetime-local">
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    now.getFullYear() + '-' +
    pad(now.getMonth() + 1) + '-' +
    pad(now.getDate()) + 'T' +
    pad(now.getHours()) + ':' +
    pad(now.getMinutes())
  )
}

/** Convert a datetime-local string to a full ISO 8601 string */
function localInputToISO(localStr: string): string {
  if (!localStr) return new Date().toISOString()
  return new Date(localStr).toISOString()
}

/** Convert a full ISO string to a datetime-local input value */
function isoToLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    d.getFullYear() + '-' +
    pad(d.getMonth() + 1) + '-' +
    pad(d.getDate()) + 'T' +
    pad(d.getHours()) + ':' +
    pad(d.getMinutes())
  )
}

const RECONCILIATION_REASON_LABELS: Record<ReconciliationReason, string> = {
  manualAdjustment: 'Manual adjustment',
  untrackedIncome: 'Untracked income',
  untrackedExpense: 'Untracked expense',
  transferCorrection: 'Transfer correction',
  balanceCorrection: 'Balance correction',
  other: 'Other'
}

// ─── Props ────────────────────────────────────────────────────

interface Props {
  /** Pre-selected account/asset; if null, a dropdown is shown */
  accountId?: string
  accounts: Account[]
  assets: Asset[]
  /** Existing record when editing; undefined when adding */
  existing?: AccountBalanceUpdate
  onSave: (data: Omit<AccountBalanceUpdate, 'id' | 'createdAt' | 'updatedAt'>) => void
  onClose: () => void
}

// ─── Component ───────────────────────────────────────────────

export default function AccountBalanceUpdateForm({
  accountId: preselectedId,
  accounts,
  assets,
  existing,
  onSave,
  onClose
}: Props) {
  // Combine accounts + assets into a single selection list
  const allEntries: Array<{ id: string; name: string; liquidity: LiquidityType; type: string }> = [
    ...accounts.map(a => ({ id: a.id, name: a.name, liquidity: a.liquidity, type: a.type })),
    ...assets.map(a => ({ id: a.id, name: a.name, liquidity: a.liquidity, type: 'asset' }))
  ]

  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    existing?.accountId ?? preselectedId ?? allEntries[0]?.id ?? ''
  )
  const [effectiveAt, setEffectiveAt] = useState<string>(
    existing ? isoToLocalInput(existing.effectiveAt) : nowLocalISO()
  )
  const [balance, setBalance] = useState<string>(
    existing ? String(existing.balance) : ''
  )
  const [liquidity, setLiquidity] = useState<LiquidityType>(
    existing?.liquidity ??
    allEntries.find(e => e.id === (existing?.accountId ?? preselectedId ?? allEntries[0]?.id))?.liquidity ??
    'liquid'
  )
  const [comment, setComment] = useState(existing?.comment ?? '')
  const [reconciliationReason, setReconciliationReason] = useState<ReconciliationReason | ''>(
    existing?.reconciliationReason ?? ''
  )
  const [errors, setErrors] = useState<string[]>([])

  // When account selection changes, auto-update the liquidity to match
  useEffect(() => {
    const entry = allEntries.find(e => e.id === selectedAccountId)
    if (entry) setLiquidity(entry.liquidity)
  }, [selectedAccountId])

  function validate(): boolean {
    const errs: string[] = []
    if (!selectedAccountId) errs.push('Account is required.')
    if (!effectiveAt) errs.push('Effective date/time is required.')
    const parsed = parseFloat(balance)
    if (isNaN(parsed)) errs.push('Balance must be a number.')
    if (parsed < 0) errs.push('Balance cannot be negative.')
    setErrors(errs)
    return errs.length === 0
  }

  function handleSave() {
    if (!validate()) return
    onSave({
      accountId: selectedAccountId,
      effectiveAt: localInputToISO(effectiveAt),
      balance: parseFloat(parseFloat(balance).toFixed(2)),
      liquidity,
      comment: comment.trim() || undefined,
      reconciliationReason: reconciliationReason || undefined
    })
  }

  const title = existing ? 'Edit Balance Update' : 'Update Account Balance'

  return (
    <Modal title={title} onClose={onClose} width={480}>
      <div className="form-grid">

        {/* Account selector — hidden when a specific account was pre-selected */}
        {!preselectedId && (
          <div className="form-row">
            <label className="form-label">Account</label>
            <select
              className="form-input"
              value={selectedAccountId}
              onChange={e => setSelectedAccountId(e.target.value)}
            >
              {allEntries.length === 0 && (
                <option value="">No accounts</option>
              )}
              {allEntries.map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
        )}

        {preselectedId && (
          <div className="form-row">
            <label className="form-label">Account</label>
            <div className="form-display-value">
              {allEntries.find(e => e.id === preselectedId)?.name ?? preselectedId}
            </div>
          </div>
        )}

        {/* Effective date/time — defaults to now, fully editable */}
        <div className="form-row">
          <label className="form-label">
            Effective date / time
            <span className="form-hint"> (defaults to now)</span>
          </label>
          <input
            type="datetime-local"
            className="form-input"
            value={effectiveAt}
            onChange={e => setEffectiveAt(e.target.value)}
          />
        </div>

        {/* Balance */}
        <div className="form-row">
          <label className="form-label">Updated balance</label>
          <input
            type="number"
            className="form-input"
            placeholder="0.00"
            min={0}
            step={0.01}
            value={balance}
            onChange={e => setBalance(e.target.value)}
          />
        </div>

        {/* Liquidity classification */}
        <div className="form-row">
          <label className="form-label">Liquidity</label>
          <div className="toggle-group">
            <button
              type="button"
              className={`toggle-btn${liquidity === 'liquid' ? ' active' : ''}`}
              onClick={() => setLiquidity('liquid')}
            >
              Liquid
            </button>
            <button
              type="button"
              className={`toggle-btn${liquidity === 'tiedUp' ? ' active' : ''}`}
              onClick={() => setLiquidity('tiedUp')}
            >
              Tied up
            </button>
          </div>
        </div>

        {/* Reconciliation reason */}
        <div className="form-row">
          <label className="form-label">Reconciliation reason <span className="form-hint">(optional)</span></label>
          <select
            className="form-input"
            value={reconciliationReason}
            onChange={e => setReconciliationReason(e.target.value as ReconciliationReason | '')}
          >
            <option value="">— none —</option>
            {(Object.keys(RECONCILIATION_REASON_LABELS) as ReconciliationReason[]).map(r => (
              <option key={r} value={r}>{RECONCILIATION_REASON_LABELS[r]}</option>
            ))}
          </select>
        </div>

        {/* Comment */}
        <div className="form-row">
          <label className="form-label">Comment / note <span className="form-hint">(optional)</span></label>
          <textarea
            className="form-input"
            rows={2}
            placeholder="e.g. Reconciled against bank statement"
            value={comment}
            onChange={e => setComment(e.target.value)}
          />
        </div>

        {/* Validation errors */}
        {errors.length > 0 && (
          <div className="form-errors">
            {errors.map((e, i) => <div key={i} className="form-error">{e}</div>)}
          </div>
        )}

        {/* Actions */}
        <div className="form-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>Save</button>
        </div>
      </div>
    </Modal>
  )
}
