// ============================================================
// CashFlow Planner — Accounts List
// - Asset sections expand by default when assets are defined
// - Hierarchy: account row → indented assets panel → history panel
// ============================================================

import { useState, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { useAppStore } from '../../store/appStore'
import type {
  Account, AccountAsset, AccountBalanceUpdate, ReconciliationVariance
} from '../../shared/types'
import { AccountForm, AccountAssetForm } from './AccountForm'
import AccountBalanceUpdateForm from './AccountBalanceUpdateForm'
import TransferForm from './TransferForm'
import Modal from '../shared/Modal'

// ─── Helpers ─────────────────────────────────────────────────

const fmt = (n: number, cur = 'USD') =>
  n.toLocaleString('en-US', { style: 'currency', currency: cur })
const fmtDT = (iso: string) => {
  try { return format(parseISO(iso), 'MMM d, yyyy h:mm a') } catch { return iso }
}

function computeBalance(account: Account, updates: AccountBalanceUpdate[]): number {
  const assets = account.assets ?? []
  if (assets.length > 0) return assets.reduce((s, a) => s + a.currentValue, 0)
  const sorted = updates
    .filter(u => u.accountId === account.id)
    .sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt))
  return sorted[0]?.balance ?? account.balance
}

// ─── Intra-account transfer modal ────────────────────────────

