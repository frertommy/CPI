'use client';

import { FredLatestResponse } from '@/lib/types';

interface MarketContextProps {
  fredData: FredLatestResponse | null;
}

function ContextRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs font-mono py-0.5">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-300">{value}</span>
    </div>
  );
}

export default function MarketContext({ fredData }: MarketContextProps) {
  if (!fredData) return null;

  const hasAny = fredData.T5YIE || fredData.T10YIE || fredData.T5YIFR || fredData.EXPINF1YR || fredData.EXPINF10YR;
  if (!hasAny) return null;

  return (
    <div className="border border-gray-800 rounded px-4 py-3 mb-4 bg-gray-900/50">
      <div className="text-xs text-gray-500 font-mono mb-2">MARKET CONTEXT — FRED</div>
      {fredData.T5YIE && (
        <ContextRow label="5Y Breakeven" value={`${fredData.T5YIE.value.toFixed(2)}%`} />
      )}
      {fredData.T10YIE && (
        <ContextRow label="10Y Breakeven" value={`${fredData.T10YIE.value.toFixed(2)}%`} />
      )}
      {fredData.T5YIFR && (
        <ContextRow label="5Y5Y Forward" value={`${fredData.T5YIFR.value.toFixed(2)}%`} />
      )}
      {fredData.EXPINF1YR && (
        <ContextRow label="Cleveland Fed 1Y" value={`${fredData.EXPINF1YR.value.toFixed(2)}%`} />
      )}
      {fredData.EXPINF10YR && (
        <ContextRow label="Cleveland Fed 10Y" value={`${fredData.EXPINF10YR.value.toFixed(2)}%`} />
      )}
    </div>
  );
}
