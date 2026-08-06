// Official 1PM AI / 1PropertyMarket brand logo. Served (and cached a year, immutable) by the
// `brand-logo` edge function, which pulls the mark from the live site (1pm.ai) and downscales it
// to a light 256px PNG — so we reference one small fast URL everywhere instead of the 1.49MB
// original or a heavy inline blob. Used across the app: nav, sidebar, auth pages, footer.
const LOGO_URL =
  (import.meta as any).env?.VITE_LOGO_URL ||
  'https://sehrlbmatklgghrvyxes.supabase.co/functions/v1/brand-logo';

export const LOGO_MARK = LOGO_URL;
// The wordmark text ("1PropertyMarket Outbound") is rendered alongside the mark where needed.
export const LOGO_FULL = LOGO_URL;
