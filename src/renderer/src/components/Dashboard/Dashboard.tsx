import React, { useState } from 'react'
import { useAppStore } from '../../store/appStore'
import CashFlowChart from './CashFlowChart'
import CashFlowTable from './CashFlowTable'
import PastProjectedReview from './PastProjectedReview'
import LineItemForm from '../LineItems/LineItemForm'
import type { ViewScale, CumulativeChartMode } from '../../shared/types'

type PanelState = 'both' | 'chartOnly' | 'tableOnly'

export default function Dashboard() {
  const viewScale = useAppStore(s => s.viewScale)
  const cumulativeChartMode = useAppStore(s => s.cumulativeChartMode)
  const calculationResult = useAppStore(s => s.calculationResult)
  const setViewScale = useAppStore(s => s.setViewScale)
  const setCumulativeChartMode = useAppStore(s => s.setCumulativeChartMode)
  const currentFile = useAppStore(s => s.currentFile)

  const [panelState, setPanelState] = useState<PanelState>('both')
  const [showPastProjected, setShowPastProjected] = useState(false)
  const [showAddIncome, setShowAddIncome] = useState(false)
  const [showAddExpense, setShowAddExpense] = useState(false)

  const pastProjectedCount = calculationResult?.pastProjectedIncomeReview.length ?? 0
  const warnings = calculationResult?.warnings ?? []

  const SCALES: ViewScale[] = ['day', 'week', 'month', 'quarter', 'halfYear', 'year']
  const SCALE_LABELS: Record<ViewScale, string> = {
    day: 'Day', week: 'Week', month: 'Month', quarter: 'Quarter', halfYear: 'Half-Year', year: 'Year'
  }

  const CHART_MODES: CumulativeChartMode[] = ['sameChart', 'separateChart', 'hidden']
  const CHART_LABELS: Record<CumulativeChartMode, string> = {
    sameChart: 'Combined', separateChart: 'Separate', hidden: 'Hidden'
  }

  const currency = currentFile?.fileMetadata.currency ?? 'USD'

  const chartVisible = panelState === 'both' || panelState === 'chartOnly'
  const tableVisible = panelState === 'both' || panelState === 'tableOnly'

  return (
    <div style={styles.container}>
      {/* Toolbar */}
      <div style={styles.toolbar}>
        <div style={styles.toolbarLeft}>
          {/* Scale */}
          <div className="tabs">
            {SCALES.map(s => (
              <button
                key={s}
                className={`tab-item ${viewScale === s ? 'active' : ''}`}
                onClick={() => setViewScale(s)}
              >
                {SCALE_LABELS[s]}
              </button>
            ))}
          </div>

          {/* Cumulative mode */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Cumulative:</span>
            <div className="tabs">
              {CHART_MODES.map(m => (
                <button
                  key={m}
                  className={`tab-item ${cumulativeChartMode === m ? 'active' : ''}`}
                  onClick={() => setCumulativeChartMode(m)}
                >
                  {CHART_LABELS[m]}
                </button>
              ))}
            </div>
          </div>

          {/* Panel toggle */}
          <div className="tabs">
            <button
              className={`tab-item ${panelState === 'both' ? 'active' : ''}`}
              onClick={() => setPanelState('both')}
            >⊞ Both</button>
            <button
              className={`tab-item ${panelState === 'chartOnly' ? 'active' : ''}`}
              onClick={() => setPanelState('chartOnly')}
            >▤ Chart</button>
            <button
              className={`tab-item ${panelState === 'tableOnly' ? 'active' : ''}`}
              onClick={() => setPanelState('tableOnly')}
            >≡ Table</button>
          </div>
        </div>

        <div style={styles.toolbarRight}>
          {pastProjectedCount > 0 && (
            <button
              className="btn btn-sm"
              style={{ background: 'var(--deficit-dim)', color: 'var(--deficit)', borderColor: 'var(--deficit)' }}
              onClick={() => setShowPastProjected(true)}
            >
              ⚠ {pastProjectedCount} Past Projected
            </button>
          )}
          <button className="btn btn-income btn-sm" onClick={() => setShowAddIncome(true)}>
            + Income
          </button>
          <button
            className="btn btn-sm"
            style={{ background: 'var(--expense-dim)', color: 'var(--expense)', borderColor: 'var(--expense)' }}
            onClick={() => setShowAddExpense(true)}
          >
            + Expense
          </button>
        </div>
      </div>

      {/* Warnings strip */}
      {warnings.length > 0 && (
        <div style={styles.warningsStrip}>
          {warnings.map((w, i) => (
            <div
              key={i}
              style={{
                ...styles.warningItem,
                borderLeftColor: w.type === 'largeFutureObligation'
                  ? 'var(--warning)'
                  : 'var(--deficit)'
              }}
            >
              <span style={styles.warningIcon}>
                {w.type === 'negativeCumulative' ? '⚠' : w.type === 'negativeBalance' ? '⛔' : '◈'}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {w.description}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Content panels */}
      <div style={styles.content}>
        {chartVisible && (
          <div style={{
            ...styles.panel,
            flex: panelState === 'chartOnly' ? '1' : '0 0 320px'
          }}>
            <div className="panel-header">
              <span className="panel-title">Cash Flow Chart</span>
            </div>
            <div style={{ flex: 1, overflow: 'hidden', padding: '8px' }}>
              {calculationResult && calculationResult.periods.length > 0 ? (
                <CashFlowChart
                  result={calculationResult}
                  cumulativeMode={cumulativeChartMode}
                  currency={currency}
                />
              ) : (
                <div className="empty-state" style={{ height: '100%' }}>
                  <div className="empty-state-icon">📊</div>
                  <div className="empty-state-title">No data yet</div>
                  <div className="empty-state-desc">
                    Add income and expense line items to see your cash flow chart.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {tableVisible && (
          <div style={{
            ...styles.panel,
            flex: panelState === 'tableOnly' ? '1' : panelState === 'both' ? '1' : '0'
          }}>
            <div className="panel-header">
              <span className="panel-title">Cash Flow Table</span>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              {calculationResult && calculationResult.periods.length > 0 ? (
                <CashFlowTable result={calculationResult} currency={currency} />
              ) : (
                <div className="empty-state" style={{ height: '200px' }}>
                  <div className="empty-state-title">No periods to display</div>
                  <div className="empty-state-desc">
                    Add income or expenses, then adjust the date range.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showPastProjected && (
        <PastProjectedReview onClose={() => setShowPastProjected(false)} currency={currency} />
      )}
      {showAddIncome && (
        <LineItemForm
          defaultType="income"
          onClose={() => setShowAddIncome(false)}
        />
      )}
      {showAddExpense && (
        <LineItemForm
          defaultType="expense"
          onClose={() => setShowAddExpense(false)}
        />
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
    background: 'var(--bg-base)'
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-panel)',
    gap: '12px',
    flexShrink: 0,
    flexWrap: 'wrap'
  },
  toolbarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap'
  },
  toolbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  warningsStrip: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '8px 16px',
    background: 'rgba(251,146,60,.05)',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0
  },
  warningItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    borderLeft: '3px solid var(--deficit)',
    paddingLeft: '8px'
  },
  warningIcon: {
    fontSize: '14px',
    flexShrink: 0
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    overflow: 'hidden',
    gap: '1px',
    background: 'var(--border)'
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-panel)',
    overflow: 'hidden',
    minHeight: '120px'
  }
}
