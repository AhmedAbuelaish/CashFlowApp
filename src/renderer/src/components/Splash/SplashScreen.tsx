import React, { useEffect, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import type { RecentFile } from '../../shared/types'

export default function SplashScreen() {
  const newFile = useAppStore(s => s.newFile)
  const openFileFromPath = useAppStore(s => s.openFileFromPath)
  const recentFiles = useAppStore(s => s.recentFiles)
  const setRecentFiles = useAppStore(s => s.setRecentFiles)

  const [showNewForm, setShowNewForm] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // New file form state
  const [newName, setNewName] = useState('My Cash Flow Plan')
  const [newBalance, setNewBalance] = useState('0')
  const [newCurrency, setNewCurrency] = useState('USD')

  useEffect(() => {
    if (window.fileAPI) {
      window.fileAPI.getRecentFiles().then(files => setRecentFiles(files))
    }
  }, [setRecentFiles])

  const lastFile: RecentFile | undefined = recentFiles[0]

  const handleNew = async () => {
    if (!window.fileAPI) {
      // Dev/test fallback: no Electron, just create in memory with a fake path
      await newFile(newName, '/tmp/test.cashflow.json', parseFloat(newBalance) || 0, newCurrency)
      return
    }

    const safeName = newName.trim() || 'CashFlow Plan'
    const dialog = await window.fileAPI.showSaveDialog(`${safeName}.cashflow.json`)
    if (dialog.canceled || !dialog.filePath) return

    setLoading(true)
    setError('')
    try {
      await newFile(safeName, dialog.filePath, parseFloat(newBalance) || 0, newCurrency)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const handleContinue = async () => {
    if (!lastFile) return
    setLoading(true)
    setError('')
    const result = await openFileFromPath(lastFile.path)
    setLoading(false)
    if (!result.success) setError(result.error ?? 'Failed to open file')
  }

  const handleOpen = async () => {
    if (!window.fileAPI) return
    setLoading(true)
    setError('')
    const result = await openFileFromPath(undefined as unknown as string)
    setLoading(false)
    if (!result.success && result.error !== 'Canceled') {
      setError(result.error ?? 'Failed to open file')
    }
  }

  const handleOpenRecent = async (path: string) => {
    setLoading(true)
    setError('')
    const result = await openFileFromPath(path)
    setLoading(false)
    if (!result.success) setError(result.error ?? 'Failed to open file')
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        {/* Logo */}
        <div style={styles.logoSection}>
          <div style={styles.logoIcon}>📊</div>
          <h1 style={styles.appName}>CashFlow Planner</h1>
          <p style={styles.tagline}>Local-first cash flow planning for households & scenarios</p>
        </div>

        {/* Error */}
        {error && (
          <div style={styles.errorBox}>{error}</div>
        )}

        {/* New file form */}
        {showNewForm ? (
          <div style={styles.newForm}>
            <h3 style={styles.formTitle}>Create New Plan</h3>
            <div className="form-group">
              <label className="form-label">Plan Name</label>
              <input
                className="form-input"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="My Cash Flow Plan"
                autoFocus
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Starting Liquid Balance</label>
                <input
                  className="form-input"
                  type="number"
                  value={newBalance}
                  onChange={e => setNewBalance(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Currency</label>
                <select
                  className="form-select"
                  value={newCurrency}
                  onChange={e => setNewCurrency(e.target.value)}
                >
                  <option value="USD">USD — US Dollar</option>
                  <option value="EUR">EUR — Euro</option>
                  <option value="GBP">GBP — British Pound</option>
                  <option value="CAD">CAD — Canadian Dollar</option>
                  <option value="AUD">AUD — Australian Dollar</option>
                  <option value="JPY">JPY — Japanese Yen</option>
                  <option value="CHF">CHF — Swiss Franc</option>
                </select>
              </div>
            </div>
            <div style={styles.formButtons}>
              <button
                className="btn btn-secondary"
                onClick={() => setShowNewForm(false)}
                disabled={loading}
              >
                Back
              </button>
              <button
                className="btn btn-primary"
                onClick={handleNew}
                disabled={loading || !newName.trim()}
              >
                {loading ? 'Creating…' : 'Choose Location & Create'}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Action buttons */}
            <div style={styles.actions}>
              <button
                style={styles.actionBtn}
                onClick={() => setShowNewForm(true)}
                disabled={loading}
              >
                <span style={styles.actionIcon}>✦</span>
                <span style={styles.actionLabel}>New</span>
                <span style={styles.actionDesc}>Create a new cash flow plan file</span>
              </button>

              <button
                style={{
                  ...styles.actionBtn,
                  ...(lastFile ? {} : styles.actionBtnDisabled)
                }}
                onClick={handleContinue}
                disabled={!lastFile || loading}
              >
                <span style={styles.actionIcon}>▶</span>
                <span style={styles.actionLabel}>Continue</span>
                <span style={styles.actionDesc}>
                  {lastFile
                    ? lastFile.name
                    : 'No recent file'}
                </span>
              </button>

              <button
                style={styles.actionBtn}
                onClick={handleOpen}
                disabled={loading}
              >
                <span style={styles.actionIcon}>📂</span>
                <span style={styles.actionLabel}>Open</span>
                <span style={styles.actionDesc}>Browse for an existing plan file</span>
              </button>
            </div>

            {/* Recent files */}
            {recentFiles.length > 1 && (
              <div style={styles.recentSection}>
                <p style={styles.recentTitle}>Recent Files</p>
                {recentFiles.slice(0, 5).map(f => (
                  <button
                    key={f.path}
                    style={styles.recentItem}
                    onClick={() => handleOpenRecent(f.path)}
                    disabled={loading}
                  >
                    <span style={styles.recentName}>{f.name}</span>
                    <span style={styles.recentPath}>{f.path}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {loading && <div style={styles.loadingMsg}>Loading…</div>}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'var(--bg-base)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px'
  },
  card: {
    background: 'var(--bg-panel)',
    border: '1px solid var(--border-light)',
    borderRadius: '16px',
    padding: '48px',
    width: '480px',
    maxWidth: '100%',
    boxShadow: 'var(--shadow-lg)'
  },
  logoSection: {
    textAlign: 'center',
    marginBottom: '40px'
  },
  logoIcon: {
    fontSize: '48px',
    marginBottom: '12px'
  },
  appName: {
    fontSize: '28px',
    fontWeight: '800',
    color: 'var(--text-primary)',
    letterSpacing: '-0.5px',
    marginBottom: '8px'
  },
  tagline: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    lineHeight: '1.5'
  },
  errorBox: {
    background: 'var(--expense-dim)',
    border: '1px solid var(--expense)',
    borderRadius: '8px',
    padding: '12px 16px',
    color: 'var(--expense)',
    fontSize: '13px',
    marginBottom: '20px',
    whiteSpace: 'pre-wrap'
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  actionBtn: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '10px',
    padding: '16px 20px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    textAlign: 'left',
    transition: 'all 0.15s',
    color: 'var(--text-primary)',
    width: '100%'
  },
  actionBtnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed'
  },
  actionIcon: {
    fontSize: '20px',
    flexShrink: 0,
    width: '28px',
    textAlign: 'center'
  },
  actionLabel: {
    fontSize: '15px',
    fontWeight: '600',
    flex: 1,
    display: 'block',
    lineHeight: 1
  },
  actionDesc: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    flex: 2,
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'right'
  },
  recentSection: {
    marginTop: '28px',
    paddingTop: '20px',
    borderTop: '1px solid var(--border)'
  },
  recentTitle: {
    fontSize: '11px',
    fontWeight: '600',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '.5px',
    marginBottom: '8px'
  },
  recentItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    width: '100%',
    background: 'none',
    border: 'none',
    padding: '6px 0',
    cursor: 'pointer',
    borderBottom: '1px solid var(--border)',
    gap: '12px'
  },
  recentName: {
    fontSize: '13px',
    color: 'var(--text-primary)',
    fontWeight: '500',
    flexShrink: 0
  },
  recentPath: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    direction: 'rtl',
    textAlign: 'right'
  },
  newForm: {
    animation: 'fadeIn 0.15s ease'
  },
  formTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: 'var(--text-primary)',
    marginBottom: '24px'
  },
  formButtons: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    marginTop: '8px'
  },
  loadingMsg: {
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: '13px',
    marginTop: '20px'
  }
}
