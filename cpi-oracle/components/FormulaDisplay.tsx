'use client';

interface FormulaDisplayProps {
  oracleValue: number | null;
  cpiYoy: number;
  impliedInflation: number | null;
}

export default function FormulaDisplay({
  oracleValue,
  cpiYoy,
  impliedInflation,
}: FormulaDisplayProps) {
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
