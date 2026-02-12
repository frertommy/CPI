'use client';

import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { HistoryPoint } from '@/lib/types';

interface OracleChartProps {
  history: HistoryPoint[];
}

export default function OracleChart({ history }: OracleChartProps) {
  if (history.length === 0) {
    return (
      <div className="border border-gray-800 rounded p-4 mb-4 bg-gray-900/50 h-72 flex items-center justify-center">
        <span className="text-gray-600 font-mono text-sm">Loading chart data...</span>
      </div>
    );
  }

  const data = history.map((h) => ({
    time: new Date(h.timestamp).getTime(),
    oracle: h.oracle_value,
    noChange: h.prob_no_change !== null ? h.prob_no_change * 100 : null,
    cut25: h.prob_cut_25 !== null ? h.prob_cut_25 * 100 : null,
    cut50: h.prob_cut_50 !== null ? h.prob_cut_50 * 100 : null,
    hike25: h.prob_hike_25 !== null ? h.prob_hike_25 * 100 : null,
  }));

  const formatDate = (ts: number | string) => {
    const d = new Date(Number(ts));
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formatTime = (label: any) => {
    const d = new Date(Number(label));
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  return (
    <div className="border border-gray-800 rounded p-4 mb-4 bg-gray-900/50">
      <div className="text-xs text-gray-500 font-mono mb-2">ORACLE CHART — HISTORICAL</div>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1a1a2e" />
          <XAxis
            dataKey="time"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={formatDate}
            stroke="#333"
            tick={{ fill: '#555', fontSize: 10 }}
            scale="time"
          />
          <YAxis
            yAxisId="oracle"
            orientation="left"
            domain={['auto', 'auto']}
            stroke="#333"
            tick={{ fill: '#c084fc', fontSize: 10 }}
            tickFormatter={(v: number) => `${v.toFixed(1)}%`}
            width={55}
          />
          <YAxis
            yAxisId="prob"
            orientation="right"
            domain={[0, 100]}
            stroke="#333"
            tick={{ fill: '#555', fontSize: 10 }}
            tickFormatter={(v: number) => `${v}%`}
            width={45}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#0d0d1a',
              border: '1px solid #333',
              borderRadius: 4,
              fontSize: 11,
              fontFamily: 'monospace',
            }}
            labelFormatter={formatTime}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={((value: any, name?: string) => {
              const v = Number(value);
              if (name === 'oracle') return [`${v.toFixed(4)}%`, 'Oracle'];
              return [`${v.toFixed(1)}%`, name || ''];
            }) as never}
          />
          <Legend
            wrapperStyle={{ fontSize: 10, fontFamily: 'monospace' }}
          />
          <Area
            yAxisId="prob"
            dataKey="noChange"
            name="No Change"
            fill="#c084fc"
            fillOpacity={0.08}
            stroke="none"
            connectNulls
          />
          <Area
            yAxisId="prob"
            dataKey="cut25"
            name="Cut 25bp"
            fill="#60a5fa"
            fillOpacity={0.06}
            stroke="none"
            connectNulls
          />
          <Line
            yAxisId="oracle"
            dataKey="oracle"
            name="oracle"
            stroke="#c084fc"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
