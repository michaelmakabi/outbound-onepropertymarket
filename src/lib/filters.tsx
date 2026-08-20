// Global date-range filter, synced across every page (ported from FilterContext).
// Supports quick presets (7d/30d/90d/all) AND an explicit custom start/end range.
// The choice is persisted to localStorage so it stays put as you navigate between pages
// or drill into a call and come back.
import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';

export type RangePreset = '7d' | '30d' | '90d' | 'all' | 'custom';

const PRESET_DAYS: Record<Exclude<RangePreset, 'custom'>, number | null> = { '7d': 7, '30d': 30, '90d': 90, all: null };
const PRESET_LABEL: Record<Exclude<RangePreset, 'custom'>, string> = { '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days', all: 'All time' };

const LS_PRESET = 'opm_filter_preset';
const LS_START = 'opm_filter_custom_start';
const LS_END = 'opm_filter_custom_end';

const readLS = (k: string) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const writeLS = (k: string, v: string) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* ignore */ } };

// A YYYY-MM-DD string → epoch ms at local start (00:00) or end (23:59:59.999) of that day.
function dayMs(ymd: string, endOfDay: boolean): number | null {
  if (!ymd) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return null;
  return endOfDay ? new Date(y, m - 1, d, 23, 59, 59, 999).getTime() : new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

type FilterCtx = {
  preset: RangePreset;
  setPreset: (p: RangePreset) => void;
  customStart: string;            // YYYY-MM-DD
  customEnd: string;              // YYYY-MM-DD
  setCustom: (start: string, end: string) => void;
  startMs: number | null;
  endMs: number | null;
  rangeLabel: string;
};

const Ctx = createContext<FilterCtx>({} as FilterCtx);
export const useFilters = () => useContext(Ctx);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [preset, setPresetState] = useState<RangePreset>(() => {
    const saved = readLS(LS_PRESET) as RangePreset;
    return (['7d', '30d', '90d', 'all', 'custom'] as string[]).includes(saved) ? saved : '30d';
  });
  const [customStart, setCustomStart] = useState<string>(() => readLS(LS_START));
  const [customEnd, setCustomEnd] = useState<string>(() => readLS(LS_END));

  const setPreset = (p: RangePreset) => { setPresetState(p); writeLS(LS_PRESET, p); };
  const setCustom = (start: string, end: string) => {
    setCustomStart(start); setCustomEnd(end);
    writeLS(LS_START, start); writeLS(LS_END, end);
    setPresetState('custom'); writeLS(LS_PRESET, 'custom');
  };

  useEffect(() => { writeLS(LS_PRESET, preset); }, [preset]);

  const value = useMemo<FilterCtx>(() => {
    if (preset === 'custom') {
      const startMs = dayMs(customStart, false);
      const endMs = dayMs(customEnd, true);
      const fmt = (ms: number | null) => (ms == null ? '…' : new Date(ms).toLocaleDateString());
      return { preset, setPreset, customStart, customEnd, setCustom, startMs, endMs, rangeLabel: `${fmt(startMs)} – ${fmt(endMs)}` };
    }
    const days = PRESET_DAYS[preset];
    const startMs = days == null ? null : Date.now() - days * 86400000;
    return { preset, setPreset, customStart, customEnd, setCustom, startMs, endMs: null, rangeLabel: PRESET_LABEL[preset] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, customStart, customEnd]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
