'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { DashboardState, OracleRow, HistoryPoint, CpiResponse, OracleV2Current, FredLatestResponse } from '@/lib/types';

const POLL_INTERVAL = 60000;
const MAX_BACKOFF = 60000;

export function useOraclePolling() {
  const [state, setState] = useState<DashboardState>({
    current: null,
    feed: [],
    history: [],
    cpi: null,
    status: 'loading',
    error: null,
    tickCount: 0,
    lastTick: null,
    v2: null,
    kalshiBrackets: [],
    fredData: null,
  });

  const backoffRef = useRef(2000);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchSetup = useCallback(async () => {
    try {
      await fetch('/api/setup');
    } catch (e) {
      console.error('Setup call failed:', e);
    }
  }, []);

  const fetchCpi = useCallback(async () => {
    try {
      const res = await fetch('/api/cpi');
      if (res.ok) {
        const data: CpiResponse = await res.json();
        setState((prev) => ({ ...prev, cpi: data }));
      }
    } catch (e) {
      console.error('CPI fetch failed:', e);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/polymarket/history');
      if (res.ok) {
        const data = await res.json();
        setState((prev) => ({ ...prev, history: data.history || [] }));
      }
    } catch (e) {
      console.error('History fetch failed:', e);
    }
  }, []);

  const fetchFred = useCallback(async () => {
    try {
      const res = await fetch('/api/fred/latest');
      if (res.ok) {
        const data: FredLatestResponse = await res.json();
        setState((prev) => ({ ...prev, fredData: data }));
      }
    } catch (e) {
      console.error('FRED fetch failed:', e);
    }
  }, []);

  const fetchKalshi = useCallback(async () => {
    try {
      const res = await fetch('/api/kalshi/live');
      if (res.ok) {
        const data = await res.json();
        setState((prev) => ({ ...prev, kalshiBrackets: data.brackets || [] }));
      }
    } catch (e) {
      console.error('Kalshi fetch failed:', e);
    }
  }, []);

  const fetchLive = useCallback(async () => {
    try {
      const res = await fetch('/api/polymarket/live');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      setState((prev) => {
        const newCurrent: OracleRow = data.current;
        const newFeed: OracleRow[] = data.feed || [];
        const tickCount = data.tickCount || newFeed.length;

        const v2: OracleV2Current | null = data.current_v2 || null;

        let newHistory = [...prev.history];
        if (newCurrent && newCurrent.computed_at) {
          const newPoint: HistoryPoint = {
            timestamp: newCurrent.computed_at,
            prob_no_change: parseFloat(String(newCurrent.prob_no_change)),
            prob_cut_25: parseFloat(String(newCurrent.prob_cut_25)),
            prob_cut_50: parseFloat(String(newCurrent.prob_cut_50)),
            prob_hike_25: parseFloat(String(newCurrent.prob_hike_25)),
            oracle_value: parseFloat(String(newCurrent.oracle_value)),
            source: 'live',
          };
          const lastTs = newHistory.length > 0 ? newHistory[newHistory.length - 1].timestamp : null;
          if (lastTs !== newPoint.timestamp) {
            newHistory = [...newHistory, newPoint];
          }
        }

        return {
          ...prev,
          current: newCurrent,
          feed: newFeed,
          history: newHistory,
          status: data.stale ? 'stale' : 'live',
          error: data.error || null,
          tickCount,
          lastTick: newCurrent?.computed_at || prev.lastTick,
          v2,
        };
      });

      backoffRef.current = 2000;
    } catch (e) {
      console.error('Live fetch error:', e);
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: String(e),
      }));

      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      await fetchSetup();
      await Promise.all([fetchCpi(), fetchHistory(), fetchFred(), fetchKalshi()]);
      await fetchLive();
    };

    init();

    intervalRef.current = setInterval(() => {
      fetchLive();
    }, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchSetup, fetchCpi, fetchHistory, fetchFred, fetchKalshi, fetchLive]);

  return state;
}
