// US/Canada NANP area-code → time-zone resolver.
// Powers the Phone Numbers "Time zone" column and (mirrored in the opm-import edge function)
// the per-lead timezone stamped on every import, so the dialer knows local calling hours.
// Area codes that span two zones are assigned to their dominant/most-populous zone.

export type TzZone = 'ET' | 'CT' | 'MT' | 'PT' | 'AKT' | 'HT';

export const TZ_LABEL: Record<TzZone, string> = {
  ET: 'Eastern', CT: 'Central', MT: 'Mountain', PT: 'Pacific', AKT: 'Alaska', HT: 'Hawaii',
};

// Canonical IANA zone stored per lead. Arizona (no DST) is special-cased to Phoenix below.
export const TZ_IANA: Record<TzZone, string> = {
  ET: 'America/New_York', CT: 'America/Chicago', MT: 'America/Denver',
  PT: 'America/Los_Angeles', AKT: 'America/Anchorage', HT: 'Pacific/Honolulu',
};

// Arizona area codes observe MST year-round (no daylight saving).
const AZ_CODES = new Set(['480', '520', '602', '623', '928']);

const ZONE_CODES: Record<TzZone, string[]> = {
  PT: [
    // California
    '209', '213', '279', '310', '323', '341', '350', '357', '369', '408', '415', '424', '442', '510', '530', '559', '562', '619', '626', '628', '650', '657', '661', '669', '707', '714', '738', '747', '760', '764', '805', '818', '820', '831', '840', '858', '909', '916', '925', '949', '951',
    // Washington
    '206', '253', '360', '425', '509', '564',
    // Oregon
    '458', '503', '541', '971',
    // Nevada
    '702', '725', '775',
  ],
  MT: [
    // Arizona
    '480', '520', '602', '623', '928',
    // Colorado
    '303', '719', '720', '970', '983',
    // Idaho
    '208', '986',
    // Montana
    '406',
    // New Mexico
    '505', '575',
    // Utah
    '385', '435', '801',
    // Wyoming
    '307',
    // West Texas (El Paso)
    '915',
  ],
  CT: [
    // Texas (most)
    '210', '214', '254', '281', '325', '346', '361', '409', '430', '432', '469', '512', '682', '713', '726', '737', '806', '817', '830', '832', '903', '936', '940', '945', '956', '972', '979',
    // Illinois
    '217', '224', '309', '312', '331', '447', '464', '618', '630', '708', '730', '773', '779', '815', '847', '872',
    // Alabama
    '205', '251', '256', '334', '938',
    // Arkansas
    '479', '501', '870',
    // Iowa
    '319', '515', '563', '641', '712',
    // Kansas
    '316', '620', '785', '913',
    // Louisiana
    '225', '318', '337', '504', '985',
    // Minnesota
    '218', '320', '507', '612', '651', '763', '952',
    // Missouri
    '314', '417', '573', '636', '660', '816',
    // Mississippi
    '228', '601', '662', '769',
    // North Dakota
    '701',
    // Nebraska
    '308', '402', '531',
    // Oklahoma
    '405', '539', '572', '580', '918',
    // South Dakota
    '605',
    // Tennessee (central/west)
    '615', '629', '731', '901', '931',
    // Wisconsin
    '262', '274', '414', '534', '608', '715', '920',
    // Western Kentucky
    '270', '364',
    // Florida panhandle (Pensacola / Panama City)
    '850',
  ],
  ET: [
    // New York
    '212', '315', '332', '347', '363', '516', '518', '585', '607', '631', '646', '680', '716', '718', '838', '845', '914', '917', '929', '934',
    // New Jersey
    '201', '551', '609', '640', '732', '848', '856', '862', '908', '973',
    // Pennsylvania
    '215', '223', '267', '272', '412', '445', '484', '570', '610', '717', '724', '814', '835', '878',
    // Connecticut
    '203', '475', '860', '959',
    // Maine
    '207',
    // Massachusetts
    '339', '351', '413', '508', '617', '774', '781', '857', '978',
    // New Hampshire
    '603',
    // Rhode Island
    '401',
    // Vermont
    '802',
    // Virginia
    '276', '434', '540', '571', '703', '757', '804',
    // North Carolina
    '252', '336', '704', '743', '828', '910', '919', '980', '984',
    // South Carolina
    '803', '839', '843', '854', '864',
    // Georgia
    '229', '404', '470', '478', '678', '706', '762', '770', '912',
    // Florida (most)
    '239', '305', '321', '352', '386', '407', '561', '689', '727', '754', '772', '786', '813', '904', '941', '954',
    // West Virginia
    '304', '681',
    // Maryland
    '240', '301', '410', '443', '667',
    // Delaware
    '302',
    // DC
    '202',
    // Ohio
    '216', '220', '234', '283', '326', '330', '380', '419', '440', '513', '567', '614', '740', '937',
    // Michigan
    '231', '248', '269', '313', '517', '586', '616', '679', '734', '810', '906', '947', '989',
    // Indiana (most)
    '219', '260', '317', '463', '574', '765', '812', '930',
    // Kentucky (central/east)
    '502', '606', '859',
    // Tennessee (east)
    '423', '865',
  ],
  AKT: ['907'],
  HT: ['808'],
};

// area code → zone lookup (built once).
const CODE_TO_ZONE: Record<string, TzZone> = (() => {
  const m: Record<string, TzZone> = {};
  (Object.keys(ZONE_CODES) as TzZone[]).forEach((z) => { for (const ac of ZONE_CODES[z]) m[ac] = z; });
  return m;
})();

export type TzInfo = { zone: TzZone; abbr: TzZone; label: string; iana: string };

// Resolve a 3-digit area code to its time zone, or null when unknown.
export function areaCodeTz(areaCode: string | number | null | undefined): TzInfo | null {
  const ac = String(areaCode ?? '').replace(/\D/g, '').slice(-10);
  const code = ac.length >= 3 ? ac.slice(0, 3) : ac;
  if (code.length !== 3) return null;
  const zone = CODE_TO_ZONE[code];
  if (!zone) return null;
  const iana = AZ_CODES.has(code) ? 'America/Phoenix' : TZ_IANA[zone];
  return { zone, abbr: zone, label: TZ_LABEL[zone], iana };
}

// Resolve a full phone number (any format) to its time zone.
export function phoneTz(phone: string | null | undefined): TzInfo | null {
  const d = String(phone ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  return d.length >= 3 ? areaCodeTz(d.slice(0, 3)) : null;
}
