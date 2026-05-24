// ============================================================
// CashFlow Planner — Settings Page
// ============================================================

import React from 'react'
import { useAppStore } from '../../store/appStore'
import type { ViewScale, CumulativeChartMode } from '../../shared/types'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY', 'INR', 'MXN', 'BRL', 'SGD', 'HKD', 'NZD', 'NOK', 'SEK', 'DKK']

export default function Settings() {
  const currentFile = useAppStore(s => s.currentFile)
  const updateSettings = useAppStore(s => s.updateSettings)

  const settings = currentFile?.settings

  if (!settings) {
    return (
      <div style={{ padding: '2rem' }}>
        <div className="empty-state">
          <div className="empty-state-icon">⚙️</div>
          <div className="empty-state-title">No file open</div>
          <div className="empty-state-desc">Open or create a cash-flow file to access settings.</div>
        </div>
      </div>
    )
  }

  function row(label: string, desc: string, control: React.ReactNode) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 0', borderBottom: '1px solid var(--border)' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{label}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 2 }}>{desc}</div>
        </div>
        <div style={{ marginLeft: '2rem', flexShrink: 0 }}>{control}</div>
      </div>
    )
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: 640, height: '100%', overflow: 'auto' }}>
      <h1 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1.5rem' }}>Settings</h1>

      {/* Save & File */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ fontWeight: 700, color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
          Save & File
        </div>
        {row(
          'Autosave',
          'Automatically save the file after every change. Turn off to require manual saves.',
          <label className="toggle" onClick={() => updateSettings({ autosave: !settings.autosave })}>
            <input type="checkbox" checked={settings.autosave} onChange={() => {}} />
            <div className="toggle-track">
              <div className="toggle-thumb" />
            </div>
          </label>
        )}
      </div>

      {/* Display */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ fontWeight: 700, color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
          Display Defaults
        </div>
        {row(
          'Default View Scale',
          'The time scale shown on the dashboard when opening a file.',
          <select
            className="form-input"
            style={{ width: 160 }}
            value={settings.defaultViewScale}
            onChange={e => updateSettings({ defaultViewScale: e.target.value as ViewScale })}
          >
            <option value="month">Month</option>
            <option value="quarter">Quarter</option>
            <option value="halfYear">Half-Year</option>
            <option value="year">Year</option>
          </select>
        )}
        {row(
          'Cumulative Chart Mode',
          'How the cumulative surplus/deficit is displayed on the dashboard chart.',
          <select
            className="form-input"
            style={{ width: 180 }}
            value={settings.defaultCumulativeChartMode}
            onChange={e => updateSettings({ defaultCumulativeChartMode: e.target.value as CumulativeChartMode })}
          >
            <option value="sameChart">Same Chart</option>
            <option value="separateChart">Separate Chart</option>
            <option value="hidden">Hidden</option>
          </select>
        )}
      </div>

      {/* Currency */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ fontWeight: 700, color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
          Currency
        </div>
        {row(
          'Default Currency',
          'Currency code used for display and new accounts.',
          <select
            className="form-input"
            style={{ width: 120 }}
            value={settings.currency}
            onChange={e => updateSettings({ currency: e.target.value })}
          >
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      {/* Info */}
      <div className="card" style={{ padding: '1rem', background: 'var(--bg-card)' }}>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>About CashFlow Planner</div>
          <div>Version 1.0.0 · Local-first · All data stored in your JSON file.</div>
          <div style={{ marginTop: 4 }}>No cloud sync · No telemetry · Open your file from anywhere.</div>
          <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
            <strong>Calculation principle:</strong> All income and expenses are calculated on their actual occurrence dates.
            Annual, quarterly, or irregular payments are never automatically spread into monthly equivalents.
            The cumulative surplus/deficit shows whether you have enough built up before a large future obligation.
          </div>
        </div>
      </div>
    </div>
  )
}
