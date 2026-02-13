'use client';

import { useState, useMemo } from 'react';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { HistoryPoint, V2HistoryPoint } from '@/lib/types';

interface OracleChartProps {
  history: HistoryPoint[];
  v2History: V2HistoryPoint[];
}

type TimeRange = '1D' | '1W' | '1M' | 'ALL';

const RANGE_MS: Record<TimeRange, number> = {
  '1D': 24 * 60 * 60 * 1000,
  '1W': 7 * 24 * 60 * 60 * 1000,
  '1M': 30 * 24 * 60 * 60 * 1000,
  'ALL': Infinity,
};

export default function OracleChart({ history, v2History }: OracleChartProps) {
  const [range, setRange] = useState<TimeRange>('ALL');

  // Merge V1 history and V2 history by timestamp into a unified dataset
  const data = useMemo(() => {
    const now = Date.now();
    const cutoff = range === 'ALL' ? 0 : now - RANGE_MS[range];

    // Build a map from timestamp -> merged data point
    const pointMap = new Map<number, {
      time: number;
      oracle_v1: number | null;
      oracle_v2: number | null;
      tips: number | null;
      noChange: number | null;
      cut25: number | null;
      cut50: number | null;
      hike25: number | null;
    }>();

    // Add V1 history points
    for (const h of history) {
      const t = new Date(h.timestamp).getTime();
      if (t < cutoff) continue;
      // Round to nearest minute to help merge with V2
      const key = Math.round(t / 60000) * 60000;
      const existing = pointMap.get(key);
      if (existing) {
        existing.oracle_v1 = h.oracle_value;
        existing.noChange = h.prob_no_change !== null ? h.prob_no_change * 100 : null;
        existing.cut25 = h.prob_cut_25 !== null ? h.prob_cut_25 * 100 : null;
        existing.cut50 = h.prob_cut_50 !== null ? h.prob_cut_50 * 100 : null;
        existing.hike25 = h.prob_hike_25 !== null ? h.prob_hike_25 * 100 : null;
      } else {
        pointMap.set(key, {
          time: key,
          oracle_v1: h.oracle_value,
          oracle_v2: null,
          tips: null,
          noChange: h.prob_no_change !== null ? h.prob_no_change * 100 : null,
          cut25: h.prob_cut_25 !== null ? h.prob_cut_25 * 100 : null,
          cut50: h.prob_cut_50 !== null ? h.prob_cut_50 * 100 : null,
          hike25: h.prob_hike_25 !== null ? h.prob_hike_25 * 100 : null,
        });
      }
    }

    // Add V2 history points
    for (const v of v2History) {
      const t = new Date(v.timestamp).getTime();
      if (t < cutoff) continue;
      const key = Math.round(t / 60000) * 60000;
      const existing = pointMap.get(key);
      if (existing) {
        existing.oracle_v2 = v.oracle_v2;
        existing.oracle_v1 = existing.oracle_v1 ?? v.oracle_v1;
        existing.tips = v.tips_breakeven;
      } else {
        pointMap.set(key, {
          time: key,
          oracle_v1: v.oracle_v1,
          oracle_v2: v.oracle_v2,
          tips: v.tips_breakeven,
          noChange: null,
          cut25: null,
          cut50: null,
          hike25: null,
        });
      }
    }

    // Sort by time
    const sorted = Array.from(pointMap.values()).sort((a, b) => a.time - b.time);

    // Downsample if too many points for smooth rendering
    if (sorted.length > 800) {
      const step = Math.ceil(sorted.length / 800);
      const downsampled = [];
      for (let i = 0; i < sorted.length; i += step) {
        downsampled.push(sorted[i]);
      }
      // Always include the last point
      if (downsampled[downsampled.length - 1] !== sorted[sorted.length - 1]) {
        downsampled.push(sorted[sorted.length - 1]);
      }
      return downsampled;
    }

    return sorted;
  }, [history, v2History, range]);

  // Compute Y-axis domain for oracle values
  const { yMin, yMax } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const d of data) {
      if (d.oracle_v2 !== null) { min = Math.min(min, d.oracle_v2); max = Math.max(max, d.oracle_v2); }
      if (d.oracle_v1 !== null) { min = Math.min(min, d.oracle_v1); max = Math.max(max, d.oracle_v1); }
      if (d.tips !== null) { min = Math.min(min, d.tips); max = Math.max(max, d.tips); }
    }
    if (min === Infinity) { min = 2.0; max = 3.0; }
    const pad = Math.max((max - min) * 0.15, 0.05);
    return {
      yMin: Math.floor((min - pad) * 100) / 100,
      yMax: Math.ceil((max + pad) * 100) / 100,
    };
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="border border-gray-800 rounded p-4 mb-4 bg-[#0d0d1a] h-[420px] flex items-center justify-center">
        <span className="text-gray-600 font-mono text-sm">Loading chart data...</span>
      </div>
    );
  }

  // Smart date formatting based on range
  const formatXTick = (ts: number) => {
    const d = new Date(ts);
    if (range === '1D') {
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    if (range === '1W') {
      return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:00`;
    }
    return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formatTooltipLabel = (label: any) => {
    const d = new Date(Number(label));
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  // Latest oracle V2 for the reference line
  const latestV2 = data.length > 0 ? data[data.length - 1].oracle_v2 : null;

  return (
    <div className="border border-gray-800 rounded mb-4 bg-[#0d0d1a] overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800/60">
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-500 font-mono font-bold tracking-wide">ORACLE</span>
          <div className="flex items-center gap-3 text-[10px] font-mono">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-[2px] bg-purple-400 rounded" />
              <span className="text-gray-500">V2</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-[2px] bg-gray-500 rounded" style={{ borderTop: '1px dashed #6b7280' }} />
              <span className="text-gray-600">V1</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-[2px] bg-blue-400/60 rounded" />
              <span className="text-gray-600">TIPS</span>
            </span>
          </div>
        </div>
        {/* Time range selector */}
        <div className="flex gap-0.5">
          {(['1D', '1W', '1M', 'ALL'] as TimeRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2.5 py-1 text-[10px] font-mono font-bold rounded transition-colors ${
                range === r
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40'
                  : 'text-gray-600 hover:text-gray-400 border border-transparent'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="px-2 pt-2 pb-1">
        <ResponsiveContainer width="100%" height={380}>
          <ComposedChart data={data} margin={{ top: 8, right: 50, left: 0, bottom: 4 }}>
            <CartesianGrid
              strokeDasharray="1 4"
              stroke="#1a1a2e"
              vertical={false}
            />
            <XAxis
              dataKey="time"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={formatXTick}
              stroke="none"
              tick={{ fill: '#444', fontSize: 10, fontFamily: 'monospace' }}
              scale="time"
              tickLine={false}
              axisLine={false}
              minTickGap={60}
            />
            {/* Left Y axis — Oracle values */}
            <YAxis
              yAxisId="oracle"
              orientation="left"
              domain={[yMin, yMax]}
              stroke="none"
              tick={{ fill: '#666', fontSize: 10, fontFamily: 'monospace' }}
              tickFormatter={(v: number) => `${v.toFixed(2)}%`}
              width={58}
              tickLine={false}
              axisLine={false}
              tickCount={8}
            />
            {/* Right Y axis — Probabilities */}
            <YAxis
              yAxisId="prob"
              orientation="right"
              domain={[0, 100]}
              stroke="none"
              tick={{ fill: '#444', fontSize: 10, fontFamily: 'monospace' }}
              tickFormatter={(v: number) => `${v}%`}
              width={42}
              tickLine={false}
              axisLine={false}
              tickCount={5}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#111122',
                border: '1px solid #2a2a3e',
                borderRadius: 6,
                fontSize: 11,
                fontFamily: 'monospace',
                padding: '8px 12px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              }}
              labelFormatter={formatTooltipLabel}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={((value: any, name?: string) => {
                if (value === null || value === undefined) return [null, null];
                const v = Number(value);
                if (name === 'V2 Oracle') return [`${v.toFixed(4)}%`, name];
                if (name === 'V1 Oracle') return [`${v.toFixed(4)}%`, name];
                if (name === 'TIPS BE') return [`${v.toFixed(2)}%`, name];
                if (name === 'No Change') return [`${v.toFixed(1)}%`, name];
                if (name === 'Cut 25bp') return [`${v.toFixed(1)}%`, name];
                return [null, null];
              }) as never}
              itemStyle={{ padding: '1px 0' }}
            />

            {/* Probability area fills (subtle background) */}
            <Area
              yAxisId="prob"
              dataKey="noChange"
              name="No Change"
              fill="#c084fc"
              fillOpacity={0.06}
              stroke="none"
              connectNulls
              isAnimationActive={false}
            />
            <Area
              yAxisId="prob"
              dataKey="cut25"
              name="Cut 25bp"
              fill="#60a5fa"
              fillOpacity={0.04}
              stroke="none"
              connectNulls
              isAnimationActive={false}
            />

            {/* TIPS breakeven — thin blue line */}
            <Line
              yAxisId="oracle"
              dataKey="tips"
              name="TIPS BE"
              stroke="#3b82f6"
              strokeWidth={1.2}
              strokeOpacity={0.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />

            {/* V1 Oracle — thin gray dashed line */}
            <Line
              yAxisId="oracle"
              dataKey="oracle_v1"
              name="V1 Oracle"
              stroke="#555"
              strokeWidth={1}
              strokeDasharray="4 3"
              dot={false}
              connectNulls
              isAnimationActive={false}
            />

            {/* V2 Oracle — thick purple line (primary) */}
            <Line
              yAxisId="oracle"
              dataKey="oracle_v2"
              name="V2 Oracle"
              stroke="#a855f7"
              strokeWidth={2.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />

            {/* Reference line for latest V2 value */}
            {latestV2 !== null && (
              <ReferenceLine
                yAxisId="oracle"
                y={latestV2}
                stroke="#a855f7"
                strokeDasharray="2 4"
                strokeOpacity={0.3}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Footer with data point count */}
      <div className="px-4 py-1.5 border-t border-gray-800/40 flex justify-between text-[10px] text-gray-600 font-mono">
        <span>{data.length.toLocaleString()} data points</span>
        <span>
          {data.length > 0 && (
            <>
              {new Date(data[0].time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              {' — '}
              {new Date(data[data.length - 1].time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </>
          )}
        </span>
      </div>
    </div>
  );
}
