// ============================================================
// CashFlow Planner — Reports Page
// Generate period reports; export as CSV or JSON.
// ============================================================

import React, { useState, useMemo } from 'react'
import { useAppStore } from '../../store/appStore'
import type { ReportDefinition, ReportOutput } from '../../shared/types'
import { generateReport, exportReportAsCSV } from '../../shared/engine/calculator'
import { format, parseISO } from 'date-fns'

export default function Reports() {
  const currentFile = useAppStore(s => s.currentFile)
  const addReport = useAppStore(s => s.addReport)
  const deleteReport = useAppStore(s => s.deleteReport)

  const reports = currentFile?.reports ?? []

  // ── New report form ───────────────────────────────────────
  const [showForm, setShowForm] = useState(false)
  const [reportName, setReportName] = useState('')
  const [reportType, setReportType] = useState<ReportDefinition['type']>('monthly')
  const [startPeriod, setStartPeriod] = useState('')
  const [endPeriod, setEndPeriod] = useState('')
  const [numberOfPeriods, setNumberOfPeriods] = useState('')
  const [useEndPeriod, setUseEndPeriod] = useState(true)
  const [formErrors, setFormErrors] = useState<string[]>([])

  // ── Generated output ──────────────────────────────────────
  const [selectedReport, setSelectedReport] = useState<ReportDefinition | null>(null)
  const [generatedOutput, setGeneratedOutput] = useState<ReportOutput | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportSuccess, setExportSuccess] = useState<string | null>(null)

  function validateForm(): string[] {
    const errs: string[] = []
    if (!reportName.trim()) errs.push('Report name is required.')
    if (!startPeriod) errs.push('Start period is required.')
    if (useEndPeriod && !endPeriod) errs.push('End period is required when using date range.')
    if (!useEndPeriod && (!numberOfPeriods || parseInt(numberOfPeriods) < 1))
      errs.push('Number of periods must be at least 1.')
    return errs
  }

  function handleAddReport() {
    const errs = validateForm()
    if (errs.length > 0) { setFormErrors(errs); return }
    setFormErrors([])
    addReport({
      name: reportName.trim(),
      type: reportType,
      startPeriod,
      endPeriod: useEndPeriod ? endPeriod : undefined,
      numberOfPeriods: !useEndPeriod ? parseInt(numberOfPeriods) : undefined
    })
    setShowForm(false)
    setReportName('')
    setStartPeriod('')
    setEndPeriod('')
    setNumberOfPeriods('')
  }

  function handleGenerate(report: ReportDefinition) {
    if (!currentFile) return
    try {
      const output = generateReport(currentFile, report)
      setGeneratedOutput(output)
      setSelectedReport(report)
      setExportError(null)
      setExportSuccess(null)
    } catch (e: any) {
      setExportError(e.message ?? 'Failed to generate report.')
    }
  }

  async function handleExportCSV() {
    if (!generatedOutput) return
    const csv = exportReportAsCSV(generatedOutput)
    const result = await window.fileAPI.exportCSV(`${generatedOutput.definition.name}.csv`, csv)
    if (result.success) {
      setExportSuccess('CSV exported successfully.')
    } else {
      setExportError(result.error ?? 'Export failed.')
    }
  }

  async function handleExportJSON() {
    if (!generatedOutput) return
    const json = JSON.stringify(generatedOutput, null, 2)
    const result = await window.fileAPI.exportJSON(`${generatedOutput.definition.name}.json`, json)
    if (result.success) {
      setExportSuccess('JSON exported successfully.')
    } else {
      setExportError(result.error ?? 'Export failed.')
    }
  }

  const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  const fmtSign = (n: number) => (n >= 0 ? '+' : '') + fmt(n)
  const periodLabel = (type: ReportDefinition['type']) => {
    const m = { monthly: 'Monthly', quarterly: 'Quarterly', halfYearly: 'Half-Year', yearly: 'Yearly' }
    return m[type] ?? type
  }

  return (
    <div style={{ padding: '1.5rem', height: '100%', overflow: 'auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Reports</h1>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
            {reports.length} saved report{reports.length !== 1 ? 's' : ''}
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ New Report</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: generatedOutput ? '320px 1fr' : '1fr', gap: '1.5rem' }}>

        {/* Left: Report list */}
        <div>
          {/* New report form */}
          {showForm && (
            <div className="card" style={{ padding: '1rem', marginBottom: '1rem', border: '1px solid var(--surplus)' }}>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>New Report</div>

              {formErrors.length > 0 && (
                <div style={{ background: 'rgba(248,113,113,0.1)', borderRadius: 6, padding: '0.5rem', marginBottom: '0.5rem' }}>
                  {formErrors.map((e, i) => <div key={i} style={{ fontSize: '0.8rem', color: 'var(--expense)' }}>• {e}</div>)}
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Report Name *</label>
                <input className="form-input" value={reportName} onChange={e => setReportName(e.target.value)} placeholder="e.g. 2025 Annual Review" />
              </div>

              <div className="form-group">
                <label className="form-label">Report Type</label>
                <select className="form-input" value={reportType} onChange={e => setReportType(e.target.value as any)}>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="halfYearly">Half-Year</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Start Date *</label>
                <input type="date" className="form-input" value={startPeriod} onChange={e => setStartPeriod(e.target.value)} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                  <input type="radio" checked={useEndPeriod} onChange={() => setUseEndPeriod(true)} />
                  End date
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                  <input type="radio" checked={!useEndPeriod} onChange={() => setUseEndPeriod(false)} />
                  # of periods
                </label>
              </div>

              {useEndPeriod ? (
                <div className="form-group">
                  <label className="form-label">End Date *</label>
                  <input type="date" className="form-input" value={endPeriod} onChange={e => setEndPeriod(e.target.value)} />
                </div>
              ) : (
                <div className="form-group">
                  <label className="form-label">Number of Periods *</label>
                  <input type="number" className="form-input" value={numberOfPeriods} onChange={e => setNumberOfPeriods(e.target.value)} min="1" />
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => { setShowForm(false); setFormErrors([]) }}>Cancel</button>
                <button className="btn btn-primary" onClick={handleAddReport}>Create</button>
              </div>
            </div>
          )}

          {/* Report list */}
          {reports.length === 0 && !showForm ? (
            <div className="empty-state">
              <div className="empty-state-icon">📊</div>
              <div className="empty-state-title">No reports yet</div>
              <div className="empty-state-desc">Create a report to summarize cash flow over any date range.</div>
              <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => setShowForm(true)}>+ New Report</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {reports.map(r => (
                <div
                  key={r.id}
                  className="card"
                  style={{
                    padding: '0.9rem 1rem', cursor: 'pointer',
                    border: selectedReport?.id === r.id ? '1px solid var(--surplus)' : '1px solid transparent'
                  }}
                  onClick={() => handleGenerate(r)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.name}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        {periodLabel(r.type)} · from {r.startPeriod}
                        {r.endPeriod ? ` to ${r.endPeriod}` : r.numberOfPeriods ? ` · ${r.numberOfPeriods} periods` : ''}
                      </div>
                    </div>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: '0.72rem', padding: '0.25rem 0.5rem', color: 'var(--expense)' }}
                      onClick={e => { e.stopPropagation(); deleteReport(r.id); if (selectedReport?.id === r.id) { setSelectedReport(null); setGeneratedOutput(null) } }}
                    >
                      ✕
                    </button>
                  </div>
                  {selectedReport?.id === r.id && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--surplus)', marginTop: 4 }}>
                      ▶ Click to regenerate · Use export buttons to save
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Report output */}
        {generatedOutput && (
          <div>
            {/* Export bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                {generatedOutput.definition.name}
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: 8 }}>
                  {generatedOutput.periods.length} period{generatedOutput.periods.length !== 1 ? 's' : ''} · generated {format(parseISO(generatedOutput.generatedAt), 'MMM d, h:mm a')}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-secondary" style={{ fontSize: '0.8rem' }} onClick={handleExportCSV}>Export CSV</button>
                <button className="btn btn-secondary" style={{ fontSize: '0.8rem' }} onClick={handleExportJSON}>Export JSON</button>
              </div>
            </div>

            {exportError && <div style={{ color: 'var(--expense)', fontSize: '0.82rem', marginBottom: '0.5rem' }}>⚠ {exportError}</div>}
            {exportSuccess && <div style={{ color: 'var(--income)', fontSize: '0.82rem', marginBottom: '0.5rem' }}>✓ {exportSuccess}</div>}

            {/* Summary boxes */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
              {[
                { label: 'Total In', value: generatedOutput.totalCashFlowIn, color: 'var(--income)' },
                { label: 'Total Out', value: generatedOutput.totalCashFlowOut, color: 'var(--expense)' },
                { label: 'Net Surplus', value: generatedOutput.totalSurplusDeficit, color: generatedOutput.totalSurplusDeficit >= 0 ? 'var(--surplus)' : 'var(--deficit)' },
                { label: 'Beginning Balance', value: generatedOutput.beginningLiquidBalance, color: 'var(--text-primary)' },
                { label: 'Ending Balance', value: generatedOutput.endingLiquidBalance, color: generatedOutput.endingLiquidBalance >= 0 ? 'var(--income)' : 'var(--expense)' },
                { label: 'Cumulative', value: generatedOutput.finalCumulativeSurplusDeficit, color: generatedOutput.finalCumulativeSurplusDeficit >= 0 ? 'var(--surplus)' : 'var(--deficit)' }
              ].map(({ label, value, color }) => (
                <div key={label} className="card" style={{ padding: '0.75rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color }}>{fmt(value)}</div>
                </div>
              ))}
            </div>

            {/* Period table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', minWidth: 600 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-base)' }}>
                    {['Period', 'Cash In', 'Cash Out', 'Net', 'Cumulative', 'End Balance'].map(h => (
                      <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: h === 'Period' ? 'left' : 'right', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {generatedOutput.periods.map(p => (
                    <tr key={p.periodKey} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.55rem 0.75rem', color: 'var(--text-primary)', fontWeight: 500 }}>{p.periodLabel}</td>
                      <td style={{ padding: '0.55rem 0.75rem', textAlign: 'right', color: 'var(--income)' }}>{fmt(p.cashFlowIn)}</td>
                      <td style={{ padding: '0.55rem 0.75rem', textAlign: 'right', color: 'var(--expense)' }}>{p.cashFlowOut > 0 ? `-${fmt(p.cashFlowOut)}` : fmt(0)}</td>
                      <td style={{ padding: '0.55rem 0.75rem', textAlign: 'right', color: p.netSurplusDeficit >= 0 ? 'var(--surplus)' : 'var(--deficit)', fontWeight: 600 }}>
                        {fmtSign(p.netSurplusDeficit)}
                      </td>
                      <td style={{ padding: '0.55rem 0.75rem', textAlign: 'right', color: p.cumulativeSurplusDeficit >= 0 ? 'var(--cumulative-pos)' : 'var(--deficit)' }}>
                        {fmtSign(p.cumulativeSurplusDeficit)}
                      </td>
                      <td style={{ padding: '0.55rem 0.75rem', textAlign: 'right', color: p.endingLiquidBalance >= 0 ? 'var(--text-primary)' : 'var(--expense)' }}>
                        {fmt(p.endingLiquidBalance)}
                      </td>
                    </tr>
                  ))}
                  {/* Totals row */}
                  <tr style={{ background: 'var(--bg-card)', fontWeight: 700 }}>
                    <td style={{ padding: '0.65rem 0.75rem', color: 'var(--text-secondary)' }}>TOTAL</td>
                    <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', color: 'var(--income)' }}>{fmt(generatedOutput.totalCashFlowIn)}</td>
                    <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', color: 'var(--expense)' }}>-{fmt(generatedOutput.totalCashFlowOut)}</td>
                    <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', color: generatedOutput.totalSurplusDeficit >= 0 ? 'var(--surplus)' : 'var(--deficit)' }}>
                      {fmtSign(generatedOutput.totalSurplusDeficit)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Line item totals */}
            {generatedOutput.lineItemTotals.length > 0 && (
              <div style={{ marginTop: '1.5rem' }}>
                <div style={{ fontWeight: 700, color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
                  Line Item Totals
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-base)' }}>
                      {['Name', 'Type', 'Category', 'Total'].map(h => (
                        <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: h === 'Total' ? 'right' : 'left', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {generatedOutput.lineItemTotals.sort((a, b) => {
                      if (a.type !== b.type) return a.type === 'income' ? -1 : 1
                      return b.total - a.total
                    }).map(li => (
                      <tr key={li.lineItemId} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-primary)' }}>{li.name}</td>
                        <td style={{ padding: '0.5rem 0.75rem' }}>
                          <span style={{
                            fontSize: '0.7rem', padding: '1px 5px', borderRadius: 3, fontWeight: 600,
                            background: li.type === 'income' ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)',
                            color: li.type === 'income' ? 'var(--income)' : 'var(--expense)'
                          }}>{li.type}</span>
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)', fontSize: '0.78rem' }}>{li.category}</td>
                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 600, color: li.type === 'income' ? 'var(--income)' : 'var(--expense)' }}>
                          {fmt(li.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
