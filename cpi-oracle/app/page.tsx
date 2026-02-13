'use client';

import { useOraclePolling } from '@/hooks/useOraclePolling';
import OracleHeader from '@/components/OracleHeader';
import FormulaDisplay from '@/components/FormulaDisplay';
import DataSourceCards from '@/components/DataSourceCards';
import KalshiBrackets from '@/components/KalshiBrackets';
import ProbabilityCards from '@/components/ProbabilityCards';
import OracleChart from '@/components/OracleChart';
import LiveFeedTable from '@/components/LiveFeedTable';
import MarketContext from '@/components/MarketContext';
import StatusBar from '@/components/StatusBar';

export default function Home() {
  const state = useOraclePolling();

  const oracleValue = state.current
    ? parseFloat(String(state.current.oracle_value))
    : null;

  const impliedRateChange = state.current
    ? parseFloat(String(state.current.implied_rate_change))
    : null;

  const impliedInflation = state.current
    ? parseFloat(String(state.current.implied_inflation))
    : null;

  const cpiYoy = state.cpi?.yoy_pct ?? 2.7;

  const probNoChange = state.current
    ? parseFloat(String(state.current.prob_no_change))
    : null;

  const probCut25 = state.current
    ? parseFloat(String(state.current.prob_cut_25))
    : null;

  const probCut50 = state.current
    ? parseFloat(String(state.current.prob_cut_50))
    : null;

  const probHike25 = state.current
    ? parseFloat(String(state.current.prob_hike_25))
    : null;

  return (
    <div className="min-h-screen bg-[#0a0a0f] p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <OracleHeader
          oracleValue={oracleValue}
          cpiYoy={cpiYoy}
          impliedRateChange={impliedRateChange}
          status={state.status}
          lastTick={state.lastTick}
          tickCount={state.tickCount}
          v2={state.v2}
        />

        <FormulaDisplay
          oracleValue={oracleValue}
          cpiYoy={cpiYoy}
          impliedInflation={impliedInflation}
          v2={state.v2}
        />

        <DataSourceCards
          v2={state.v2}
          cpiPrintDate={state.cpi?.print_date || null}
          kalshiBrackets={state.kalshiBrackets}
          fredData={state.fredData}
          probNoChange={probNoChange}
        />

        <KalshiBrackets brackets={state.kalshiBrackets} />

        <ProbabilityCards
          probNoChange={probNoChange}
          probCut25={probCut25}
          probCut50={probCut50}
          probHike25={probHike25}
        />

        <OracleChart
          history={state.history}
          v2History={state.v2History}
        />

        <LiveFeedTable feed={state.feed} status={state.status} />

        <MarketContext fredData={state.fredData} />

        <StatusBar
          tickCount={state.tickCount}
          pollInterval={60000}
          cpiPrintDate={state.cpi?.print_date || null}
          error={state.error}
        />
      </div>
    </div>
  );
}
