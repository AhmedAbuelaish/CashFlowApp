import React, { useMemo } from 'react'
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea
} from 'recharts'
import { format, parseISO, addDays } from 'date-fns'
import type {
  CalculationResult,
  CumulativeChartMode,
  Account,
  PeriodSummary
} from '../../shared/types'

interface Props {
  result: CalculationResult
  cumulativeMode: CumulativeChartMode
  currency: string
  accounts: Account[]
}

const COLORS = {
  income:         '#34d399',
  expense:        '#f87171',
  surplus:        '#60a5fa',
  deficit:        '#fb923c',
  cumulativePos:  '#a78bfa',
  cumulativeLine: '#a78bfa',
  balance:        '#38bdf8'
}

// ─── Background zone fills ───────────────────────────────────
// Applied behind all chart elements with transparency.
const ZONE_FILL: Record<ZoneType, string> = {
  past:          'rgba(148, 163, 184, 0.12)',  // blue-grey — muted past
  current:       'rgba(96, 165, 250, 0.22)',   // blue — you are here
  futureSurplus: 'rgba(52,  211, 153, 0.08)',  // faint green — healthy future
  yellow:        'rgba(234, 179, 8,   0.28)',  // yellow — liquidation action window
  futureDeficit: 'rgba(248, 113, 113, 0.13)',  // faint red — projected deficit
}

type ZoneType = 'past' | 'current' | 'futureSurplus' | 'yellow' | 'futureDeficit'

// ─── Helpers ─────────────────────────────────────────────────

function formatAmount(value: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    notation: Math.abs(value) >= 1_000_000 ? 'compact' : 'standard'
  }).format(value)
}

// 5 business days ≈ 7 calendar days
function bDaysToCalDays(bd: number): number {
  return Math.ceil(bd * 7 / 5)
}

// ─── Zone computation ─────────────────────────────────────────

function computeZones(
  periods: PeriodSummary[],
  accounts: Account[],
  todayISO: string
): Array<{ x1: string; x2: string; fill: string }> {
  if (periods.length === 0) return []

  // First future period where the running balance goes negative
  const firstDeficitIdx = periods.findIndex(
    p => p.periodStart > todayISO && p.cumulativeSurplusDeficit < 0
  )

  let yellowZoneStart: string | null = null

  if (firstDeficitIdx >= 0) {
    const deficitPeriod = periods[firstDeficitIdx]
    const deficitAmount = Math.abs(deficitPeriod.cumulativeSurplusDeficit)

    // Find the shortest liquidation window across accounts that can cover the deficit.
    // Only consider accounts whose total illiquid asset value >= the deficit amount.
    let minCalDays = Infinity

    for (const account of accounts) {
      const assets = account.assets ?? []
      const illiquidAssets = assets.filter(a => a.liquidity === 'tiedUp')
      const totalIlliquid = illiquidAssets.reduce((s, a) => s + a.currentValue, 0)
      if (totalIlliquid < deficitAmount) continue

      for (const asset of illiquidAssets) {
        const rule = asset.liquidationRule ?? account.liquidationRule
        if (!rule) continue
        const rawDays = (rule.saleDelayDays ?? 0) + (rule.transferDelayDays ?? 0)
        if (rawDays <= 0) continue
        const calDays = rule.useBusinessDays ? bDaysToCalDays(rawDays) : rawDays
        minCalDays = Math.min(minCalDays, calDays)
      }
    }

    if (isFinite(minCalDays)) {
      const deficitDate = parseISO(deficitPeriod.periodStart)
      yellowZoneStart = format(addDays(deficitDate, -minCalDays), 'yyyy-MM-dd')
    }
  }

  const deficitStart = firstDeficitIdx >= 0 ? periods[firstDeficitIdx].periodStart : null

  // Classify each period
  const classified: Array<{ label: string; zone: ZoneType }> = []
  for (const p of periods) {
    let zone: ZoneType
    if (p.periodEnd < todayISO) {
      zone = 'past'
    } else if (p.periodStart <= todayISO) {
      zone = 'current'
    } else if (p.cumulativeSurplusDeficit < 0) {
      zone = 'futureDeficit'
    } else if (yellowZoneStart && deficitStart && p.periodStart < deficitStart && p.periodEnd >= yellowZoneStart) {
      zone = 'yellow'
    } else {
      zone = 'futureSurplus'
    }
    classified.push({ label: p.periodLabel, zone })
  }

  // Merge consecutive same-zone periods into a single ReferenceArea span
  const result: Array<{ x1: string; x2: string; fill: string }> = []
  let i = 0
  while (i < classified.length) {
    const z = classified[i].zone
    let j = i
    while (j < classified.length && classified[j].zone === z) j++
    result.push({ x1: classified[i].label, x2: classified[j - 1].label, fill: ZONE_FILL[z] })
    i = j
  }
  return result
}

