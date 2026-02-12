'use client';

interface OracleHeaderProps {
  oracleValue: number | null;
  cpiYoy: number;
  impliedRateChange: number | null;
  status: 'loading' | 'live' | 'error' | 'stale';
  lastTick: string | null;
  tickCount: number;
}

export default function OracleHeader({
  oracleValue,
  cpiYoy,
  impliedRateChange,
  status,
  lastTick,
  tickCount,
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

  return (
    <div className="border-b border-gray-800 pb-4 mb-4">
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-sm font-bold tracking-widest text-gray-400">
              CPI PERP ORACLE
            </h1>
            <span className="text-xs text-gray-600">VARIANT B</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold text-purple-400 font-mono">
              {oracleValue !== null ? `${oracleValue.toFixed(4)}%` : '-.----%'}
            </span>
          </div>
          <div className="text-xs text-gray-500 mt-1 font-mono">
            α=0.8 · CPI={cpiYoy.toFixed(1)}% · Δrate={impliedRateChange !== null ? `${impliedRateChange.toFixed(1)}bp` : '--'}
          </div>
        </div>
        <div className="text-right text-xs font-mono">
          <div className="flex items-center gap-2 justify-end">
            <span className={`${statusColor} font-bold`}>● {statusLabel}</span>
            <span className="text-gray-600">SRC: POLYMARKET</span>
          </div>
          <div className="text-gray-500 mt-1">Last tick: {lastTickTime}</div>
          <div className="text-gray-600">Ticks in DB: {tickCount.toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}
