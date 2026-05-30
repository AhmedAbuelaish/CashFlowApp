import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { format } from 'date-fns'
import { useAppStore } from '../../store/appStore'
import CashFlowChart from './CashFlowChart'
import CashFlowTable from './CashFlowTable'
import AccountsTable from './AccountsTable'
import PastProjectedReview from './PastProjectedReview'
import LineItemForm from '../LineItems/LineItemForm'
import RightRail from './RightRail'
import type { ViewScale, CumulativeChartMode } from '../../shared/types'

const COL_WIDTH   = 110
const LABEL_WIDTH = 200

type PanelState = 'both' | 'chartOnly' | 'tableOnly'

function StatCard({ label, value, color, prefix }: { label: string; value: number; color: string; prefix?: string }) {
  const abs = Math.abs(value)
  const fmt = abs >= 1_000_000 ? `${(abs / 1_000_000).toFixed(2)}M`
            : abs >= 1_000     ? `${(abs / 1_000).toFixed(1)}k`
            : abs.toFixed(0)
  return (
    <div style={{ flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px', minWidth: 0 }}>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'var(--font-mono)', color, lineHeight: 1.2 }}>
        {prefix && <span style={{ fontSize: '13px', marginRight: '1px', opacity: 0.8 }}>{prefix}</span>}
        <span style={{ fontSize: '12px', opacity: 0.6 }}>$</span>{fmt}
      </div>
    </div>
  )
}

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

  const scrollRef = useRef<HTMLDivElement>(null)
  const todayISO = useMemo(() => format(new Date(), 'yyyy-MM-dd'), [])

  const [visibleRange, setVisibleRange] = useState<{ startDate: string; endDate: string } | null>(null)

  const computeVisible = useCallback(() => {
    const el = scrollRef.current
    if (!el || !periods.length) return
    const sl    = el.scrollLeft
    const dataW = Math.max(COL_WIDTH, el.clientWidth - LABEL_WIDTH)
    const first = Math.max(0, Math.min(periods.length - 1, Math.floor(sl / COL_WIDTH)))
    const last  = Math.max(first, Math.min(periods.length - 1, Math.floor((sl + dataW - 1) / COL_WIDTH)))
    const startDate = periods[first].periodStart
    const endDate   = periods[last].periodEnd
    setVisibleRange(prev =>
      prev?.startDate === startDate && prev?.endDate === endDate
        ? prev
        : { startDate, endDate }
    )
  }, [periods])

  // Stat card values
  const todayPeriod  = useMemo(() => calculationResult?.periods.find(p => p.periodStart <= todayISO && todayISO <= p.periodEnd), [calculationResult?.periods, todayISO])
  const lastPeriod   = calculationResult?.periods[calculationResult.periods.length - 1]
  const nowMonth     = new Date().getMonth()
  const nowYear      = new Date().getFullYear()
  const monthInISO   = `${nowYear}-${String(nowMonth + 1).padStart(2, '0')}`
  const monthIncome  = useMemo(() => (calculationResult?.periods ?? []).filter(p => p.periodStart.startsWith(monthInISO)).reduce((s, p) => s + p.cashFlowIn, 0), [calculationResult?.periods, monthInISO])
  const monthExpense = useMemo(() => (calculationResult?.periods ?? []).filter(p => p.periodStart.startsWith(monthInISO)).reduce((s, p) => s + p.cashFlowOut, 0), [calculationResult?.periods, monthInISO])

  const periods = calculationResult?.periods ?? []
  const totalWidth = Math.max(600, LABEL_WIDTH + periods.length * COL_WIDTH)

  const todayPeriodKey = useMemo(() => {
    return calculationResult?.periods.find(
      p => p.periodStart <= todayISO && todayISO <= p.periodEnd
    )?.periodKey ?? null
  }, [calculationResult?.periods, todayISO])

  // Auto-scroll to show the previous period as the first visible column
  useEffect(() => {
    if (!scrollRef.current || !calculationResult?.periods.length) return
    const ps = calculationResult.periods
    const todayIdx = ps.findIndex(p => p.periodStart <= todayISO && todayISO <= p.periodEnd)
    if (todayIdx < 0) return
    const prevIdx = Math.max(0, todayIdx - 1)
    scrollRef.current.scrollLeft = prevIdx * COL_WIDTH
    requestAnimationFrame(computeVisible)
  }, [periods.length, periods[0]?.periodKey]) // re-scroll when period set changes

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
      {/* Page header */}
      <div style={styles.pageHeader}>
        <div>
          <h1 style={styles.pageTitle}>Dashboard</h1>
          <div style={styles.pageSub}>
            Cash flow projection
            {periods.length > 0 && ` · ${periods.length} ${viewScale} periods`}
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
          <button className="btn btn-income btn-sm" onClick={() => setShowAddIncome(true)}>+ Income</button>
          <button
            className="btn btn-sm"
            style={{ background: 'var(--expense-dim)', color: 'var(--expense)', borderColor: 'var(--expense)' }}
            onClick={() => setShowAddExpense(true)}
          >+ Expense</button>
        </div>
      </div>

      {/* Stat cards */}
      {calculationResult && (
        <div style={styles.statRow}>
          <StatCard label="Current balance" value={todayPeriod?.endingLiquidBalance ?? calculationResult.initialLiquidBalance} color="var(--surplus)" />
          <StatCard label="End-of-range balance" value={lastPeriod?.endingLiquidBalance ?? 0} color={lastPeriod && lastPeriod.endingLiquidBalance < 0 ? 'var(--deficit)' : 'var(--surplus)'} />
          <StatCard label={`Income (${new Date().toLocaleDateString('en', { month: 'short' })})`} value={monthIncome} color="var(--income)" prefix="+" />
          <StatCard label={`Expenses (${new Date().toLocaleDateString('en', { month: 'short' })})`} value={monthExpense} color="var(--expense)" prefix="−" />
        </div>
      )}

      {/* Toolbar — outside the two-column split so it spans full width */}
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

      {/* Two-column: scrolling chart+tables on left, sticky right rail */}
      <div className="dash-layout-v2">
        <div className="dash-main-v2">
          {/* Shared horizontal scroll container — chart and all tables scroll together */}
          <div ref={scrollRef} style={styles.scrollContainer} onScroll={computeVisible}>
            <div style={{ width: totalWidth, minWidth: '100%', display: 'flex', flexDirection: 'column', background: 'var(--border)', gap: '1px' }}>

              {/* Chart panel */}
              {chartVisible && (
                <div style={{
                  ...styles.panel,
                  height: cumulativeChartMode === 'separateChart' ? 460 : 300,
                  flexShrink: 0
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
                        accounts={currentFile?.accounts ?? []}
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

              {/* Table panel */}
              {tableVisible && (
                <div style={{ ...styles.panel, flex: 'none' }}>
                  <div className="panel-header">
                    <span className="panel-title">Cash Flow Table</span>
                  </div>
                  {calculationResult && calculationResult.periods.length > 0 ? (
                    <CashFlowTable
                      result={calculationResult}
                      currency={currency}
                      todayPeriodKey={todayPeriodKey}
                    />
                  ) : (
                    <div className="empty-state" style={{ height: '200px' }}>
                      <div className="empty-state-title">No periods to display</div>
                      <div className="empty-state-desc">
                        Add income or expenses, then adjust the date range.
                      </div>
                    </div>
                  )}

                  {/* Accounts section */}
                  {currentFile && (currentFile.accounts ?? []).length > 0 && calculationResult && (
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '4px' }}>
                      <div className="panel-header">
                        <span className="panel-title">Account Balances</span>
                      </div>
                      <AccountsTable
                        accounts={currentFile.accounts}
                        periods={calculationResult.periods}
                        currency={currency}
                        todayPeriodKey={todayPeriodKey}
                      />
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>

        {/* Right rail */}
        <RightRail
          accounts={currentFile?.accounts ?? []}
          periods={periods}
          currency={currency}
          viewScale={viewScale}
          onScaleChange={setViewScale}
          todayPeriodKey={todayPeriodKey}
          scrollRef={scrollRef}
          colWidth={COL_WIDTH}
          labelWidth={LABEL_WIDTH}
          visibleRange={visibleRange}
        />
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
  pageHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 20px 10px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-panel)',
    flexShrink: 0,
    gap: '12px'
  },
  statRow: {
    display: 'flex',
    gap: '8px',
    padding: '10px 16px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-base)',
    flexShrink: 0
  },
  pageTitle: {
    fontSize: '18px',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    margin: 0,
    color: 'var(--text-primary)'
  },
  pageSub: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    marginTop: '2px'
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
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
  scrollContainer: {
    flex: 1,
    overflowX: 'auto',
    overflowY: 'auto',
    background: 'var(--bg-base)'
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-panel)',
    overflow: 'visible'
  }
}
