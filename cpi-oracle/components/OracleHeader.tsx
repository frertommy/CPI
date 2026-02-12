'use client';

import { OracleV2Current } from '@/lib/types';

interface OracleHeaderProps {
  oracleValue: number | null;
  cpiYoy: number;
  impliedRateChange: number | null;
  status: 'loading' | 'live' | 'error' | 'stale';
  lastTick: string | null;
  tickCount: number;
  v2: OracleV2Current | null;
}

export default function OracleHeader({
  oracleValue,
  cpiYoy,
  impliedRateChange,
  status,
  lastTick,
  tickCount,
  v2,
}: OracleHeaderProps) {
  const statusColor =
    status === 'live' ? 'text-green-400' :
    status === 'error' ? 'text-red-400' :
    status === 'stale' ? 'text-yellow-400' :
    'text-gray-500';

  const statusLabel =
    status === 'live' ? 'LIVE' :
    status === 'error' ? 'ERROR' :
    status === 'stale' ? 'STALE' :
    'LOADING';

  const lastTickTime = lastTick
    ? new Date(lastTick).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
    : '--:--';

  const v2Value = v2?.oracle_v2 ?? null;
  const v1Value = v2?.oracle_v1 ?? oracleValue;
  const activeSources = v2?.sources_active?.length ?? 0;

  return (
    <div className="border-b border-gray-800 pb-4 mb-4">
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-sm font-bold tracking-widest text-gray-400">
              CPI PERP ORACLE
            </h1>
            <span className="text-xs text-purple-500 font-bold">V2</span>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-4xl font-bold text-purple-400 font-mono">
              {v2Value !== null ? `${v2Value.toFixed(4)}%` : (oracleValue !== null ? `${oracleValue.toFixed(4)}%` : '-.----%')}
            </span>
          </div>
          {v1Value !== null && v2Value !== null && (
            <div className="text-xs text-gray-600 mt-1 font-mono">
              V1 (legacy): {v1Value.toFixed(4)}%
            </div>
          )}
          <div className="text-xs text-gray-500 mt-1 font-mono">
            {activeSources > 0 ? `${activeSources} sources` : 'α=0.8'} · CPI={cpiYoy.toFixed(1)}% · Δrate={impliedRateChange !== null ? `${impliedRateChange.toFixed(1)}bp` : '--'}
          </div>
        </div>
        <div className="text-right text-xs font-mono">
          <div className="flex items-center gap-2 justify-end">
            <span className={`${statusColor} font-bold`}>● {statusLabel}</span>
            <span className="text-gray-600">4-SRC BLEND</span>
          </div>
          <div className="text-gray-500 mt-1">Last tick: {lastTickTime}</div>
          <div className="text-gray-600">Ticks in DB: {tickCount.toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}
