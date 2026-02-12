'use client';

import { OracleV2Current, KalshiBracket, FredLatestResponse } from '@/lib/types';

interface DataSourceCardsProps {
  v2: OracleV2Current | null;
  cpiPrintDate: string | null;
  kalshiBrackets: KalshiBracket[];
  fredData: FredLatestResponse | null;
  probNoChange: number | null;
}

function SourceCard({
  label,
  value,
  weight,
  detail1,
  detail2,
  color,
  borderColor,
}: {
  label: string;
  value: string;
  weight: string;
  detail1: string;
  detail2: string;
  color: string;
  borderColor: string;
}) {
  return (
    <div className={`border rounded px-3 py-2 bg-gray-900/50 font-mono min-w-0 ${borderColor}`}>
      <div className="text-xs text-gray-500 truncate">{label}</div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500">w: {weight}</div>
      <div className="text-xs text-gray-600 truncate">{detail1}</div>
      <div className={`text-xs ${color} truncate`}>{detail2}</div>
    </div>
  );
}

export default function DataSourceCards({
  v2,
  cpiPrintDate,
  kalshiBrackets,
  fredData,
  probNoChange,
}: DataSourceCardsProps) {
  if (!v2) return null;

  const noChgPct = probNoChange !== null ? `${(probNoChange * 100).toFixed(0)}% no chg` : '--';
  const numBrackets = kalshiBrackets.length;
  const tipsDate = fredData?.T5YIE?.obs_date
    ? new Date(fredData.T5YIE.obs_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '--';

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
      <SourceCard
        label="BLS CPI"
        value={`${v2.cpi_yoy.toFixed(3)}%`}
        weight={v2.weights.cpi.toFixed(2)}
        detail1={cpiPrintDate || '--'}
        detail2="Monthly"
        color="text-yellow-400"
        borderColor="border-yellow-400/30"
      />
      <SourceCard
        label="KALSHI"
        value={v2.kalshi_implied_cpi !== null ? `${v2.kalshi_implied_cpi.toFixed(3)}%` : '--'}
        weight={v2.weights.kalshi.toFixed(2)}
        detail1={numBrackets > 0 ? `${numBrackets} brackets` : 'No data'}
        detail2="Live"
        color="text-green-400"
        borderColor="border-green-400/30"
      />
      <SourceCard
        label="TIPS 5Y BE"
        value={v2.tips_breakeven !== null ? `${v2.tips_breakeven.toFixed(3)}%` : '--'}
        weight={v2.weights.tips.toFixed(2)}
        detail1={tipsDate}
        detail2="Daily"
        color="text-blue-400"
        borderColor="border-blue-400/30"
      />
      <SourceCard
        label="POLYMARKET"
        value={`${v2.polymarket_impl_infl.toFixed(3)}%`}
        weight={v2.weights.polymarket.toFixed(2)}
        detail1={noChgPct}
        detail2="Live"
        color="text-purple-400"
        borderColor="border-purple-400/30"
      />
    </div>
  );
}
