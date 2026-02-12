'use client';

import { OracleRow } from '@/lib/types';

interface LiveFeedTableProps {
  feed: OracleRow[];
  status: 'loading' | 'live' | 'error' | 'stale';
}

export default function LiveFeedTable({ feed, status }: LiveFeedTableProps) {
  const statusDot =
    status === 'live' ? 'text-green-400' :
    status === 'error' ? 'text-red-400' :
    status === 'stale' ? 'text-yellow-400' :
    'text-gray-500';

  return (
    <div className="border border-gray-800 rounded mb-4 bg-gray-900/50">
      <div className="px-4 py-2 border-b border-gray-800 flex justify-between items-center">
        <span className="text-xs text-gray-500 font-mono font-bold">LIVE FEED — LAST 10 TICKS (from DB)</span>
        <span className={`text-xs font-mono ${statusDot}`}>● LIVE</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="text-gray-600 border-b border-gray-800">
              <th className="text-left px-3 py-2">Time</th>
              <th className="text-right px-3 py-2">Oracle</th>
              <th className="text-right px-3 py-2">Δrate</th>
              <th className="text-right px-3 py-2">NoChg</th>
              <th className="text-right px-3 py-2">Cut25</th>
              <th className="text-right px-3 py-2">Cut50</th>
              <th className="text-right px-3 py-2">Hik</th>
            </tr>
          </thead>
          <tbody>
            {feed.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-4 text-gray-600">
                  No ticks yet...
                </td>
              </tr>
            ) : (
              feed.map((row, i) => {
                const time = row.computed_at
                  ? new Date(row.computed_at).toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      hour12: false,
                    })
                  : '--:--:--';

                return (
                  <tr
                    key={row.id || i}
                    className={`border-b border-gray-800/50 ${i === 0 ? 'text-white' : 'text-gray-400'}`}
                  >
                    <td className="px-3 py-1.5">{time}</td>
                    <td className="px-3 py-1.5 text-right text-purple-400">
                      {parseFloat(String(row.oracle_value)).toFixed(4)}%
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {parseFloat(String(row.implied_rate_change)).toFixed(1)}bp
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {(parseFloat(String(row.prob_no_change)) * 100).toFixed(1)}%
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {(parseFloat(String(row.prob_cut_25)) * 100).toFixed(1)}%
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {(parseFloat(String(row.prob_cut_50)) * 100).toFixed(1)}%
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {(parseFloat(String(row.prob_hike_25)) * 100).toFixed(1)}%
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
