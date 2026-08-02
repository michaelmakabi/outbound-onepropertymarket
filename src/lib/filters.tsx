// Global date-range filter, synced across every page (ported from FilterContext).
import { createContext, useContext, useMemo, useState, ReactNode } from 'react';

export type RangePreset = '7d' | '30d' | '90d' | 'all';

const PRESET_DAYS: Record<RangePreset, number | null> = { '7d': 7, '30d': 30, '90d': 90, all: null };
const PRESET_LABEL: Record<RangePreset, string> = { '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days', all: 'All time' };

type FilterCtx = {
  preset: RangePreset;
  setPreset: (p: RangePreset) => void;
  startMs: number | null;
  endMs: number | null;
  rangeLabel: string;
};

const Ctx = createContext<FilterCtx>({} as FilterCtx);
export const useFilters = () => useContext(Ctx);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [preset, setPreset] = useState<RangePreset>('30d');

  const value = useMemo<FilterCtx>(() => {
    const days = PRESET_DAYS[preset];
    const startMs = days == null ? null : Date.now() - days * 86400000;
    return { preset, setPreset, startMs, endMs: null, rangeLabel: PRESET_LABEL[preset] };
  }, [preset]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
