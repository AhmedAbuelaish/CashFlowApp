// ============================================================
// CashFlow Planner — App Shell
// Includes sidebar nav + notification bell with dismissable popover
// ============================================================

import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '../../store/appStore'
import type { AppPage, AppNotification } from '../../shared/types'

const NAV_ITEMS: { page: AppPage; icon: string; label: string }[] = [
  { page: 'dashboard',  icon: '◉', label: 'Dashboard' },
  { page: 'lineItems',  icon: '≡', label: 'Line Items' },
  { page: 'accounts',   icon: '⬡', label: 'Accounts' },
  { page: 'categories', icon: '🏷', label: 'Categories' },
  { page: 'reports',    icon: '📋', label: 'Reports' },
  { page: 'settings',  icon: '⚙', label: 'Settings' }
]

// Derive AppNotification[] from CashFlowWarning[] for display
function warningIcon(type: AppNotification['type']): string {
  if (type === 'negativeCumulative') return '📉'
  if (type === 'negativeBalance')    return '⚠️'
  if (type === 'largeFutureObligation') return '💸'
  return '🔔'
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const currentPage            = useAppStore(s => s.currentPage)
  const currentFile            = useAppStore(s => s.currentFile)
  const currentFilePath        = useAppStore(s => s.currentFilePath)
  const saveStatus             = useAppStore(s => s.saveStatus)
  const lastSavedAt            = useAppStore(s => s.lastSavedAt)
  const hasUnsavedChanges      = useAppStore(s => s.hasUnsavedChanges)
  const calcResult             = useAppStore(s => s.calculationResult)
  const dismissedIds           = useAppStore(s => s.dismissedNotificationIds)
  const setCurrentPage         = useAppStore(s => s.setCurrentPage)
  const saveCurrentFile        = useAppStore(s => s.saveCurrentFile)
  const dismissNotification    = useAppStore(s => s.dismissNotification)
  const clearAllNotifications  = useAppStore(s => s.clearAllNotifications)

  const [notifOpen, setNotifOpen] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)

  // Close popover when clicking outside
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

  // Build notification list from calculation warnings
  const allNotifications: AppNotification[] = (calcResult?.warnings ?? []).map(w => ({
    id: `${w.type}-${w.periodKey}`,
    type: w.type,
    title: w.type === 'negativeCumulative'    ? 'Cumulative deficit'
         : w.type === 'negativeBalance'       ? 'Negative liquid balance'
         : 'Large future outflow',
    description: w.description
  }))

  const activeNotifications = allNotifications.filter(n => !dismissedIds.includes(n.id))
  const count = activeNotifications.length

  const statusLabel = (() => {
    switch (saveStatus) {
      case 'saved':   return lastSavedAt ? `Saved ${lastSavedAt.toLocaleTimeString()}` : 'Saved'
      case 'unsaved': return 'Unsaved changes'
      case 'saving':  return 'Saving…'
      case 'failed':  return 'Save failed'
    }
  })()

  const fileName = currentFile?.fileMetadata.name ?? 'Untitled'
  const filePath = currentFilePath ? currentFilePath.split(/[/\\]/).pop() : ''

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>{fileName}</h1>
          {filePath && <p title={currentFilePath ?? ''}>{filePath}</p>}
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map(item => (
            <button
              key={item.page}
              className={`nav-item ${currentPage === item.page ? 'active' : ''}`}
              onClick={() => setCurrentPage(item.page)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="save-status">
            <div className={`save-dot ${saveStatus}`} />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {statusLabel}
            </span>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            style={{ width: '100%', marginTop: '8px' }}
            onClick={saveCurrentFile}
            disabled={!hasUnsavedChanges}
          >
            Save
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="main-content">
        {/* Top bar with notification bell */}
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'flex-end', padding: '0.5rem 1rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
          <div ref={bellRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setNotifOpen(o => !o)}
              title={count > 0 ? `${count} notification${count > 1 ? 's' : ''}` : 'No notifications'}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '0.3rem 0.5rem', borderRadius: 6, fontSize: '1.1rem',
                color: count > 0 ? 'var(--color-warning)' : 'var(--text-muted)',
                position: 'relative', lineHeight: 1
              }}
            >
              🔔
              {count > 0 && (
                <span style={{
                  position: 'absolute', top: -2, right: -2,
                  background: 'var(--color-expense)', color: '#fff',
                  borderRadius: '50%', fontSize: '0.62rem', fontWeight: 700,
                  width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  lineHeight: 1
                }}>
                  {count > 9 ? '9+' : count}
                </span>
              )}
            </button>

            {/* Notification popover */}
            {notifOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 200,
                background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8,
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)', width: 340, maxHeight: 420, overflowY: 'auto'
              }}>
                {/* Popover header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0.85rem', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>Notifications</span>
                  {count > 0 && (
                    <button
                      onClick={() => { clearAllNotifications(); setNotifOpen(false) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--text-muted)' }}
                    >
                      Clear all
                    </button>
                  )}
                </div>

                {/* Notification items */}
                {activeNotifications.length === 0 ? (
                  <div style={{ padding: '1.25rem 0.85rem', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>
                    No active notifications
                  </div>
                ) : (
                  activeNotifications.map(n => (
                    <div key={n.id} style={{ display: 'flex', gap: '0.65rem', padding: '0.65rem 0.85rem', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
                      <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: 1 }}>{warningIcon(n.type)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: 2 }}>{n.title}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{n.description}</div>
                      </div>
                      <button
                        onClick={() => dismissNotification(n.id)}
                        title="Dismiss"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.8rem', flexShrink: 0, padding: '0 2px', lineHeight: 1 }}
                      >
                        ✕
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {children}
      </main>
    </div>
  )
}
