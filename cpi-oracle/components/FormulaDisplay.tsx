'use client';

import { OracleV2Current } from '@/lib/types';

interface FormulaDisplayProps {
  oracleValue: number | null;
  cpiYoy: number;
  impliedInflation: number | null;
  v2: OracleV2Current | null;
}

export default function FormulaDisplay({
  oracleValue,
  cpiYoy,
  impliedInflation,
  v2,
}: FormulaDisplayProps) {
  if (v2) {
    const w = v2.weights;
    return (
      <div className="border border-gray-800 rounded px-4 py-3 mb-4 bg-gray-900/50">
        <div className="text-xs text-gray-500 font-mono mb-1">
          V2 FORMULA: oracle = {w.cpi.toFixed(2)}×CPI + {w.kalshi.toFixed(2)}×Kalshi + {w.tips.toFixed(2)}×TIPS + {w.polymarket.toFixed(2)}×Poly
        </div>
        <div className="text-sm text-gray-300 font-mono flex flex-wrap gap-x-1">
          <span className="text-purple-400 font-bold">
            {v2.oracle_v2.toFixed(4)}
          </span>
          <span>=</span>
          <span>{w.cpi.toFixed(2)}×</span>
          <span className="text-yellow-400">{v2.cpi_yoy.toFixed(2)}</span>
          <span>+</span>
          <span>{w.kalshi.toFixed(2)}×</span>
          <span className="text-green-400">{v2.kalshi_implied_cpi !== null ? v2.kalshi_implied_cpi.toFixed(2) : '--'}</span>
          <span>+</span>
          <span>{w.tips.toFixed(2)}×</span>
          <span className="text-blue-400">{v2.tips_breakeven !== null ? v2.tips_breakeven.toFixed(2) : '--'}</span>
          <span>+</span>
          <span>{w.polymarket.toFixed(2)}×</span>
          <span className="text-purple-300">{v2.polymarket_impl_infl.toFixed(2)}</span>
        </div>
        <div className="text-xs text-gray-600 font-mono mt-1">
          V1: {v2.oracle_v1.toFixed(4)} = 0.80×{cpiYoy.toFixed(1)} + 0.20×{impliedInflation !== null ? impliedInflation.toFixed(4) : '--'}
        </div>
      </div>
    );
  }

  return (
    <div className="border border-gray-800 rounded px-4 py-3 mb-4 bg-gray-900/50">
      <div className="text-xs text-gray-500 font-mono mb-1">
        FORMULA: oracle = 0.8 × CPI_YoY + 0.2 × impl_infl
      </div>
      <div className="text-sm text-gray-300 font-mono">
        NOW:{' '}
        <span className="text-purple-400">
          {oracleValue !== null ? oracleValue.toFixed(4) : '-.----'}
        </span>
        {' = 0.8 × '}
        <span className="text-blue-400">{cpiYoy.toFixed(1)}</span>
        {' + 0.2 × '}
        <span className="text-cyan-400">
          {impliedInflation !== null ? impliedInflation.toFixed(4) : '-.----'}
        </span>
      </div>
    </div>
  );
}