// ─── Tooltip ─────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label, currency }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-light)',
      borderRadius: '8px',
      padding: '12px 16px',
      fontSize: '12px',
      boxShadow: 'var(--shadow)'
    }}>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 600 }}>{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.name} style={{ display: 'flex', gap: '16px', justifyContent: 'space-between', marginBottom: '3px' }}>
          <span style={{ color: entry.color }}>{entry.name}</span>
          <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
            {formatAmount(entry.value, currency)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Chart component ──────────────────────────────────────────

export default function CashFlowChart({ result, cumulativeMode, currency, accounts }: Props) {
  const todayISO = format(new Date(), 'yyyy-MM-dd')

  const chartData = useMemo(() =>
    result.periods.map(p => ({
      period: p.periodLabel,
      'Cash In':    p.cashFlowIn,
      'Cash Out':  -p.cashFlowOut,
      'Net':        p.netSurplusDeficit,
      'Cumulative': p.cumulativeSurplusDeficit,
      'Balance':    p.endingLiquidBalance
    })),
    [result.periods]
  )

  const zones = useMemo(
    () => computeZones(result.periods, accounts, todayISO),
    // todayISO is stable within a day; recompute when periods or accounts change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result.periods, accounts]
  )

  // Background ReferenceAreas — rendered first so they appear behind bars/lines
  const bgAreas = (yAxisId: string) =>
    zones.map((z, i) => (
      <ReferenceArea
        key={i}
        x1={z.x1}
        x2={z.x2}
        yAxisId={yAxisId}
        fill={z.fill}
        strokeOpacity={0}
      />
    ))

  const commonProps = {
    data: chartData,
    margin: { top: 8, right: 16, left: 0, bottom: 0 }
  }

  const xAxis = (
    <XAxis
      dataKey="period"
      tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
      axisLine={{ stroke: 'var(--border)' }}
      tickLine={{ stroke: 'var(--border)' }}
      interval="preserveStartEnd"
    />
  )

  const yAxis = (key?: string) => (
    <YAxis
      yAxisId={key ?? 'left'}
      tickFormatter={v => formatAmount(v, currency)}
      tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
      axisLine={false}
      tickLine={false}
      width={72}
    />
  )

  const grid = <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
  const refLine = <ReferenceLine y={0} yAxisId="left" stroke="var(--border-light)" />

  if (cumulativeMode === 'sameChart') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart {...commonProps}>
          {bgAreas('left')}
          {grid}
          {xAxis}
          {yAxis()}
          {refLine}
          <Tooltip content={<CustomTooltip currency={currency} />} />
          <Legend wrapperStyle={{ fontSize: '11px', color: 'var(--text-secondary)' }} />
          <Bar dataKey="Cash In"  yAxisId="left" fill={COLORS.income}  opacity={0.85} radius={[2,2,0,0]} />
          <Bar dataKey="Cash Out" yAxisId="left" fill={COLORS.expense} opacity={0.85} radius={[2,2,0,0]} />
          <Line dataKey="Net" yAxisId="left" stroke={COLORS.surplus} strokeWidth={2} dot={{ r: 3, fill: COLORS.surplus }} type="monotone" />
          <Line dataKey="Cumulative" yAxisId="left" stroke={COLORS.cumulativeLine} strokeWidth={2.5} dot={{ r: 3, fill: COLORS.cumulativeLine }} type="monotone" strokeDasharray="6 2" />
        </ComposedChart>
      </ResponsiveContainer>
    )
  }

  if (cumulativeMode === 'separateChart') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '4px' }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '10px', color: 'var(--text-muted)', paddingLeft: '8px', marginBottom: '4px' }}>
            PERIOD CASH FLOW
          </p>
          <ResponsiveContainer width="100%" height="90%">
            <ComposedChart {...commonProps}>
              {bgAreas('left')}
              {grid}
              {xAxis}
              {yAxis()}
              {refLine}
              <Tooltip content={<CustomTooltip currency={currency} />} />
              <Bar dataKey="Cash In"  yAxisId="left" fill={COLORS.income}  opacity={0.85} radius={[2,2,0,0]} />
              <Bar dataKey="Cash Out" yAxisId="left" fill={COLORS.expense} opacity={0.85} radius={[2,2,0,0]} />
              <Line dataKey="Net" yAxisId="left" stroke={COLORS.surplus} strokeWidth={2} dot={{ r: 2, fill: COLORS.surplus }} type="monotone" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div style={{ height: '1px', background: 'var(--border)' }} />

        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '10px', color: 'var(--text-muted)', paddingLeft: '8px', marginBottom: '4px' }}>
            CUMULATIVE SURPLUS / DEFICIT
          </p>
          <ResponsiveContainer width="100%" height="90%">
            <ComposedChart {...commonProps}>
              {bgAreas('left')}
              {grid}
              {xAxis}
              {yAxis()}
              <ReferenceLine y={0} yAxisId="left" stroke="var(--deficit)" strokeDasharray="4 2" />
              <Tooltip content={<CustomTooltip currency={currency} />} />
              <Bar dataKey="Balance"    yAxisId="left" fill={COLORS.balance} opacity={0.4} radius={[2,2,0,0]} />
              <Line dataKey="Cumulative" yAxisId="left" stroke={COLORS.cumulativeLine} strokeWidth={2.5} dot={{ r: 3, fill: COLORS.cumulativeLine }} type="monotone" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    )
  }

  // Hidden cumulative — just the period chart
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart {...commonProps}>
        {bgAreas('left')}
        {grid}
        {xAxis}
        {yAxis()}
        {refLine}
        <Tooltip content={<CustomTooltip currency={currency} />} />
        <Legend wrapperStyle={{ fontSize: '11px', color: 'var(--text-secondary)' }} />
        <Bar dataKey="Cash In"  yAxisId="left" fill={COLORS.income}  opacity={0.85} radius={[2,2,0,0]} />
        <Bar dataKey="Cash Out" yAxisId="left" fill={COLORS.expense} opacity={0.85} radius={[2,2,0,0]} />
        <Line dataKey="Net" yAxisId="left" stroke={COLORS.surplus} strokeWidth={2} dot={{ r: 2 }} type="monotone" />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
