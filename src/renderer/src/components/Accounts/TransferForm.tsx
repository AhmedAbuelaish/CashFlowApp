// ============================================================
// CashFlow Planner — Transfer Between Accounts
// Creates two AccountBalanceUpdate records: debit source,
// credit destination.
// ============================================================

import { useState } from 'react'
import { useAppStore } from '../../store/appStore'
import type { Account } from '../../shared/types'
import Modal from '../shared/Modal'

function nowLocalISO() {
  const d = new Date(); const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function localToISO(s: string) { return s ? new Date(s).toISOString() : new Date().toISOString() }

interface Props { accounts: Account[]; onClose: () => void }

export default function TransferForm({ accounts, onClose }: Props) {
  const transfer = useAppStore(s => s.transfer)

  const [fromId,      setFromId]      = useState(accounts[0]?.id ?? '')
  const [toId,        setToId]        = useState(accounts[1]?.id ?? accounts[0]?.id ?? '')
  const [amount,      setAmount]      = useState('')
  const [effectiveAt, setEffectiveAt] = useState(nowLocalISO())
  const [comment,     setComment]     = useState('')
  const [errors,      setErrors]      = useState<string[]>([])

  function validate() {
    const errs: string[] = []
    if (!fromId) errs.push('Source account is required.')
    if (!toId) errs.push('Destination account is required.')
    if (fromId === toId) errs.push('Source and destination must be different accounts.')
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) errs.push('Amount must be a positive number.')
    if (!effectiveAt) errs.push('Date/time is required.')
    return errs
  }

  function handleSave() {
    const errs = validate()
    if (errs.length > 0) { setErrors(errs); return }
    transfer(fromId, toId, parseFloat(amount), localToISO(effectiveAt), comment.trim() || undefined)
    onClose()
  }

  const fromAccount = accounts.find(a => a.id === fromId)
  const toAccount   = accounts.find(a => a.id === toId)

  return (
    <Modal title="Transfer Between Accounts" onClose={onClose} width={460}>
      <div className="form-grid">
        {errors.length > 0 && (
          <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid var(--color-expense)', borderRadius: 6, padding: '0.6rem', marginBottom: '0.5rem' }}>
            {errors.map((e, i) => <div key={i} style={{ fontSize: '0.82rem', color: 'var(--color-expense)' }}>• {e}</div>)}
          </div>
        )}

        <div className="form-row">
          <label className="form-label">From account</label>
          <select className="form-input" value={fromId} onChange={e => setFromId(e.target.value)}>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        <div className="form-row">
          <label className="form-label">To account</label>
          <select className="form-input" value={toId} onChange={e => setToId(e.target.value)}>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        <div className="form-row">
          <label className="form-label">Amount</label>
          <input type="number" className="form-input" value={amount} onChange={e => setAmount(e.target.value)} min="0.01" step="0.01" placeholder="0.00" />
        </div>

        <div className="form-row">
          <label className="form-label">Effective date / time</label>
          <input type="datetime-local" className="form-input" value={effectiveAt} onChange={e => setEffectiveAt(e.target.value)} />
        </div>

        <div className="form-row">
          <label className="form-label">Comment <span className="form-hint">(optional)</span></label>
          <input className="form-input" value={comment} onChange={e => setComment(e.target.value)} placeholder="e.g. Monthly savings transfer" />
        </div>

        {fromId && toId && fromId !== toId && parseFloat(amount) > 0 && (
          <div style={{ padding: '0.6rem 0.75rem', background: 'var(--bg-base)', borderRadius: 6, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            <strong>{fromAccount?.name}</strong> balance will decrease by ${parseFloat(amount || '0').toFixed(2)}<br />
            <strong>{toAccount?.name}</strong> balance will increase by ${parseFloat(amount || '0').toFixed(2)}
          </div>
        )}

        <div className="form-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>Record Transfer</button>
        </div>
      </div>
    </Modal>
  )
}
