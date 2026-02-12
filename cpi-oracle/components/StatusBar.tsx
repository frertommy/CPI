'use client';

interface StatusBarProps {
  tickCount: number;
  pollInterval: number;
  cpiPrintDate: string | null;
  error: string | null;
}

export default function StatusBar({
  tickCount,
  pollInterval,
  cpiPrintDate,
  error,
}: StatusBarProps) {
  return (
    <div className="border-t border-gray-800 pt-3 mt-2">
      {error && (
        <div className="text-xs text-red-400 font-mono mb-2 truncate">
          ERR: {error}
        </div>
      )}
      <div className="flex justify-between text-xs text-gray-600 font-mono">
        <span>
          DB: {tickCount.toLocaleString()} ticks · Poll: {pollInterval / 1000}s
        </span>
        <span>
          {cpiPrintDate ? `Last CPI: ${cpiPrintDate}` : 'CPI: loading...'}
        </span>
      </div>
    </div>
  );
}
