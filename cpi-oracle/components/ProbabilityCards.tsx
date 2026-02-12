'use client';

interface ProbabilityCardsProps {
  probNoChange: number | null;
  probCut25: number | null;
  probCut50: number | null;
  probHike25: number | null;
}

function ProbCard({ label, value, color }: { label: string; value: number | null; color: string }) {
  const pct = value !== null ? (value * 100).toFixed(1) : '-.-';
  return (
    <div className="border border-gray-800 rounded px-3 py-2 bg-gray-900/50 text-center flex-1 min-w-0">
      <div className="text-xs text-gray-500 font-mono truncate">{label}</div>
      <div className={`text-lg font-bold font-mono ${color}`}>{pct}%</div>
    </div>
  );
}

export default function ProbabilityCards({
  probNoChange,
  probCut25,
  probCut50,
  probHike25,
}: ProbabilityCardsProps) {
  return (
    <div className="grid grid-cols-4 gap-2 mb-4">
      <ProbCard label="No Chg" value={probNoChange} color="text-purple-300" />
      <ProbCard label="25bp Cut" value={probCut25} color="text-blue-300" />
      <ProbCard label="50bp Cut" value={probCut50} color="text-cyan-300" />
      <ProbCard label="25bp Hik" value={probHike25} color="text-orange-300" />
    </div>
  );
}
