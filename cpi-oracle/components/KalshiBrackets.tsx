'use client';

import { KalshiBracket } from '@/lib/types';

interface KalshiBracketsProps {
  brackets: KalshiBracket[];
}

export default function KalshiBrackets({ brackets }: KalshiBracketsProps) {
  if (brackets.length === 0) return null;

  const maxProb = Math.max(...brackets.map((b) => b.probability));

  return (
    <div className="border border-gray-800 rounded px-4 py-3 mb-4 bg-gray-900/50">
      <div className="text-xs text-gray-500 font-mono mb-2">KALSHI CPI BRACKETS</div>
      <div className="space-y-1">
        {brackets.map((b) => {
          const pct = (b.probability * 100).toFixed(0);
          const barWidth = maxProb > 0 ? (b.probability / maxProb) * 100 : 0;
          return (
            <div key={b.ticker} className="flex items-center gap-2 font-mono text-xs">
              <span className="text-gray-400 w-12 text-right shrink-0">≥{b.threshold}%</span>
              <div className="flex-1 h-4 bg-gray-800 rounded overflow-hidden">
                <div
                  className="h-full bg-green-500/40 rounded"
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <span className="text-green-400 w-10 text-right shrink-0">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
