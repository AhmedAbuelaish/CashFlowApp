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
  LineChart
} from 'recharts'
import type { CalculationResult, CumulativeChartMode } from '../../shared/types'

interface Props {
  result: CalculationResult
  cumulativeMode: CumulativeChartMode
  currency: string
}

const COLORS = {
  income:          '#34d399',
  expense:         '#f87171',
  surplus:         '#60a5fa',
  deficit:         '#fb923c',
  cumulativePos:   '#a78bfa',
  cumulativeLine:  '#a78bfa',
  balance:         '#38bdf8'
}

function formatAmount(value: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    notation: Math.abs(value) >= 1_000_000 ? 'compact' : 'standard'
  }).format(value)
}

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

export default function CashFlowChart({ result, cumulativeMode, currency }: Props) {
  const chartData = useMemo(() =>
    result.periods.map(p => ({
      period: p.periodLabel,
      'Cash In':  p.cashFlowIn,
      'Cash Out': -p.cashFlowOut, // Negative for display clarity
      'Net':      p.netSurplusDeficit,
      'Cumulative': p.cumulativeSurplusDeficit,
      'Balance':  p.endingLiquidBalance
    })),
    [result.periods]
  )

  const commonProps = {
    data: chartData,
    margin: { top: 8, right: 16, left: 0, bottom: 0 }
  }

  const xAxis = (
    <XAxis
      dataKey="period"
      tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
      axisLine={{ stroke: 'var(--border)' }}
      tickLine={false}
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
          {grid}
          {xAxis}
          {yAxis()}
          {refLine}
          <Tooltip content={<CustomTooltip currency={currency} />} />
          <Legend
            wrapperStyle={{ fontSize: '11px', color: 'var(--text-secondary)' }}
          />
          <Bar dataKey="Cash In"  yAxisId="left" fill={COLORS.income}  opacity={0.85} radius={[2,2,0,0]} />
          <Bar dataKey="Cash Out" yAxisId="left" fill={COLORS.expense} opacity={0.85} radius={[2,2,0,0]} />
          <Line
            dataKey="Net"
            yAxisId="left"
            stroke={COLORS.surplus}
            strokeWidth={2}
            dot={{ r: 3, fill: COLORS.surplus }}
            type="monotone"
          />
          <Line
            dataKey="Cumulative"
            yAxisId="left"
            stroke={COLORS.cumulativeLine}
            strokeWidth={2.5}
            dot={{ r: 3, fill: COLORS.cumulativeLine }}
            type="monotone"
            strokeDasharray="6 2"
          />
        </ComposedChart>
      </ResponsiveContainer>
    )
  }

  if (cumulativeMode === 'separateChart') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '4px' }}>
        {/* Period chart */}
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '10px', color: 'var(--text-muted)', paddingLeft: '8px', marginBottom: '4px' }}>
            PERIOD CASH FLOW
          </p>
          <ResponsiveContainer width="100%" height="90%">
            <ComposedChart {...commonProps}>
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

        {/* Cumulative chart */}
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '10px', color: 'var(--text-muted)', paddingLeft: '8px', marginBottom: '4px' }}>
            CUMULATIVE SURPLUS / DEFICIT
          </p>
          <ResponsiveContainer width="100%" height="90%">
            <ComposedChart {...commonProps}>
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

  // Hidden cumulative — just show period chart
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart {...commonProps}>
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
