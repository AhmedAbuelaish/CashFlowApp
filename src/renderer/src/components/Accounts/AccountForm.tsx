// ============================================================
// CashFlow Planner — Account / Asset Form
// ============================================================

import React, { useState } from 'react'
import { useAppStore } from '../../store/appStore'
import type { Account, Asset, LiquidationRule, FeeRule, LiquidityType } from '../../shared/types'
import { v4 as uuidv4 } from 'uuid'

// ── Account Form ──────────────────────────────────────────────

interface AccountFormProps {
  mode: 'add' | 'edit'
  account?: Account
  onClose: () => void
}

export function AccountForm({ mode, account, onClose }: AccountFormProps) {
  const addAccount = useAppStore(s => s.addAccount)
  const updateAccount = useAppStore(s => s.updateAccount)

  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState(account?.type ?? 'checking')
  const [balance, setBalance] = useState(String(account?.balance ?? '0'))
  const [currency, setCurrency] = useState(account?.currency ?? 'USD')
  const [liquidity, setLiquidity] = useState<LiquidityType>(account?.liquidity ?? 'liquid')
  const [notes, setNotes] = useState(account?.notes ?? '')
  const [errors, setErrors] = useState<string[]>([])

  function validate() {
    const errs: string[] = []
    if (!name.trim()) errs.push('Name is required.')
    const bal = parseFloat(balance)
    if (isNaN(bal)) errs.push('Balance must be a number.')
    return errs
  }

  function handleSave() {
    const errs = validate()
    if (errs.length > 0) { setErrors(errs); return }
    const data = {
      name: name.trim(),
      type,
      balance: parseFloat(balance),
      currency,
      liquidity,
      notes: notes || undefined
    }
    if (mode === 'edit' && account) {
      updateAccount(account.id, data)
    } else {
      addAccount(data)
    }
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480, width: '90%' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{mode === 'edit' ? 'Edit Account' : 'Add Account'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {errors.length > 0 && (
          <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid var(--expense)', borderRadius: 6, padding: '0.6rem', marginBottom: '0.75rem' }}>
            {errors.map((e, i) => <div key={i} style={{ fontSize: '0.82rem', color: 'var(--expense)' }}>• {e}</div>)}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label className="form-label">Name *</label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Checking Account" />
          </div>
          <div className="form-group">
            <label className="form-label">Type</label>
            <select className="form-input" value={type} onChange={e => setType(e.target.value)}>
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
              <option value="investment">Investment</option>
              <option value="retirement">Retirement</option>
              <option value="money_market">Money Market</option>
              <option value="credit_card">Credit Card</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Liquidity</label>
            <select className="form-input" value={liquidity} onChange={e => setLiquidity(e.target.value as LiquidityType)}>
              <option value="liquid">Liquid</option>
              <option value="tiedUp">Tied Up / Illiquid</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Current Balance *</label>
            <input type="number" className="form-input" value={balance} onChange={e => setBalance(e.target.value)} step="0.01" />
          </div>
          <div className="form-group">
            <label className="form-label">Currency</label>
            <input className="form-input" value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} maxLength={3} placeholder="USD" />
          </div>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label className="form-label">Notes</label>
            <textarea className="form-input" value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ resize: 'vertical' }} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>
            {mode === 'edit' ? 'Save Changes' : 'Add Account'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Asset Form ────────────────────────────────────────────────

interface AssetFormProps {
  mode: 'add' | 'edit'
  asset?: Asset
  onClose: () => void
}

export function AssetForm({ mode, asset, onClose }: AssetFormProps) {
  const addAsset = useAppStore(s => s.addAsset)
  const updateAsset = useAppStore(s => s.updateAsset)
  const currentFile = useAppStore(s => s.currentFile)
  const accounts = currentFile?.accounts ?? []

  const [name, setName] = useState(asset?.name ?? '')
  const [accountId, setAccountId] = useState(asset?.accountId ?? '')
  const [currentValue, setCurrentValue] = useState(String(asset?.currentValue ?? '0'))
  const [currency, setCurrency] = useState(asset?.currency ?? 'USD')
  const [liquidity, setLiquidity] = useState<LiquidityType>(asset?.liquidity ?? 'tiedUp')
  const [taxPct, setTaxPct] = useState(String(asset?.taxPercentage ?? ''))
  const [notes, setNotes] = useState(asset?.notes ?? '')

  // Liquidation rule
  const [liqMode, setLiqMode] = useState<LiquidationRule['mode']>(
    asset?.liquidationRule?.mode ?? 'fixedDelay'
  )
  const [saleDelay, setSaleDelay] = useState(String(asset?.liquidationRule?.saleDelayDays ?? '2'))
  const [transferDelay, setTransferDelay] = useState(String(asset?.liquidationRule?.transferDelayDays ?? '1'))
  const [useBusinessDays, setUseBusinessDays] = useState(asset?.liquidationRule?.useBusinessDays ?? true)
  const [periodicInterval, setPeriodicInterval] = useState(String(asset?.liquidationRule?.periodicInterval ?? '6'))
  const [periodicUnit, setPeriodicUnit] = useState<'month' | 'quarter' | 'year'>(
    asset?.liquidationRule?.periodicUnit ?? 'month'
  )
  const [specificDatesStr, setSpecificDatesStr] = useState(
    (asset?.liquidationRule?.specificDates ?? []).join(', ')
  )

  // Fees
  const [fees, setFees] = useState<FeeRule[]>(asset?.fees ?? [])
  const [newFeeMode, setNewFeeMode] = useState<'fixed' | 'percentage'>('fixed')
  const [newFeeAmount, setNewFeeAmount] = useState('')
  const [newFeeLabel, setNewFeeLabel] = useState('')

  const [errors, setErrors] = useState<string[]>([])

  function addFee() {
    if (!newFeeAmount) return
    const fee: FeeRule = {
      id: uuidv4(),
      mode: newFeeMode,
      amount: newFeeMode === 'fixed' ? parseFloat(newFeeAmount) : undefined,
      percentage: newFeeMode === 'percentage' ? parseFloat(newFeeAmount) : undefined,
      label: newFeeLabel || undefined
    }
    setFees(prev => [...prev, fee])
    setNewFeeAmount('')
    setNewFeeLabel('')
  }

  function removeFee(id: string) {
    setFees(prev => prev.filter(f => f.id !== id))
  }

  function validate() {
    const errs: string[] = []
    if (!name.trim()) errs.push('Name is required.')
    if (isNaN(parseFloat(currentValue))) errs.push('Current value must be a number.')
    return errs
  }

  function handleSave() {
    const errs = validate()
    if (errs.length > 0) { setErrors(errs); return }

    const liqRule: LiquidationRule = {
      mode: liqMode,
      saleDelayDays: parseInt(saleDelay) || 0,
      transferDelayDays: parseInt(transferDelay) || 0,
      useBusinessDays,
      periodicInterval: liqMode === 'periodicAvailability' ? parseInt(periodicInterval) || 6 : undefined,
      periodicUnit: liqMode === 'periodicAvailability' ? periodicUnit : undefined,
      specificDates: liqMode === 'specificDates'
        ? specificDatesStr.split(',').map(s => s.trim()).filter(Boolean)
        : undefined
    }

    const data = {
      name: name.trim(),
      accountId,
      currentValue: parseFloat(currentValue),
      currency,
      liquidity,
      liquidationRule: liqRule,
      fees: fees.length > 0 ? fees : undefined,
      taxPercentage: taxPct ? parseFloat(taxPct) : undefined,
      notes: notes || undefined
    }

    if (mode === 'edit' && asset) {
      updateAsset(asset.id, data)
    } else {
      addAsset(data)
    }
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 580, width: '95%', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="modal-title">{mode === 'edit' ? 'Edit Asset' : 'Add Asset'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {errors.length > 0 && (
          <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid var(--expense)', borderRadius: 6, padding: '0.6rem', marginBottom: '0.75rem' }}>
            {errors.map((e, i) => <div key={i} style={{ fontSize: '0.82rem', color: 'var(--expense)' }}>• {e}</div>)}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label className="form-label">Name *</label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Vanguard 401k" />
          </div>
          <div className="form-group">
            <label className="form-label">Account</label>
            <select className="form-input" value={accountId} onChange={e => setAccountId(e.target.value)}>
              <option value="">— None —</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Liquidity</label>
            <select className="form-input" value={liquidity} onChange={e => setLiquidity(e.target.value as LiquidityType)}>
              <option value="liquid">Liquid</option>
              <option value="tiedUp">Tied Up / Illiquid</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Current Value *</label>
            <input type="number" className="form-input" value={currentValue} onChange={e => setCurrentValue(e.target.value)} step="0.01" />
          </div>
          <div className="form-group">
            <label className="form-label">Currency</label>
            <input className="form-input" value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
          </div>
          <div className="form-group">
            <label className="form-label">Tax Estimate (%)</label>
            <input type="number" className="form-input" value={taxPct} onChange={e => setTaxPct(e.target.value)} min="0" max="100" step="0.1" placeholder="e.g. 20" />
          </div>
        </div>

        {/* Liquidation Rule */}
        <div style={{ marginTop: '1.25rem' }}>
          <div style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' }}>
            Liquidation Rule
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Availability Mode</label>
              <select className="form-input" value={liqMode} onChange={e => setLiqMode(e.target.value as LiquidationRule['mode'])}>
                <option value="fixedDelay">Fixed Delay</option>
                <option value="periodicAvailability">Periodic Availability</option>
                <option value="specificDates">Specific Dates</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={useBusinessDays} onChange={e => setUseBusinessDays(e.target.checked)} />
                Use Business Days
              </label>
            </div>
            <div className="form-group">
              <label className="form-label">Sale Delay (days)</label>
              <input type="number" className="form-input" value={saleDelay} onChange={e => setSaleDelay(e.target.value)} min="0" />
            </div>
            <div className="form-group">
              <label className="form-label">Transfer Delay (days)</label>
              <input type="number" className="form-input" value={transferDelay} onChange={e => setTransferDelay(e.target.value)} min="0" />
            </div>
            {liqMode === 'periodicAvailability' && (
              <>
                <div className="form-group">
                  <label className="form-label">Every (interval)</label>
                  <input type="number" className="form-input" value={periodicInterval} onChange={e => setPeriodicInterval(e.target.value)} min="1" />
                </div>
                <div className="form-group">
                  <label className="form-label">Unit</label>
                  <select className="form-input" value={periodicUnit} onChange={e => setPeriodicUnit(e.target.value as any)}>
                    <option value="month">Month(s)</option>
                    <option value="quarter">Quarter(s)</option>
                    <option value="year">Year(s)</option>
                  </select>
                </div>
              </>
            )}
            {liqMode === 'specificDates' && (
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Dates (comma-separated YYYY-MM-DD)</label>
                <input className="form-input" value={specificDatesStr} onChange={e => setSpecificDatesStr(e.target.value)} placeholder="2025-06-30, 2025-12-31" />
              </div>
            )}
          </div>
        </div>

        {/* Fees */}
        <div style={{ marginTop: '1.25rem' }}>
          <div style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' }}>
            Fees & Penalties
          </div>
          {fees.map(f => (
            <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.75rem', background: 'var(--bg-card)', borderRadius: 4, marginBottom: 4, fontSize: '0.82rem' }}>
              <span style={{ color: 'var(--text-primary)' }}>
                {f.label ? `${f.label}: ` : ''}{f.mode === 'fixed' ? `$${f.amount}` : `${f.percentage}%`} ({f.mode})
              </span>
              <button onClick={() => removeFee(f.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--expense)', fontSize: '0.8rem' }}>✕</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: 1, minWidth: 100, marginBottom: 0 }}>
              <label className="form-label">Type</label>
              <select className="form-input" value={newFeeMode} onChange={e => setNewFeeMode(e.target.value as any)}>
                <option value="fixed">Fixed $</option>
                <option value="percentage">Percentage %</option>
              </select>
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: 80, marginBottom: 0 }}>
              <label className="form-label">Amount</label>
              <input type="number" className="form-input" value={newFeeAmount} onChange={e => setNewFeeAmount(e.target.value)} min="0" step="0.01" />
            </div>
            <div className="form-group" style={{ flex: 2, minWidth: 120, marginBottom: 0 }}>
              <label className="form-label">Label (optional)</label>
              <input className="form-input" value={newFeeLabel} onChange={e => setNewFeeLabel(e.target.value)} placeholder="e.g. Early withdrawal" />
            </div>
            <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }} onClick={addFee}>
              + Add Fee
            </button>
          </div>
        </div>

        {/* Notes */}
        <div className="form-group" style={{ marginTop: '1.25rem' }}>
          <label className="form-label">Notes</label>
          <textarea className="form-input" value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ resize: 'vertical' }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>
            {mode === 'edit' ? 'Save Changes' : 'Add Asset'}
          </button>
        </div>
      </div>
    </div>
  )
}
