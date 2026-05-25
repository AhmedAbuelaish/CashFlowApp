// ============================================================
// CashFlow Planner — Account Form + Account Asset Form
// - AccountForm: add/edit an account; edit mode hides balance
//   and shows full liquidation rules + fees
// - AccountAssetForm: add/edit a sub-asset within an account
// ============================================================

import { useState } from 'react'
import { useAppStore } from '../../store/appStore'
import type { Account, AccountAsset, LiquidationRule, FeeRule, LiquidityType } from '../../shared/types'
import { v4 as uuidv4 } from 'uuid'
import Modal from '../shared/Modal'

// ─── Shared liquidation + fee subform ────────────────────────

interface LiqFeeState {
  liqEnabled: boolean
  liqMode: LiquidationRule['mode']
  saleDelay: string
  transferDelay: string
  useBusinessDays: boolean
  periodicInterval: string
  periodicUnit: 'month' | 'quarter' | 'year'
  specificDatesStr: string
  taxPct: string
  fees: FeeRule[]
  newFeeMode: 'fixed' | 'percentage'
  newFeeAmount: string
  newFeeLabel: string
}

function initLiqFee(src?: { liquidationRule?: LiquidationRule; fees?: FeeRule[]; taxPercentage?: number }): LiqFeeState {
  return {
    liqEnabled: !!src?.liquidationRule,
    liqMode: src?.liquidationRule?.mode ?? 'fixedDelay',
    saleDelay: String(src?.liquidationRule?.saleDelayDays ?? '2'),
    transferDelay: String(src?.liquidationRule?.transferDelayDays ?? '1'),
    useBusinessDays: src?.liquidationRule?.useBusinessDays ?? true,
    periodicInterval: String(src?.liquidationRule?.periodicInterval ?? '6'),
    periodicUnit: src?.liquidationRule?.periodicUnit ?? 'month',
    specificDatesStr: (src?.liquidationRule?.specificDates ?? []).join(', '),
    taxPct: String(src?.taxPercentage ?? ''),
    fees: src?.fees ?? [],
    newFeeMode: 'fixed',
    newFeeAmount: '',
    newFeeLabel: ''
  }
}

