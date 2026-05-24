// ============================================================
// CashFlow Planner — Accounts & Assets List
// ============================================================

import React, { useState } from 'react'
import { useAppStore } from '../../store/appStore'
import type { Account, Asset } from '../../shared/types'
import { AccountForm, AssetForm } from './AccountForm'

export default function AccountsList() {
  const currentFile = useAppStore(s => s.currentFile)
  const deleteAccount = useAppStore(s => s.deleteAccount)
  const deleteAsset = useAppStore(s => s.deleteAsset)

  const accounts = currentFile?.accounts ?? []
  const assets = currentFile?.assets ?? []

  const [showAccountForm, setShowAccountForm] = useState<{ mode: 'add' | 'edit'; item?: Account } | null>(null)
  const [showAssetForm, setShowAssetForm] = useState<{ mode: 'add' | 'edit'; item?: Asset } | null>(null)
  const [deleteAccountConfirm, setDeleteAccountConfirm] = useState<Account | null>(null)
  const [deleteAssetConfirm, setDeleteAssetConfirm] = useState<Asset | null>(null)

  const liquidAccounts = accounts.filter(a => a.liquidity === 'liquid')
  const tiedUpAccounts = accounts.filter(a => a.liquidity === 'tiedUp')
  const liquidAssets = assets.filter(a => a.liquidity === 'liquid')
  const tiedUpAssets = assets.filter(a => a.liquidity === 'tiedUp')

  const totalLiquid = liquidAccounts.reduce((s, a) => s + a.balance, 0)
    + liquidAssets.reduce((s, a) => s + a.currentValue, 0)
  const totalTiedUp = tiedUpAccounts.reduce((s, a) => s + a.balance, 0)
    + tiedUpAssets.reduce((s, a) => s + a.currentValue, 0)

  function computeNetLiquidation(asset: Asset): number {
    let val = asset.currentValue
    for (const fee of asset.fees ?? []) {
      if (fee.mode === 'fixed') val -= (fee.amount ?? 0)
      else val -= val * (fee.percentage ?? 0) / 100
    }
    if (asset.taxPercentage) val -= val * asset.taxPercentage / 100
    return Math.max(0, val)
  }

  const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

  function accountForId(id: string) {
    return accounts.find(a => a.id === id)
  }

  const liqRuleDesc = (asset: Asset) => {
    const r = asset.liquidationRule
    if (!r) return 'No liquidation rule'
    if (r.mode === 'fixedDelay') return `Fixed delay: ${(r.saleDelayDays ?? 0) + (r.transferDelayDays ?? 0)} day(s)`
    if (r.mode === 'periodicAvailability') return `Periodic: every ${r.periodicInterval} ${r.periodicUnit}(s)`
    if (r.mode === 'specificDates') return `Specific dates: ${(r.specificDates ?? []).join(', ')}`
    return '—'
  }

  return (
    <div style={{ padding: '1.5rem', height: '100%', overflow: 'auto' }}>

      {/* Header + Summary */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Accounts & Assets</h1>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
            {accounts.length} account{accounts.length !== 1 ? 's' : ''} · {assets.length} asset{assets.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={() => setShowAccountForm({ mode: 'add' })}>+ Account</button>
          <button className="btn btn-secondary" onClick={() => setShowAssetForm({ mode: 'add' })}>+ Asset</button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card" style={{ padding: '1rem', border: '1px solid rgba(52,211,153,0.2)' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4 }}>Total Liquid</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--income)' }}>{fmt(totalLiquid)}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
            {liquidAccounts.length} account{liquidAccounts.length !== 1 ? 's' : ''} + {liquidAssets.length} asset{liquidAssets.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div className="card" style={{ padding: '1rem', border: '1px solid rgba(167,139,250,0.2)' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4 }}>Total Tied Up</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--cumulative-pos)' }}>{fmt(totalTiedUp)}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
            Estimated net after fees & tax: {fmt(tiedUpAssets.reduce((s, a) => s + computeNetLiquidation(a), 0))}
          </div>
        </div>
      </div>

      {accounts.length === 0 && assets.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🏦</div>
          <div className="empty-state-title">No accounts or assets yet</div>
          <div className="empty-state-desc">Add your liquid accounts and tied-up assets to track net worth and liquidation availability.</div>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '1rem' }}>
            <button className="btn btn-secondary" onClick={() => setShowAccountForm({ mode: 'add' })}>+ Add Account</button>
            <button className="btn btn-secondary" onClick={() => setShowAssetForm({ mode: 'add' })}>+ Add Asset</button>
          </div>
        </div>
      ) : (
        <>
          {/* Accounts Section */}
          {accounts.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
                Accounts
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {accounts.map(acc => (
                  <div key={acc.id} className="card" style={{ padding: '0.9rem 1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0,
                      background: acc.liquidity === 'liquid' ? 'rgba(52,211,153,0.15)' : 'rgba(167,139,250,0.15)'
                    }}>
                      {acc.type === 'checking' ? '🏦' : acc.type === 'savings' ? '💰' : acc.type === 'investment' ? '📈' : acc.type === 'credit_card' ? '💳' : '🏛️'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{acc.name}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 1 }}>
                        {acc.type} · {acc.liquidity === 'liquid' ? 'Liquid' : 'Tied Up'} · {acc.currency}
                      </div>
                      {acc.notes && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 1 }}>{acc.notes}</div>}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '1.05rem', color: acc.balance >= 0 ? 'var(--income)' : 'var(--expense)' }}>
                        {fmt(acc.balance)}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>balance</div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                      <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                        onClick={() => setShowAccountForm({ mode: 'edit', item: acc })}>Edit</button>
                      <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', color: 'var(--expense)' }}
                        onClick={() => setDeleteAccountConfirm(acc)}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Assets Section */}
          {assets.length > 0 && (
            <div>
              <h2 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
                Assets
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {assets.map(asset => {
                  const netLiq = computeNetLiquidation(asset)
                  const linkedAccount = accountForId(asset.accountId)
                  return (
                    <div key={asset.id} className="card" style={{ padding: '0.9rem 1rem', display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0,
                        background: 'rgba(167,139,250,0.15)'
                      }}>
                        📦
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{asset.name}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 1 }}>
                          {asset.liquidity === 'tiedUp' ? 'Tied Up' : 'Liquid'} · {asset.currency}
                          {linkedAccount ? ` · ${linkedAccount.name}` : ''}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                          {liqRuleDesc(asset)}
                        </div>
                        {(asset.fees ?? []).length > 0 && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                            Fees: {(asset.fees ?? []).map(f => f.mode === 'fixed' ? `$${f.amount}` : `${f.percentage}%`).join(', ')}
                            {asset.taxPercentage ? ` + ${asset.taxPercentage}% tax` : ''}
                          </div>
                        )}
                        {asset.notes && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 1 }}>{asset.notes}</div>}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--cumulative-pos)' }}>
                          {fmt(asset.currentValue)}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>gross value</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--income)', marginTop: 2 }}>{fmt(netLiq)}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>est. net</div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                        <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                          onClick={() => setShowAssetForm({ mode: 'edit', item: asset })}>Edit</button>
                        <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', color: 'var(--expense)' }}
                          onClick={() => setDeleteAssetConfirm(asset)}>✕</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {showAccountForm && (
        <AccountForm
          mode={showAccountForm.mode}
          account={showAccountForm.item}
          onClose={() => setShowAccountForm(null)}
        />
      )}

      {showAssetForm && (
        <AssetForm
          mode={showAssetForm.mode}
          asset={showAssetForm.item}
          onClose={() => setShowAssetForm(null)}
        />
      )}

      {deleteAccountConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteAccountConfirm(null)}>
          <div className="modal" style={{ maxWidth: 400, width: '90%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Delete Account?</h2>
              <button className="modal-close" onClick={() => setDeleteAccountConfirm(null)}>✕</button>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              Delete <strong style={{ color: 'var(--text-primary)' }}>{deleteAccountConfirm.name}</strong>? This cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button className="btn btn-secondary" onClick={() => setDeleteAccountConfirm(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ background: 'var(--expense)' }}
                onClick={() => { deleteAccount(deleteAccountConfirm.id); setDeleteAccountConfirm(null) }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {deleteAssetConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteAssetConfirm(null)}>
          <div className="modal" style={{ maxWidth: 400, width: '90%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Delete Asset?</h2>
              <button className="modal-close" onClick={() => setDeleteAssetConfirm(null)}>✕</button>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              Delete <strong style={{ color: 'var(--text-primary)' }}>{deleteAssetConfirm.name}</strong>? This cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button className="btn btn-secondary" onClick={() => setDeleteAssetConfirm(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ background: 'var(--expense)' }}
                onClick={() => { deleteAsset(deleteAssetConfirm.id); setDeleteAssetConfirm(null) }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