function AssetTransferForm({ account, onClose }: { account: Account; onClose: () => void }) {
  const transferBetweenAssets = useAppStore(s => s.transferBetweenAssets)
  const assets = account.assets ?? []
  const [fromId, setFromId] = useState(assets[0]?.id ?? '')
  const [toId,   setToId]   = useState(assets[1]?.id ?? assets[0]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [errors, setErrors] = useState<string[]>([])

  const fromAsset = assets.find(a => a.id === fromId)
  const toAsset   = assets.find(a => a.id === toId)

  function handleSave() {
    const errs: string[] = []
    if (fromId === toId) errs.push('Source and destination must be different.')
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) errs.push('Amount must be a positive number.')
    if (fromAsset && amt > fromAsset.currentValue)
      errs.push(`Amount exceeds ${fromAsset.name} balance of ${fmt(fromAsset.currentValue, fromAsset.currency)}.`)
    if (errs.length > 0) { setErrors(errs); return }
    transferBetweenAssets(account.id, fromId, toId, amt)
    onClose()
  }

  return (
    <Modal title={`Transfer Within — ${account.name}`} onClose={onClose} width={420}>
      <div className="form-grid">
        {errors.length > 0 && (
          <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid var(--color-expense)', borderRadius: 6, padding: '0.6rem', marginBottom: '0.5rem' }}>
            {errors.map((e, i) => <div key={i} style={{ fontSize: '0.82rem', color: 'var(--color-expense)' }}>• {e}</div>)}
          </div>
        )}
        <div className="form-row">
          <label className="form-label">From</label>
          <select className="form-input" value={fromId} onChange={e => setFromId(e.target.value)}>
            {assets.map(a => <option key={a.id} value={a.id}>{a.name} — {fmt(a.currentValue, a.currency)}</option>)}
          </select>
        </div>
        <div className="form-row">
          <label className="form-label">To</label>
          <select className="form-input" value={toId} onChange={e => setToId(e.target.value)}>
            {assets.map(a => <option key={a.id} value={a.id}>{a.name} — {fmt(a.currentValue, a.currency)}</option>)}
          </select>
        </div>
        <div className="form-row">
          <label className="form-label">Amount</label>
          <input type="number" className="form-input" value={amount}
            onChange={e => setAmount(e.target.value)} min="0.01" step="0.01" placeholder="0.00" />
        </div>
        {fromId && toId && fromId !== toId && parseFloat(amount) > 0 && (
          <div style={{ padding: '0.6rem 0.75rem', background: 'var(--bg-base)', borderRadius: 6, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            <strong>{fromAsset?.name}</strong> {fmt(fromAsset?.currentValue ?? 0)} → {fmt((fromAsset?.currentValue ?? 0) - parseFloat(amount))}<br />
            <strong>{toAsset?.name}</strong> {fmt(toAsset?.currentValue ?? 0)} → {fmt((toAsset?.currentValue ?? 0) + parseFloat(amount))}
          </div>
        )}
        <div className="form-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>Transfer</button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Quick value update modal ─────────────────────────────────

function QuickValueForm({ account, asset, onClose }: { account: Account; asset: AccountAsset; onClose: () => void }) {
  const updateAccountAsset = useAppStore(s => s.updateAccountAsset)
  const [value,  setValue]  = useState(String(asset.currentValue))
  const [error,  setError]  = useState('')

  function handleSave() {
    const v = parseFloat(value)
    if (isNaN(v) || v < 0) { setError('Value must be a non-negative number.'); return }
    updateAccountAsset(account.id, asset.id, { currentValue: v })
    onClose()
  }

  return (
    <Modal title={`Update Value — ${asset.name}`} onClose={onClose} width={340}>
      <div className="form-grid">
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
          Current: <strong>{fmt(asset.currentValue, asset.currency)}</strong>
        </div>
        {error && <div style={{ color: 'var(--color-expense)', fontSize: '0.82rem' }}>{error}</div>}
        <div className="form-row">
          <label className="form-label">New value</label>
          <input type="number" className="form-input" value={value}
            onChange={e => setValue(e.target.value)} min="0" step="0.01" autoFocus />
        </div>
        <div className="form-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>Update</button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Main component ───────────────────────────────────────────

export default function AccountsList() {
  const currentFile        = useAppStore(s => s.currentFile)
  const calcResult         = useAppStore(s => s.calculationResult)
  const deleteAccount      = useAppStore(s => s.deleteAccount)
  const deleteAccountAsset = useAppStore(s => s.deleteAccountAsset)
  const addUpdate          = useAppStore(s => s.addAccountBalanceUpdate)
  const editUpdate         = useAppStore(s => s.updateAccountBalanceUpdate)
  const delUpdate          = useAppStore(s => s.deleteAccountBalanceUpdate)

  const accounts = currentFile?.accounts ?? []
  const allUpdates = useMemo(
    () => (currentFile?.accountBalanceUpdates ?? []).slice()
      .sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt)),
    [currentFile?.accountBalanceUpdates]
  )
  const variances: ReconciliationVariance[] = calcResult?.reconciliationVariances ?? []

  // ── Panel open/close state ────────────────────────────────
  // panelOverrides maps `${accountId}:${section}` → explicit open/closed state.
  // Absent keys use the default: assets open when the account has assets, history closed.
  const [panelOverrides, setPanelOverrides] = useState<Map<string, boolean>>(new Map())

  function isPanelOpen(account: Account, section: 'assets' | 'history'): boolean {
    const key = `${account.id}:${section}`
    const override = panelOverrides.get(key)
    if (override !== undefined) return override
    return section === 'assets' && (account.assets ?? []).length > 0
  }

  function togglePanel(account: Account, section: 'assets' | 'history') {
    const key = `${account.id}:${section}`
    const next = !isPanelOpen(account, section)
    setPanelOverrides(prev => {
      const m = new Map(prev)
      m.set(key, next)
      return m
    })
  }

  // ── Modal state ───────────────────────────────────────────

  type AccountModal = { mode: 'add' | 'edit'; existing?: Account }
  type AssetModal   = { accountId: string; accountName: string; mode: 'add' | 'edit'; existing?: AccountAsset }

  const [showAccountForm, setShowAccountForm] = useState<AccountModal | null>(null)
  const [showAssetForm,   setShowAssetForm]   = useState<AssetModal | null>(null)
  const [showQuickValue,  setShowQuickValue]  = useState<{ account: Account; asset: AccountAsset } | null>(null)
  const [showAssetXfer,   setShowAssetXfer]   = useState<Account | null>(null)
  const [showUpdateForm,  setShowUpdateForm]  = useState<{ accountId?: string; existing?: AccountBalanceUpdate } | null>(null)
  const [showInterXfer,   setShowInterXfer]   = useState(false)
  const [deleteConfirm,   setDeleteConfirm]   = useState<{ type: string; id: string; extra?: string; name: string } | null>(null)

  // ── Summary ───────────────────────────────────────────────

  const totalLiquid = accounts.filter(a => a.liquidity === 'liquid').reduce((s, a) => s + computeBalance(a, allUpdates), 0)
  const totalTiedUp = accounts.filter(a => a.liquidity === 'tiedUp').reduce((s, a) => s + computeBalance(a, allUpdates), 0)

  // ── Delete ────────────────────────────────────────────────

  function execDelete() {
    if (!deleteConfirm) return
    const { type, id, extra } = deleteConfirm
    if (type === 'account') deleteAccount(id)
    if (type === 'asset' && extra) deleteAccountAsset(extra, id)
    if (type === 'update') delUpdate(id)
    setDeleteConfirm(null)
  }

  // ── History panel ─────────────────────────────────────────

  function renderHistory(account: Account) {
    const history = allUpdates.filter(u => u.accountId === account.id)
    if (history.length === 0) return (
      <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: 0 }}>No balance updates yet.</p>
    )
    const deltas = history.map((u, i) => i === history.length - 1 ? null : u.balance - history[i + 1].balance)

    return (
      <table className="data-table" style={{ fontSize: '0.78rem' }}>
        <thead>
          <tr>
            <th>Effective</th>
            <th style={{ textAlign: 'right' }}>Balance</th>
            <th style={{ textAlign: 'right' }}>Δ</th>
            <th>Type</th>
            <th>Comment</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {history.map((u, i) => {
            const d = deltas[i]
            const variance = variances.find(v => v.updateId === u.id)
            return (
              <tr key={u.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtDT(u.effectiveAt)}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(u.balance, account.currency)}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                  color: d == null ? undefined : d > 0 ? 'var(--color-income)' : 'var(--color-expense)' }}>
                  {d == null ? '—' : (d >= 0 ? '+' : '') + fmt(d, account.currency)}
                </td>
                <td>
                  {u.isInitialSetup ? <span className="badge badge-neutral">Setup</span>
                   : u.isTransfer   ? <span className="badge badge-income">Transfer</span>
                   :                  <span className="badge badge-neutral">Update</span>}
                </td>
                <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                  {variance && <span title={`Variance: ${fmt(variance.variance)}`} style={{ color: 'var(--color-warning)', marginRight: 4 }}>⚠</span>}
                  {u.comment ?? '—'}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button className="btn btn-xs btn-ghost" onClick={() => setShowUpdateForm({ accountId: account.id, existing: u })}>Edit</button>
                    {!u.isInitialSetup && (
                      <button className="btn btn-xs btn-danger-ghost" onClick={() => setDeleteConfirm({ type: 'update', id: u.id, name: fmtDT(u.effectiveAt) })}>Del</button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    )
  }

  // ── Assets panel ──────────────────────────────────────────

  function renderAssets(account: Account) {
    const assets = account.assets ?? []
    return (
      <>
        {/* Panel header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Assets
            {assets.length > 0 && (
              <span style={{ fontWeight: 400, marginLeft: 8, color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0 }}>
                {fmt(assets.reduce((s, a) => s + a.currentValue, 0), account.currency)} total
              </span>
            )}
          </span>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {assets.length >= 2 && (
              <button className="btn btn-xs btn-ghost" onClick={() => setShowAssetXfer(account)}>⇌ Transfer</button>
            )}
            <button className="btn btn-xs btn-primary" onClick={() => setShowAssetForm({ accountId: account.id, accountName: account.name, mode: 'add' })}>
              + Add Asset
            </button>
          </div>
        </div>

        {assets.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: 0 }}>
            No assets yet. Add an asset to drive this account's balance from sub-positions.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {assets.map(asset => {
              const liq = asset.liquidationRule
              const liqDesc = !liq ? null
                : liq.mode === 'fixedDelay'
                ? `Sale: ${liq.saleDelayDays ?? 0}d  ·  Transfer: ${liq.transferDelayDays ?? 0}d${liq.useBusinessDays ? ' (business)' : ''}`
                : liq.mode === 'periodicAvailability'
                ? `Available every ${liq.periodicInterval} ${liq.periodicUnit}(s)`
                : 'Specific dates'

              return (
                <div key={asset.id} style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.55rem 0.75rem',
                  background: 'var(--bg-card)', borderRadius: 6,
                  border: '1px solid var(--border)'
                }}>
                  {/* Colour stripe */}
                  <div style={{
                    width: 3, alignSelf: 'stretch', borderRadius: 2, flexShrink: 0,
                    background: asset.liquidity === 'liquid' ? 'var(--color-income)' : 'var(--color-neutral, #6b7280)'
                  }} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{asset.name}</div>
                    {liqDesc && <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 1 }}>{liqDesc}</div>}
                    {asset.fees && asset.fees.length > 0 && (
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                        Fees: {asset.fees.map(f => f.mode === 'fixed' ? `$${f.amount}` : `${f.percentage}%`).join(', ')}
                      </div>
                    )}
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', fontVariantNumeric: 'tabular-nums' }}>
                      {fmt(asset.currentValue, asset.currency)}
                    </div>
                    <div style={{ fontSize: '0.72rem', marginTop: 1 }}>
                      <span className={`badge ${asset.liquidity === 'liquid' ? 'badge-income' : 'badge-neutral'}`} style={{ fontSize: '0.68rem' }}>
                        {asset.liquidity === 'liquid' ? 'Liquid' : 'Tied up'}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flexShrink: 0 }}>
                    <button className="btn btn-xs btn-primary" style={{ fontSize: '0.72rem' }}
                      onClick={() => setShowQuickValue({ account, asset })}>
                      Update Value
                    </button>
                    <div style={{ display: 'flex', gap: '0.2rem' }}>
                      <button className="btn btn-xs btn-ghost" style={{ fontSize: '0.72rem' }}
                        onClick={() => setShowAssetForm({ accountId: account.id, accountName: account.name, mode: 'edit', existing: asset })}>
                        Edit
                      </button>
                      <button className="btn btn-xs btn-danger-ghost" style={{ fontSize: '0.72rem' }}
                        onClick={() => setDeleteConfirm({ type: 'asset', id: asset.id, extra: account.id, name: asset.name })}>
                        Del
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </>
    )
  }

  // ── Account row ───────────────────────────────────────────

  function renderAccount(account: Account) {
    const balance    = computeBalance(account, allUpdates)
    const hasAssets  = (account.assets ?? []).length > 0
    const assetCount = account.assets?.length ?? 0
    const histCount  = allUpdates.filter(u => u.accountId === account.id).length
    const assetsOpen = isPanelOpen(account, 'assets')
    const histOpen   = isPanelOpen(account, 'history')
    const lastUpdate = allUpdates.find(u => u.accountId === account.id && !u.isInitialSetup)

    return (
      <div key={account.id} style={{
        border: '1px solid var(--border)',
        borderRadius: 8,
        overflow: 'hidden',
        background: 'var(--bg-panel)',
        marginBottom: '0.75rem'
      }}>
        {/* Account header row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto auto',
          gap: '0.75rem',
          alignItems: 'center',
          padding: '0.75rem 1rem',
          background: 'var(--bg-card)',
          borderBottom: (assetsOpen || histOpen) ? '1px solid var(--border)' : undefined
        }}>
          {/* Name + meta */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{account.name}</span>
              <span className={`badge ${account.liquidity === 'liquid' ? 'badge-income' : 'badge-neutral'}`}>
                {account.liquidity === 'liquid' ? 'Liquid' : 'Tied up'}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{account.type}</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
              {hasAssets
                ? `Balance from ${assetCount} asset${assetCount !== 1 ? 's' : ''}`
                : lastUpdate ? `Updated ${fmtDT(lastUpdate.effectiveAt)}` : 'Setup balance'}
            </div>
          </div>

          {/* Balance */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', fontVariantNumeric: 'tabular-nums' }}>
              {fmt(balance, account.currency)}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {!hasAssets && (
              <button className="btn btn-xs btn-primary" onClick={() => setShowUpdateForm({ accountId: account.id })}>
                Update Balance
              </button>
            )}
            <button
              className={`btn btn-xs ${assetsOpen ? 'btn-secondary' : 'btn-ghost'}`}
              onClick={() => togglePanel(account, 'assets')}
            >
              Assets ({assetCount}) {assetsOpen ? '▲' : '▼'}
            </button>
            {!hasAssets && (
              <button
                className={`btn btn-xs ${histOpen ? 'btn-secondary' : 'btn-ghost'}`}
                onClick={() => togglePanel(account, 'history')}
              >
                History ({histCount}) {histOpen ? '▲' : '▼'}
              </button>
            )}
            <button className="btn btn-xs btn-ghost" onClick={() => setShowAccountForm({ mode: 'edit', existing: account })}>Edit</button>
            <button className="btn btn-xs btn-danger-ghost" onClick={() => setDeleteConfirm({ type: 'account', id: account.id, name: account.name })}>Delete</button>
          </div>
        </div>

        {/* Assets panel — open by default when assets exist */}
        {assetsOpen && (
          <div style={{ padding: '0.85rem 1rem 0.85rem 1.25rem', borderBottom: histOpen ? '1px solid var(--border)' : undefined }}>
            {renderAssets(account)}
          </div>
        )}

        {/* History panel — closed by default */}
        {histOpen && !hasAssets && (
          <div style={{ padding: '0.75rem 1rem' }}>
            <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
              Balance history
            </div>
            {renderHistory(account)}
          </div>
        )}
      </div>
    )
  }

  // ─── Render ───────────────────────────────────────────────

  if (!currentFile) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>No file open.</div>

  return (
    <div style={{ padding: '1.5rem', height: '100%', overflow: 'auto' }}>
      {/* Summary */}
      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Total Liquid',  value: totalLiquid,                color: 'var(--color-income)' },
          { label: 'Total Tied Up', value: totalTiedUp,                color: undefined },
          { label: 'Net Worth',     value: totalLiquid + totalTiedUp,  color: undefined }
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={s.color ? { color: s.color } : undefined}>{fmt(s.value)}</div>
          </div>
        ))}
      </div>

      {variances.length > 0 && (
        <div className="warning-banner" style={{ marginBottom: '1rem' }}>
          <strong>{variances.length} reconciliation variance{variances.length > 1 ? 's' : ''}</strong> — expand an account's history to inspect.
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Accounts</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {accounts.length >= 2 && (
            <button className="btn btn-ghost btn-sm" onClick={() => setShowInterXfer(true)}>⇌ Transfer Between Accounts</button>
          )}
          <button className="btn btn-primary btn-sm" onClick={() => setShowAccountForm({ mode: 'add' })}>+ Add Account</button>
        </div>
      </div>

      {accounts.length === 0
        ? <div className="empty-state">No accounts yet.</div>
        : accounts.map(renderAccount)}

      {/* Modals */}
      {showAccountForm && <AccountForm mode={showAccountForm.mode} existing={showAccountForm.existing} onClose={() => setShowAccountForm(null)} />}
      {showAssetForm && <AccountAssetForm accountId={showAssetForm.accountId} accountName={showAssetForm.accountName} mode={showAssetForm.mode} existing={showAssetForm.existing} onClose={() => setShowAssetForm(null)} />}
      {showQuickValue && <QuickValueForm account={showQuickValue.account} asset={showQuickValue.asset} onClose={() => setShowQuickValue(null)} />}
      {showAssetXfer && <AssetTransferForm account={showAssetXfer} onClose={() => setShowAssetXfer(null)} />}
      {showUpdateForm !== null && (
        <AccountBalanceUpdateForm accountId={showUpdateForm.accountId} accounts={accounts}
          existing={showUpdateForm.existing}
          onSave={data => { if (showUpdateForm.existing) editUpdate(showUpdateForm.existing.id, data); else addUpdate(data); setShowUpdateForm(null) }}
          onClose={() => setShowUpdateForm(null)} />
      )}
      {showInterXfer && <TransferForm accounts={accounts} onClose={() => setShowInterXfer(false)} />}

      {deleteConfirm && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header"><h3>Confirm delete</h3></div>
            <div className="modal-body">
              <p>{deleteConfirm.type === 'update' ? `Delete the balance entry from ${deleteConfirm.name}?` : `Delete "${deleteConfirm.name}"?`}</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={execDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