function LiqFeeSection({ state, setState }: {
  state: LiqFeeState
  setState: React.Dispatch<React.SetStateAction<LiqFeeState>>
}) {
  function set(patch: Partial<LiqFeeState>) { setState(s => ({ ...s, ...patch })) }

  function addFee() {
    if (!state.newFeeAmount) return
    const fee: FeeRule = {
      id: uuidv4(), mode: state.newFeeMode,
      amount: state.newFeeMode === 'fixed' ? parseFloat(state.newFeeAmount) : undefined,
      percentage: state.newFeeMode === 'percentage' ? parseFloat(state.newFeeAmount) : undefined,
      label: state.newFeeLabel || undefined
    }
    set({ fees: [...state.fees, fee], newFeeAmount: '', newFeeLabel: '' })
  }

  return (
    <div style={{ marginTop: '1.25rem' }}>
      {/* Liquidation Rules */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
        <div style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Liquidation Rules
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={state.liqEnabled} onChange={e => set({ liqEnabled: e.target.checked })} />
          Enable
        </label>
      </div>

      {state.liqEnabled && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', padding: '0.75rem', background: 'var(--bg-base)', borderRadius: 6, marginBottom: '0.75rem' }}>
          <div className="form-group">
            <label className="form-label">Availability Mode</label>
            <select className="form-input" value={state.liqMode} onChange={e => set({ liqMode: e.target.value as LiquidationRule['mode'] })}>
              <option value="fixedDelay">Fixed Delay</option>
              <option value="periodicAvailability">Periodic Availability</option>
              <option value="specificDates">Specific Dates</option>
            </select>
          </div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'center', paddingTop: '1.4rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={state.useBusinessDays} onChange={e => set({ useBusinessDays: e.target.checked })} />
              Use Business Days
            </label>
          </div>
          <div className="form-group">
            <label className="form-label">Sale Delay (days)</label>
            <input type="number" className="form-input" value={state.saleDelay} onChange={e => set({ saleDelay: e.target.value })} min="0" />
          </div>
          <div className="form-group">
            <label className="form-label">Transfer Delay (days)</label>
            <input type="number" className="form-input" value={state.transferDelay} onChange={e => set({ transferDelay: e.target.value })} min="0" />
          </div>
          {state.liqMode === 'periodicAvailability' && (<>
            <div className="form-group">
              <label className="form-label">Every (interval)</label>
              <input type="number" className="form-input" value={state.periodicInterval} onChange={e => set({ periodicInterval: e.target.value })} min="1" />
            </div>
            <div className="form-group">
              <label className="form-label">Unit</label>
              <select className="form-input" value={state.periodicUnit} onChange={e => set({ periodicUnit: e.target.value as any })}>
                <option value="month">Month(s)</option>
                <option value="quarter">Quarter(s)</option>
                <option value="year">Year(s)</option>
              </select>
            </div>
          </>)}
          {state.liqMode === 'specificDates' && (
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Dates (comma-separated YYYY-MM-DD)</label>
              <input className="form-input" value={state.specificDatesStr} onChange={e => set({ specificDatesStr: e.target.value })} placeholder="2025-06-30, 2025-12-31" />
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Tax Estimate (%)</label>
            <input type="number" className="form-input" value={state.taxPct} onChange={e => set({ taxPct: e.target.value })} min="0" max="100" step="0.1" placeholder="e.g. 20" />
          </div>
        </div>
      )}

      {/* Fees & Penalties */}
      <div style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' }}>
        Fees &amp; Penalties
      </div>
      {state.fees.map(f => (
        <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.75rem', background: 'var(--bg-card)', borderRadius: 4, marginBottom: 4, fontSize: '0.82rem' }}>
          <span>{f.label ? `${f.label}: ` : ''}{f.mode === 'fixed' ? `$${f.amount}` : `${f.percentage}%`} ({f.mode})</span>
          <button onClick={() => set({ fees: state.fees.filter(x => x.id !== f.id) })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-expense)', fontSize: '0.8rem' }}>✕</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="form-group" style={{ flex: 1, minWidth: 100, marginBottom: 0 }}>
          <label className="form-label">Type</label>
          <select className="form-input" value={state.newFeeMode} onChange={e => set({ newFeeMode: e.target.value as any })}>
            <option value="fixed">Fixed $</option>
            <option value="percentage">Percentage %</option>
          </select>
        </div>
        <div className="form-group" style={{ flex: 1, minWidth: 80, marginBottom: 0 }}>
          <label className="form-label">Amount</label>
          <input type="number" className="form-input" value={state.newFeeAmount} onChange={e => set({ newFeeAmount: e.target.value })} min="0" step="0.01" />
        </div>
        <div className="form-group" style={{ flex: 2, minWidth: 120, marginBottom: 0 }}>
          <label className="form-label">Label (optional)</label>
          <input className="form-input" value={state.newFeeLabel} onChange={e => set({ newFeeLabel: e.target.value })} placeholder="e.g. Early withdrawal" />
        </div>
        <button className="btn btn-ghost btn-sm" onClick={addFee}>+ Add Fee</button>
      </div>
    </div>
  )
}

function buildLiquidationRule(state: LiqFeeState): LiquidationRule | undefined {
  if (!state.liqEnabled) return undefined
  return {
    mode: state.liqMode,
    saleDelayDays: parseInt(state.saleDelay) || 0,
    transferDelayDays: parseInt(state.transferDelay) || 0,
    useBusinessDays: state.useBusinessDays,
    periodicInterval: state.liqMode === 'periodicAvailability' ? parseInt(state.periodicInterval) || 6 : undefined,
    periodicUnit: state.liqMode === 'periodicAvailability' ? state.periodicUnit : undefined,
    specificDates: state.liqMode === 'specificDates'
      ? state.specificDatesStr.split(',').map(s => s.trim()).filter(Boolean)
      : undefined
  }
}

// ─── AccountForm ──────────────────────────────────────────────

interface AccountFormProps {
  mode: 'add' | 'edit'
  existing?: Account
  onClose: () => void
}

export function AccountForm({ mode, existing, onClose }: AccountFormProps) {
  const addAccount    = useAppStore(s => s.addAccount)
  const updateAccount = useAppStore(s => s.updateAccount)

  const [name,      setName]      = useState(existing?.name ?? '')
  const [type,      setType]      = useState(existing?.type ?? 'checking')
  const [balance,   setBalance]   = useState(String(existing?.balance ?? '0'))
  const [currency,  setCurrency]  = useState(existing?.currency ?? 'USD')
  const [liquidity, setLiquidity] = useState<LiquidityType>(existing?.liquidity ?? 'liquid')
  const [notes,     setNotes]     = useState(existing?.notes ?? '')
  const [liqFee,    setLiqFee]    = useState<LiqFeeState>(() => initLiqFee(existing))
  const [errors,    setErrors]    = useState<string[]>([])

  function validate() {
    const errs: string[] = []
    if (!name.trim()) errs.push('Name is required.')
    if (mode === 'add' && isNaN(parseFloat(balance))) errs.push('Balance must be a number.')
    return errs
  }

  function handleSave() {
    const errs = validate()
    if (errs.length > 0) { setErrors(errs); return }

    const data = {
      name: name.trim(), type, currency, liquidity,
      notes: notes || undefined,
      liquidationRule: buildLiquidationRule(liqFee),
      fees: liqFee.fees.length > 0 ? liqFee.fees : undefined,
      taxPercentage: liqFee.taxPct ? parseFloat(liqFee.taxPct) : undefined,
      assets: existing?.assets
    }

    if (mode === 'edit' && existing) {
      updateAccount(existing.id, data)
    } else {
      addAccount({ ...data, balance: parseFloat(balance) })
    }
    onClose()
  }

  return (
    <Modal title={mode === 'edit' ? 'Edit Account' : 'Add Account'} onClose={onClose} width={560}>
      <div style={{ maxHeight: '75vh', overflowY: 'auto', paddingRight: 4 }}>
        {errors.length > 0 && (
          <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid var(--color-expense)', borderRadius: 6, padding: '0.6rem', marginBottom: '0.75rem' }}>
            {errors.map((e, i) => <div key={i} style={{ fontSize: '0.82rem', color: 'var(--color-expense)' }}>• {e}</div>)}
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
              <option value="cd">CD / Certificate</option>
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

          {/* Balance only shown on add — edit uses Update Balance button */}
          {mode === 'add' && (
            <div className="form-group">
              <label className="form-label">Starting Balance *</label>
              <input type="number" className="form-input" value={balance} onChange={e => setBalance(e.target.value)} step="0.01" />
            </div>
          )}
          {mode === 'edit' && (
            <div className="form-group">
              <label className="form-label" style={{ color: 'var(--text-muted)' }}>Balance</label>
              <div style={{ padding: '0.5rem 0.6rem', background: 'var(--bg-base)', borderRadius: 6, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Use the <strong>Update Balance</strong> button to record balance changes with a date and time.
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Currency</label>
            <input className="form-input" value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} maxLength={3} placeholder="USD" />
          </div>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label className="form-label">Notes</label>
            <textarea className="form-input" value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ resize: 'vertical' }} />
          </div>
        </div>

        <LiqFeeSection state={liqFee} setState={setLiqFee} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}>
          {mode === 'edit' ? 'Save Changes' : 'Add Account'}
        </button>
      </div>
    </Modal>
  )
}

// ─── AccountAssetForm ─────────────────────────────────────────

interface AccountAssetFormProps {
  accountId: string
  accountName: string
  mode: 'add' | 'edit'
  existing?: AccountAsset
  onClose: () => void
}

export function AccountAssetForm({ accountId, accountName, mode, existing, onClose }: AccountAssetFormProps) {
  const addAccountAsset    = useAppStore(s => s.addAccountAsset)
  const updateAccountAsset = useAppStore(s => s.updateAccountAsset)

  const [name,      setName]      = useState(existing?.name ?? '')
  const [value,     setValue]     = useState(String(existing?.currentValue ?? '0'))
  const [currency,  setCurrency]  = useState(existing?.currency ?? 'USD')
  const [liquidity, setLiquidity] = useState<LiquidityType>(existing?.liquidity ?? 'tiedUp')
  const [notes,     setNotes]     = useState(existing?.notes ?? '')
  const [liqFee,    setLiqFee]    = useState<LiqFeeState>(() => initLiqFee(existing))
  const [errors,    setErrors]    = useState<string[]>([])

  function handleSave() {
    const errs: string[] = []
    if (!name.trim()) errs.push('Name is required.')
    if (isNaN(parseFloat(value))) errs.push('Value must be a number.')
    if (errs.length > 0) { setErrors(errs); return }

    const data = {
      name: name.trim(), currentValue: parseFloat(value), currency, liquidity,
      notes: notes || undefined,
      liquidationRule: buildLiquidationRule(liqFee),
      fees: liqFee.fees.length > 0 ? liqFee.fees : undefined,
      taxPercentage: liqFee.taxPct ? parseFloat(liqFee.taxPct) : undefined
    }

    if (mode === 'edit' && existing) {
      updateAccountAsset(accountId, existing.id, data)
    } else {
      addAccountAsset(accountId, data)
    }
    onClose()
  }

  return (
    <Modal title={`${mode === 'edit' ? 'Edit' : 'Add'} Asset — ${accountName}`} onClose={onClose} width={540}>
      <div style={{ maxHeight: '70vh', overflowY: 'auto', paddingRight: 4 }}>
        {errors.length > 0 && (
          <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid var(--color-expense)', borderRadius: 6, padding: '0.6rem', marginBottom: '0.75rem' }}>
            {errors.map((e, i) => <div key={i} style={{ fontSize: '0.82rem', color: 'var(--color-expense)' }}>• {e}</div>)}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label className="form-label">Asset Name *</label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Vanguard Total Market" />
          </div>
          <div className="form-group">
            <label className="form-label">Current Value *</label>
            <input type="number" className="form-input" value={value} onChange={e => setValue(e.target.value)} step="0.01" />
          </div>
          <div className="form-group">
            <label className="form-label">Currency</label>
            <input className="form-input" value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
          </div>
          <div className="form-group">
            <label className="form-label">Liquidity</label>
            <select className="form-input" value={liquidity} onChange={e => setLiquidity(e.target.value as LiquidityType)}>
              <option value="liquid">Liquid</option>
              <option value="tiedUp">Tied Up / Illiquid</option>
            </select>
          </div>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label className="form-label">Notes</label>
            <textarea className="form-input" value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ resize: 'vertical' }} />
          </div>
        </div>
        <LiqFeeSection state={liqFee} setState={setLiqFee} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}>
          {mode === 'edit' ? 'Save Changes' : 'Add Asset'}
        </button>
      </div>
    </Modal>
  )
}

// Keep named export for any remaining imports of AssetForm (treated as no-op)
export { AccountAssetForm as AssetForm }
