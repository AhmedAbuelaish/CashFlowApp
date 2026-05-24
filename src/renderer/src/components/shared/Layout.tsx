import React from 'react'
import { useAppStore } from '../../store/appStore'
import type { AppPage } from '../../shared/types'

const NAV_ITEMS: { page: AppPage; icon: string; label: string }[] = [
  { page: 'dashboard',  icon: '◉', label: 'Dashboard' },
  { page: 'lineItems',  icon: '≡', label: 'Line Items' },
  { page: 'accounts',   icon: '⬡', label: 'Accounts' },
  { page: 'reports',    icon: '📋', label: 'Reports' },
  { page: 'settings',  icon: '⚙', label: 'Settings' }
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const currentPage = useAppStore(s => s.currentPage)
  const currentFile = useAppStore(s => s.currentFile)
  const currentFilePath = useAppStore(s => s.currentFilePath)
  const saveStatus = useAppStore(s => s.saveStatus)
  const lastSavedAt = useAppStore(s => s.lastSavedAt)
  const hasUnsavedChanges = useAppStore(s => s.hasUnsavedChanges)
  const setCurrentPage = useAppStore(s => s.setCurrentPage)
  const saveCurrentFile = useAppStore(s => s.saveCurrentFile)

  const statusLabel = (() => {
    switch (saveStatus) {
      case 'saved':   return lastSavedAt ? `Saved ${lastSavedAt.toLocaleTimeString()}` : 'Saved'
      case 'unsaved': return 'Unsaved changes'
      case 'saving':  return 'Saving…'
      case 'failed':  return 'Save failed'
    }
  })()

  const fileName = currentFile?.fileMetadata.name ?? 'Untitled'
  const filePath = currentFilePath
    ? currentFilePath.split(/[/\\]/).pop()
    : ''

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
        {children}
      </main>
    </div>
  )
}
