// ============================================================
// CashFlow Planner — App Shell (v2)
// Grid layout: 36px top bar + 220px sidebar + fluid main
// ============================================================

import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '../../store/appStore'
import type { AppPage, AppNotification } from '../../shared/types'

interface NavGroup {
  label: string
  items: { page: AppPage; icon: string; label: string; disabled?: boolean }[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Plan',
    items: [
      { page: 'dashboard', icon: '◉', label: 'Dashboard' },
      { page: 'lineItems', icon: '≡',  label: 'Line Items' },
    ]
  },
  {
    label: 'Data',
    items: [
      { page: 'accounts',   icon: '⬡', label: 'Accounts' },
      { page: 'categories', icon: '🏷', label: 'Categories' },
    ]
  },
  {
    label: 'Output',
    items: [
      { page: 'reports',  icon: '📋', label: 'Reports' },
      { page: 'settings', icon: '⚙',  label: 'Settings' },
    ]
  }
]

function warningTitle(type: AppNotification['type']): string {
  if (type === 'negativeCumulative')    return 'Cumulative deficit'
  if (type === 'negativeBalance')       return 'Negative liquid balance'
  if (type === 'largeFutureObligation') return 'Large future outflow'
  return 'Alert'
}

function warningIcon(type: AppNotification['type']): string {
  if (type === 'negativeCumulative')    return '📉'
  if (type === 'negativeBalance')       return '⚠️'
  if (type === 'largeFutureObligation') return '💸'
  return '🔔'
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const currentPage           = useAppStore(s => s.currentPage)
  const currentFile           = useAppStore(s => s.currentFile)
  const currentFilePath       = useAppStore(s => s.currentFilePath)
  const saveStatus            = useAppStore(s => s.saveStatus)
  const lastSavedAt           = useAppStore(s => s.lastSavedAt)
  const hasUnsavedChanges     = useAppStore(s => s.hasUnsavedChanges)
  const calcResult            = useAppStore(s => s.calculationResult)
  const dismissedIds          = useAppStore(s => s.dismissedNotificationIds)
  const setCurrentPage        = useAppStore(s => s.setCurrentPage)
  const saveCurrentFile       = useAppStore(s => s.saveCurrentFile)
  const dismissNotification   = useAppStore(s => s.dismissNotification)
  const clearAllNotifications = useAppStore(s => s.clearAllNotifications)

  const [notifOpen, setNotifOpen] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!notifOpen) return
    function handler(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [notifOpen])

  const allNotifications: AppNotification[] = (calcResult?.warnings ?? []).map(w => ({
    id: `${w.type}-${w.periodKey}`,
    type: w.type,
    title: warningTitle(w.type),
    description: w.description
  }))
  const activeNotifications = allNotifications.filter(n => !dismissedIds.includes(n.id))
  const count = activeNotifications.length

  const fileName = currentFile?.fileMetadata.name ?? 'Untitled'
  const shortPath = currentFilePath ? currentFilePath.split(/[/\\]/).pop() ?? '' : ''
  const currency  = currentFile?.fileMetadata.currency ?? 'USD'

  // Compute account totals for sidebar footer
  const accounts = currentFile?.accounts ?? []
  const liquidTotal = accounts.reduce((s, a) => {
    const base = a.liquidity === 'liquid' ? (a.balance ?? 0) : 0
    const assetLiquid = (a.assets ?? []).filter(x => x.liquidity === 'liquid').reduce((t, x) => t + (x.currentValue ?? 0), 0)
    return s + base + assetLiquid
  }, 0)

  const statusLabel = (() => {
    switch (saveStatus) {
      case 'saved':   return lastSavedAt ? `Saved ${lastSavedAt.toLocaleTimeString()}` : 'Saved'
      case 'unsaved': return 'Unsaved changes'
      case 'saving':  return 'Saving…'
      case 'failed':  return 'Save failed'
    }
  })()

  const fmt = (n: number) => {
    const abs = Math.abs(n)
    if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000)     return `$${(abs / 1_000).toFixed(1)}k`
    return `$${abs.toFixed(0)}`
  }

  return (
    <div className="app-layout-v2">
      {/* ── Top status bar ── */}
      <header className="top-bar-v2">
        <div className="top-bar-left">
          <div className="top-bar-brand">
            <span className="top-bar-dot" />
            <span>CashFlow Planner</span>
          </div>
          <div className="top-bar-sep" />
          <div className="top-bar-file">
            <span>📁</span>
            <b>{fileName}</b>
            {shortPath && shortPath !== fileName && (
              <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>— {shortPath}</span>
            )}
          </div>
          <div className="save-indicator" data-status={saveStatus}>
            <span className="save-dot-v2" />
            <span>{statusLabel}</span>
          </div>
        </div>

        <div className="top-bar-spacer" />

        <div className="top-bar-right">
          <button
            className="top-bar-btn"
            onClick={saveCurrentFile}
            disabled={!hasUnsavedChanges}
            title="Save (Ctrl+S)"
          >
            💾 Save
          </button>
          <div className="top-bar-sep" />
          <div ref={bellRef} style={{ position: 'relative' }}>
            <button
              className="top-bar-btn"
              onClick={() => setNotifOpen(o => !o)}
              title={count > 0 ? `${count} alert${count > 1 ? 's' : ''}` : 'No alerts'}
            >
              🔔
              {count > 0 && <span className="top-bar-badge">{count > 9 ? '9+' : count}</span>}
            </button>

            {notifOpen && (
              <div className="notif-popover">
                <div className="notif-header">
                  <b>Alerts</b>
                  {count > 0 && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => { clearAllNotifications(); setNotifOpen(false) }}
                    >
                      Dismiss all
                    </button>
                  )}
                </div>
                <div className="notif-list">
                  {activeNotifications.length === 0 ? (
                    <div className="notif-empty">All clear — no projected risks.</div>
                  ) : (
                    activeNotifications.map(n => (
                      <div key={n.id} className="notif-item">
                        <span className="notif-icon">{warningIcon(n.type)}</span>
                        <div className="notif-meta">
                          <b>{n.title}</b>
                          <span>{n.description}</span>
                        </div>
                        <button
                          className="notif-close"
                          onClick={() => dismissNotification(n.id)}
                          title="Dismiss"
                        >✕</button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Sidebar ── */}
      <aside className="sidebar-v2">
        <nav className="side-nav-v2">
          {NAV_GROUPS.map(group => (
            <div key={group.label}>
              <div className="side-section-label">{group.label}</div>
              {group.items.map(item => (
                <button
                  key={item.page}
                  className={`side-item-v2 ${currentPage === item.page ? 'active' : ''} ${item.disabled ? 'disabled' : ''}`}
                  onClick={() => !item.disabled && setCurrentPage(item.page)}
                  disabled={item.disabled}
                >
                  <span className="side-icon-v2">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="side-footer-v2">
          {currentFile && (
            <>
              <div className="side-foot-row-v2">
                <span>File</span>
                <span className="side-foot-val">{shortPath || fileName}</span>
              </div>
              <div className="side-foot-row-v2">
                <span>Currency</span>
                <b>{currency}</b>
              </div>
              {accounts.length > 0 && (
                <div className="side-foot-row-v2">
                  <span>Liquid</span>
                  <b style={{ color: 'var(--income)' }}>{fmt(liquidTotal)}</b>
                </div>
              )}
              <div className="side-foot-row-v2">
                <span>Initial balance</span>
                <b>{fmt(currentFile.fileMetadata.initialLiquidBalance)}</b>
              </div>
            </>
          )}
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="main-v2">
        {children}
      </main>
    </div>
  )
}
