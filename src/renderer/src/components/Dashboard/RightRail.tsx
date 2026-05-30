// Dashboard right rail: account donut, key info tiles, adaptive calendar

import { useState, useMemo } from 'react'
import { format } from 'date-fns'
import type { Account, PeriodSummary, ViewScale } from '../../shared/types'

// ────────────────────────────────────────────────────────────────
// Donut chart
// ────────────────────────────────────────────────────────────────

interface DonutProps {
  accounts: Account[]
  currency: string
}

function AccountDonut({ accounts, currency }: DonutProps) {
  const totals = useMemo(() => {
    let liquid = 0, tiedUp = 0, credit = 0
    for (const a of accounts) {
      const base = a.balance ?? 0
      const assetTotal = (a.assets ?? []).reduce((s, x) => s + (x.currentValue ?? 0), 0)
      const val = (a.assets ?? []).length > 0 ? assetTotal : base
      if (a.liquidity === 'liquid') liquid += val
      else tiedUp += val
      // Credit accounts have negative balance conventionally
      if (a.type === 'credit' || a.type === 'creditcard') credit += val
    }
    return { liquid, tiedUp, credit }
  }, [accounts])

  const net    = totals.liquid + totals.tiedUp + totals.credit
  const assets = totals.liquid + totals.tiedUp

  const R = 44, SW = 13, C = 52
  const circ = 2 * Math.PI * R

  const slices = [
    { key: 'liquid', label: 'Liquid',   value: totals.liquid, color: 'var(--income)' },
    { key: 'tiedUp', label: 'Tied up',  value: totals.tiedUp, color: 'var(--cumulative-pos)' },
  ]
  let offset = 0
  const segs = slices.map(s => {
    const frac = assets > 0 ? Math.max(0, s.value) / assets : 0
    const seg = { ...s, frac, dash: frac * circ, offset }
    offset += frac * circ
    return seg
  })

  const fmt = (n: number) => {
    const abs = Math.abs(n)
    if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000)     return `$${(abs / 1_000).toFixed(1)}k`
    return `$${abs.toFixed(0)}`
  }

  const legend = [
    { label: 'Liquid',      value: totals.liquid, color: 'var(--income)',         pct: assets > 0 ? totals.liquid / assets * 100 : 0 },
    { label: 'Tied up',     value: totals.tiedUp, color: 'var(--cumulative-pos)', pct: assets > 0 ? totals.tiedUp / assets * 100 : 0 },
    { label: 'Liabilities', value: totals.credit, color: 'var(--expense)',         pct: null },
  ]

  return (
    <div className="rail-card">
      <div className="rail-card-hd">
        <h3>Account balances</h3>
        <span className="rail-card-sub">{accounts.length} account{accounts.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="donut-body">
        <div className="donut-chart">
          <svg viewBox={`0 0 ${C*2} ${C*2}`} width={C*2} height={C*2}>
            <circle cx={C} cy={C} r={R} fill="none" stroke="var(--bg-hover)" strokeWidth={SW} />
            {segs.map(s => (
              <circle
                key={s.key}
                cx={C} cy={C} r={R}
                fill="none"
                stroke={s.color}
                strokeWidth={SW}
                strokeDasharray={`${s.dash} ${circ - s.dash}`}
                strokeDashoffset={-s.offset}
                transform={`rotate(-90 ${C} ${C})`}
                strokeLinecap="butt"
              />
            ))}
          </svg>
          <div className="donut-center">
            <span className="donut-center-lbl">Net worth</span>
            <b>{fmt(net)}</b>
          </div>
        </div>
        <div className="donut-legend">
          {legend.map(l => (
            <div key={l.label} className="donut-leg-row">
              <span className="donut-leg-dot" style={{ background: l.color }} />
              <span className="donut-leg-label">{l.label}</span>
              <span className="donut-leg-val">{fmt(l.value)}</span>
              {l.pct != null && (
                <span className="donut-leg-pct">{l.pct.toFixed(0)}%</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// Key info tiles
// ────────────────────────────────────────────────────────────────

interface InfoTilesProps {
  periods: PeriodSummary[]
  currency: string
}

function fmtAmt(n: number, currency: string): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `$${(abs / 1_000).toFixed(1)}k`
  return `$${abs.toFixed(0)}`
}

function InfoTiles({ periods, currency }: InfoTilesProps) {
  const todayISO = format(new Date(), 'yyyy-MM-dd')
  const nowMonth = new Date().getMonth()
  const nowYear  = new Date().getFullYear()

  const monthIn = useMemo(() => periods
    .filter(p => p.periodStart.startsWith(`${nowYear}-${String(nowMonth + 1).padStart(2,'0')}`))
    .reduce((s, p) => s + p.cashFlowIn, 0), [periods, nowYear, nowMonth])

  const monthOut = useMemo(() => periods
    .filter(p => p.periodStart.startsWith(`${nowYear}-${String(nowMonth + 1).padStart(2,'0')}`))
    .reduce((s, p) => s + p.cashFlowOut, 0), [periods, nowYear, nowMonth])

  const exp30 = useMemo(() => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() + 30)
    const cISO = format(cutoff, 'yyyy-MM-dd')
    return periods
      .filter(p => p.periodStart >= todayISO && p.periodEnd <= cISO)
      .reduce((s, p) => s + p.cashFlowOut, 0)
  }, [periods, todayISO])

  // First period going negative
  const deficitPeriod = useMemo(() => {
    const todayPeriod = periods.find(p => p.periodStart <= todayISO && todayISO <= p.periodEnd)
    if (!todayPeriod) return null
    const idx = periods.indexOf(todayPeriod)
    return periods.slice(idx).find(p => p.endingLiquidBalance < 0) ?? null
  }, [periods, todayISO])

  const monthName = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][nowMonth]

  return (
    <div className="info-grid">
      <div className="info-tile">
        <div className="info-tile-lbl">Income · {monthName}</div>
        <div className="info-tile-val" style={{ color: 'var(--income)' }}>+{fmtAmt(monthIn, currency)}</div>
      </div>
      <div className="info-tile">
        <div className="info-tile-lbl">Expenses · {monthName}</div>
        <div className="info-tile-val" style={{ color: 'var(--expense)' }}>−{fmtAmt(monthOut, currency)}</div>
      </div>
      <div className="info-tile">
        <div className="info-tile-lbl">Expenses · next 30d</div>
        <div className="info-tile-val" style={{ color: 'var(--expense)' }}>−{fmtAmt(exp30, currency)}</div>
      </div>
      <div className="info-tile">
        <div className="info-tile-lbl">Goes into deficit</div>
        <div className="info-tile-val" style={{ color: deficitPeriod ? 'var(--deficit)' : 'var(--income)' }}>
          {deficitPeriod ? deficitPeriod.periodLabel : 'No deficit'}
        </div>
        {!deficitPeriod && (
          <div className="info-tile-sub">stays positive</div>
        )}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// Upcoming income/expense events from periods
// ────────────────────────────────────────────────────────────────

interface UpcomingEventsProps {
  periods: PeriodSummary[]
  currency: string
}

function UpcomingEvents({ periods, currency }: UpcomingEventsProps) {
  const todayISO = format(new Date(), 'yyyy-MM-dd')

  const { nextInc, nextExp } = useMemo(() => {
    let nextInc: { label: string; date: string; amount: number } | null = null
    let nextExp: { label: string; date: string; amount: number } | null = null

    for (const p of periods) {
      if (p.periodEnd < todayISO) continue
      for (const occ of p.occurrences) {
        if (occ.date < todayISO) continue
        if (!nextInc && occ.type === 'income') {
          nextInc = { label: occ.name, date: occ.date, amount: occ.amount }
        }
        if (!nextExp && occ.type === 'expense') {
          nextExp = { label: occ.name, date: occ.date, amount: occ.amount }
        }
        if (nextInc && nextExp) break
      }
      if (nextInc && nextExp) break
    }
    return { nextInc, nextExp }
  }, [periods, todayISO])

  const relDays = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00')
    const diff = Math.round((d.getTime() - new Date().setHours(0,0,0,0)) / 86400000)
    if (diff === 0) return 'today'
    if (diff === 1) return 'tomorrow'
    return `in ${diff}d`
  }

  return (
    <div className="info-events-card">
      {[
        { kind: 'inc', label: 'Next income',  ev: nextInc },
        { kind: 'exp', label: 'Next expense', ev: nextExp },
      ].map(({ kind, label, ev }) => (
        <div key={kind} className="info-event">
          <span className={`info-ev-dot ${kind}`} />
          {ev ? (
            <>
              <div className="info-ev-meta">
                <span className="info-ev-label">{label}</span>
                <span className="info-ev-name">{ev.label}</span>
              </div>
              <div className="info-ev-right">
                <span className={`info-ev-amt ${kind}`}>
                  {kind === 'inc' ? '+' : '−'}{fmtAmt(ev.amount, currency)}
                </span>
                <span className="info-ev-date">
                  {format(new Date(ev.date + 'T00:00:00'), 'MMM d')} · {relDays(ev.date)}
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="info-ev-meta">
                <span className="info-ev-label">{label}</span>
              </div>
              <span className="info-ev-none">none in range</span>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// Adaptive calendar
// ────────────────────────────────────────────────────────────────

type CalMode = 'days' | 'months' | 'years'

const MON3     = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const FULLMON  = ['January','February','March','April','May','June','July','August','September','October','November','December']
const LEVEL_ORDER: ViewScale[] = ['day','week','month','quarter','halfYear','year']

function isoWeekNum(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - dayNum + 3)
  const firstThu = d.getTime()
  d.setUTCMonth(0, 1)
  if (d.getUTCDay() !== 4) d.setUTCMonth(0, 1 + (4 - d.getUTCDay() + 7) % 7)
  return 1 + Math.ceil((firstThu - d.getTime()) / (7 * 24 * 3600 * 1000))
}

interface CalendarProps {
  periods: PeriodSummary[]
  viewScale: ViewScale
  onScaleChange: (s: ViewScale) => void
  todayPeriodKey: string | null
  scrollRef: React.RefObject<HTMLDivElement | null>
  colWidth: number
  labelWidth: number
}

function CalendarNav({ periods, viewScale, onScaleChange, todayPeriodKey, scrollRef, colWidth, labelWidth }: CalendarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const today = useMemo(() => new Date(), [])

  const [view, setView] = useState({ y: today.getFullYear(), m: today.getMonth() })

  // Map from 'yyyy-MM-dd' → has income/expense
  const dayMap = useMemo(() => {
    const m = new Map<string, { hasInc: boolean; hasExp: boolean }>()
    for (const p of periods) {
      for (const occ of p.occurrences) {
        const ex = m.get(occ.date) ?? { hasInc: false, hasExp: false }
        if (occ.type === 'income')  ex.hasInc = true
        if (occ.type === 'expense') ex.hasExp = true
        m.set(occ.date, ex)
      }
    }
    return m
  }, [periods])

  // Which period keys are currently visible? We look at today's period as center.
  const visiblePeriodKeys = useMemo(() => {
    const el = scrollRef.current
    if (!el || !periods.length) return new Set<string>()
    const sl = el.scrollLeft
    const visW = el.clientWidth - labelWidth
    const firstCol = Math.max(0, Math.floor(sl / colWidth))
    const lastCol  = Math.min(periods.length - 1, firstCol + Math.ceil(visW / colWidth))
    return new Set(periods.slice(firstCol, lastCol + 1).map(p => p.periodKey))
  }, [periods, scrollRef, colWidth, labelWidth])

  const calMode: CalMode =
    viewScale === 'day' || viewScale === 'week' ? 'days' :
    viewScale === 'year' ? 'years' : 'months'

  const todayKey = format(today, 'yyyy-MM-dd')
  const levelIdx = LEVEL_ORDER.indexOf(viewScale)

  const zoom = (dir: number) => {
    const ni = Math.min(LEVEL_ORDER.length - 1, Math.max(0, levelIdx + dir))
    onScaleChange(LEVEL_ORDER[ni])
  }

  // Jump table scroll to a period containing a date
  const jumpToDate = (dateISO: string) => {
    const target = periods.find(p => p.periodStart <= dateISO && dateISO <= p.periodEnd)
    if (!target || !scrollRef.current) return
    const idx = periods.indexOf(target)
    scrollRef.current.scrollLeft = Math.max(0, (idx - 1) * colWidth)
  }

  let title: React.ReactNode
  if (calMode === 'days')   title = <><b>{FULLMON[view.m]}</b><span className="cal-year">{view.y}</span></>
  else if (calMode === 'months') title = <b>{view.y}</b>
  else { const base = view.y - view.y % 4; title = <b>{base}–{base + 11}</b> }

  const prevView = () => {
    if (calMode === 'days')   setView(v => { const d = new Date(v.y, v.m - 1); return { y: d.getFullYear(), m: d.getMonth() } })
    else if (calMode === 'months') setView(v => ({ ...v, y: v.y - 1 }))
    else setView(v => ({ ...v, y: v.y - 12 }))
  }
  const nextView = () => {
    if (calMode === 'days')   setView(v => { const d = new Date(v.y, v.m + 1); return { y: d.getFullYear(), m: d.getMonth() } })
    else if (calMode === 'months') setView(v => ({ ...v, y: v.y + 1 }))
    else setView(v => ({ ...v, y: v.y + 12 }))
  }

  // ── Day grid ──
  const renderDays = () => {
    const first     = new Date(view.y, view.m, 1)
    const startDow  = first.getDay()
    const daysInMon = new Date(view.y, view.m + 1, 0).getDate()
    type Cell = { date: Date; out: boolean }
    const cells: Cell[] = []
    for (let i = 0; i < startDow; i++)
      cells.push({ date: new Date(view.y, view.m, 1 - (startDow - i)), out: true })
    for (let d = 1; d <= daysInMon; d++)
      cells.push({ date: new Date(view.y, view.m, d), out: false })
    while (cells.length % 7 !== 0 || cells.length < 35) {
      const last = cells[cells.length - 1].date
      cells.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), out: true })
      if (cells.length >= 42) break
    }

    const rows: Cell[][] = []
    for (let r = 0; r < cells.length / 7; r++) rows.push(cells.slice(r * 7, r * 7 + 7))

    return (
      <>
        <div className="cal-grid cal-grid days">
          <span className="cal-wk-cell" />
          {['S','M','T','W','T','F','S'].map((d, i) => <span key={i} className="cal-dow-cell">{d}</span>)}
        </div>
        <div className="cal-rows">
          {rows.map((row, ri) => (
            <div key={ri} className="cal-grid days">
              <span className="cal-wk-cell">{isoWeekNum(row[0].date)}</span>
              {row.map((c, ci) => {
                const iso  = format(c.date, 'yyyy-MM-dd')
                const info = dayMap.get(iso)
                const cls  = ['cal-cell']
                if (c.out) cls.push('out')
                if (iso === todayKey) cls.push('today')
                if (!info) cls.push('disabled')
                return (
                  <button
                    key={ci}
                    className={cls.join(' ')}
                    onClick={() => info && jumpToDate(iso)}
                    disabled={!info || c.out}
                  >
                    <span className="cal-num">{c.date.getDate()}</span>
                    <span className="cal-dots">
                      {info?.hasInc && <span className="cal-dot inc" />}
                      {info?.hasExp && <span className="cal-dot exp" />}
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </>
    )
  }

  // ── Month grid ──
  const renderMonths = () => (
    <div className="cal-grid cal-months">
      {MON3.map((mn, m) => {
        const firstPeriod = periods.find(p => {
          const ps = new Date(p.periodStart + 'T00:00:00')
          return ps.getFullYear() === view.y && ps.getMonth() === m
        })
        const isToday = view.y === today.getFullYear() && m === today.getMonth()
        const cls = ['cal-mcell']
        if (isToday) cls.push('today')
        if (!firstPeriod) cls.push('disabled')
        return (
          <button
            key={m}
            className={cls.join(' ')}
            onClick={() => firstPeriod && jumpToDate(firstPeriod.periodStart)}
            disabled={!firstPeriod}
          >
            {mn}
          </button>
        )
      })}
    </div>
  )

  // ── Year grid ──
  const renderYears = () => {
    const base  = view.y - view.y % 4 - 4
    const years = Array.from({ length: 12 }, (_, i) => base + i)
    return (
      <div className="cal-grid cal-years">
        {years.map(y => {
          const firstPeriod = periods.find(p => p.periodStart.startsWith(String(y)))
          const isToday = y === today.getFullYear()
          const cls = ['cal-mcell', 'year']
          if (isToday) cls.push('today')
          if (!firstPeriod) cls.push('disabled')
          return (
            <button
              key={y}
              className={cls.join(' ')}
              onClick={() => firstPeriod && jumpToDate(firstPeriod.periodStart)}
              disabled={!firstPeriod}
            >
              {y}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <section className={`rail-card cal-card${collapsed ? ' collapsed' : ''}`}>
      <div className="cal-hd">
        <button className="cal-collapse" onClick={() => setCollapsed(c => !c)} title={collapsed ? 'Expand' : 'Collapse'}>
          {collapsed ? '▶' : '▼'}
        </button>
        <div className="cal-title" style={{ cursor: 'default' }}>
          {title}
        </div>
        <div className="cal-nav">
          <button className="cal-today" onClick={() => {
            setView({ y: today.getFullYear(), m: today.getMonth() })
            jumpToDate(format(today, 'yyyy-MM-dd'))
          }}>TODAY</button>
          <button className="cal-arrow" onClick={prevView} title="Previous">◀</button>
          <button className="cal-arrow" onClick={nextView} title="Next">▶</button>
          <button className="cal-arrow" onClick={() => zoom(1)}  title="Zoom out" disabled={levelIdx >= LEVEL_ORDER.length - 1}>+</button>
          <button className="cal-arrow" onClick={() => zoom(-1)} title="Zoom in"  disabled={levelIdx <= 0}>−</button>
        </div>
      </div>
      {!collapsed && (
        <div className="cal-body">
          {calMode === 'days'   && renderDays()}
          {calMode === 'months' && renderMonths()}
          {calMode === 'years'  && renderYears()}
        </div>
      )}
    </section>
  )
}

// ────────────────────────────────────────────────────────────────
// Main RightRail export
// ────────────────────────────────────────────────────────────────

interface RightRailProps {
  accounts: Account[]
  periods: PeriodSummary[]
  currency: string
  viewScale: ViewScale
  onScaleChange: (s: ViewScale) => void
  todayPeriodKey: string | null
  scrollRef: React.RefObject<HTMLDivElement | null>
  colWidth: number
  labelWidth: number
}

export default function RightRail({
  accounts, periods, currency, viewScale, onScaleChange, todayPeriodKey,
  scrollRef, colWidth, labelWidth
}: RightRailProps) {
  return (
    <aside className="dash-rail-v2">
      {/* Scrollable top section */}
      <div className="rail-scroll-top">
        {accounts.length > 0 && (
          <AccountDonut accounts={accounts} currency={currency} />
        )}
        {periods.length > 0 && (
          <>
            <InfoTiles periods={periods} currency={currency} />
            <UpcomingEvents periods={periods} currency={currency} />
          </>
        )}
      </div>

      {/* Calendar — always pinned to the bottom, fixed height */}
      <CalendarNav
        periods={periods}
        viewScale={viewScale}
        onScaleChange={onScaleChange}
        todayPeriodKey={todayPeriodKey}
        scrollRef={scrollRef}
        colWidth={colWidth}
        labelWidth={labelWidth}
      />
    </aside>
  )
}
