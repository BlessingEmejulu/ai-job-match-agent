/**
 * Country, city and region dictionary used to read job location text. Coverage is deliberately
 * explicit: every African country plus the countries that appear on the verified employer boards.
 * Ambiguous two-letter tokens (CA, IN, ...) are not treated as countries.
 */

export type Region =
    | 'Africa'
    | 'Sub-Saharan Africa'
    | 'MENA'
    | 'Middle East'
    | 'Europe'
    | 'EMEA'
    | 'Americas'
    | 'North America'
    | 'LATAM'
    | 'APAC'
    | 'CIS';

interface CountryDef {
    code: string;
    name: string;
    aliases?: string[];
    /** Case-sensitive aliases (e.g. "US", "UK"). */
    caseSensitiveAliases?: string[];
    regions: Region[];
}

const AF_SSA: Region[] = ['Africa', 'Sub-Saharan Africa', 'EMEA'];
const AF_NORTH: Region[] = ['Africa', 'MENA', 'EMEA'];
const EU: Region[] = ['Europe', 'EMEA'];
const ME: Region[] = ['Middle East', 'MENA', 'EMEA'];
const NA: Region[] = ['North America', 'Americas'];
const LA: Region[] = ['LATAM', 'Americas'];
const AP: Region[] = ['APAC'];

export const COUNTRIES: CountryDef[] = [
    // Africa
    { code: 'DZ', name: 'Algeria', regions: AF_NORTH },
    { code: 'AO', name: 'Angola', regions: AF_SSA },
    { code: 'BJ', name: 'Benin', regions: AF_SSA },
    { code: 'BW', name: 'Botswana', regions: AF_SSA },
    { code: 'BF', name: 'Burkina Faso', regions: AF_SSA },
    { code: 'BI', name: 'Burundi', regions: AF_SSA },
    { code: 'CV', name: 'Cabo Verde', aliases: ['Cape Verde'], regions: AF_SSA },
    { code: 'CM', name: 'Cameroon', regions: AF_SSA },
    { code: 'CF', name: 'Central African Republic', regions: AF_SSA },
    { code: 'TD', name: 'Chad', regions: AF_SSA },
    { code: 'KM', name: 'Comoros', regions: AF_SSA },
    { code: 'CG', name: 'Republic of the Congo', aliases: ['Congo-Brazzaville'], regions: AF_SSA },
    { code: 'CD', name: 'Democratic Republic of the Congo', aliases: ['DR Congo', 'DRC', 'Congo-Kinshasa'], regions: AF_SSA },
    { code: 'CI', name: "Côte d'Ivoire", aliases: ["Cote d'Ivoire", 'Ivory Coast', 'Cote dIvoire'], regions: AF_SSA },
    { code: 'DJ', name: 'Djibouti', regions: AF_SSA },
    { code: 'EG', name: 'Egypt', regions: AF_NORTH },
    { code: 'GQ', name: 'Equatorial Guinea', regions: AF_SSA },
    { code: 'ER', name: 'Eritrea', regions: AF_SSA },
    { code: 'SZ', name: 'Eswatini', aliases: ['Swaziland'], regions: AF_SSA },
    { code: 'ET', name: 'Ethiopia', regions: AF_SSA },
    { code: 'GA', name: 'Gabon', regions: AF_SSA },
    { code: 'GM', name: 'Gambia', aliases: ['The Gambia'], regions: AF_SSA },
    { code: 'GH', name: 'Ghana', regions: AF_SSA },
    { code: 'GN', name: 'Guinea', regions: AF_SSA },
    { code: 'GW', name: 'Guinea-Bissau', regions: AF_SSA },
    { code: 'KE', name: 'Kenya', regions: AF_SSA },
    { code: 'LS', name: 'Lesotho', regions: AF_SSA },
    { code: 'LR', name: 'Liberia', regions: AF_SSA },
    { code: 'LY', name: 'Libya', regions: AF_NORTH },
    { code: 'MG', name: 'Madagascar', regions: AF_SSA },
    { code: 'MW', name: 'Malawi', regions: AF_SSA },
    { code: 'ML', name: 'Mali', regions: AF_SSA },
    { code: 'MR', name: 'Mauritania', regions: AF_SSA },
    { code: 'MU', name: 'Mauritius', regions: AF_SSA },
    { code: 'MA', name: 'Morocco', regions: AF_NORTH },
    { code: 'MZ', name: 'Mozambique', regions: AF_SSA },
    { code: 'NA', name: 'Namibia', regions: AF_SSA },
    { code: 'NE', name: 'Niger', regions: AF_SSA },
    { code: 'NG', name: 'Nigeria', regions: AF_SSA },
    { code: 'RW', name: 'Rwanda', regions: AF_SSA },
    { code: 'ST', name: 'São Tomé and Príncipe', aliases: ['Sao Tome and Principe'], regions: AF_SSA },
    { code: 'SN', name: 'Senegal', regions: AF_SSA },
    { code: 'SC', name: 'Seychelles', regions: AF_SSA },
    { code: 'SL', name: 'Sierra Leone', regions: AF_SSA },
    { code: 'SO', name: 'Somalia', regions: AF_SSA },
    { code: 'ZA', name: 'South Africa', caseSensitiveAliases: ['RSA'], regions: AF_SSA },
    { code: 'SS', name: 'South Sudan', regions: AF_SSA },
    { code: 'SD', name: 'Sudan', regions: AF_NORTH },
    { code: 'TZ', name: 'Tanzania', regions: AF_SSA },
    { code: 'TG', name: 'Togo', regions: AF_SSA },
    { code: 'TN', name: 'Tunisia', regions: AF_NORTH },
    { code: 'UG', name: 'Uganda', regions: AF_SSA },
    { code: 'ZM', name: 'Zambia', regions: AF_SSA },
    { code: 'ZW', name: 'Zimbabwe', regions: AF_SSA },
    // Europe
    { code: 'GB', name: 'United Kingdom', aliases: ['Great Britain', 'England', 'Scotland', 'Wales'], caseSensitiveAliases: ['UK', 'U.K.'], regions: EU },
    { code: 'IE', name: 'Ireland', regions: EU },
    { code: 'DE', name: 'Germany', regions: EU },
    { code: 'FR', name: 'France', regions: EU },
    { code: 'ES', name: 'Spain', regions: EU },
    { code: 'PT', name: 'Portugal', regions: EU },
    { code: 'PL', name: 'Poland', regions: EU },
    { code: 'NL', name: 'Netherlands', aliases: ['The Netherlands', 'Holland'], regions: EU },
    { code: 'BE', name: 'Belgium', regions: EU },
    { code: 'RO', name: 'Romania', regions: EU },
    { code: 'BG', name: 'Bulgaria', regions: EU },
    { code: 'HU', name: 'Hungary', regions: EU },
    { code: 'IT', name: 'Italy', regions: EU },
    { code: 'SE', name: 'Sweden', regions: EU },
    { code: 'NO', name: 'Norway', regions: EU },
    { code: 'DK', name: 'Denmark', regions: EU },
    { code: 'FI', name: 'Finland', regions: EU },
    { code: 'CH', name: 'Switzerland', regions: EU },
    { code: 'AT', name: 'Austria', regions: EU },
    { code: 'CZ', name: 'Czech Republic', aliases: ['Czechia'], regions: EU },
    { code: 'GR', name: 'Greece', regions: EU },
    { code: 'CY', name: 'Cyprus', regions: EU },
    { code: 'EE', name: 'Estonia', regions: EU },
    { code: 'LT', name: 'Lithuania', regions: EU },
    { code: 'LV', name: 'Latvia', regions: EU },
    { code: 'HR', name: 'Croatia', regions: EU },
    { code: 'RS', name: 'Serbia', regions: EU },
    { code: 'UA', name: 'Ukraine', regions: EU },
    { code: 'TR', name: 'Turkey', aliases: ['Türkiye', 'Turkiye'], regions: ['Europe', 'Middle East', 'EMEA'] },
    // Middle East
    { code: 'AE', name: 'United Arab Emirates', aliases: ['Emirates'], caseSensitiveAliases: ['UAE'], regions: ME },
    { code: 'SA', name: 'Saudi Arabia', regions: ME },
    { code: 'BH', name: 'Bahrain', regions: ME },
    { code: 'JO', name: 'Jordan', regions: ME },
    { code: 'QA', name: 'Qatar', regions: ME },
    { code: 'IL', name: 'Israel', regions: ME },
    // Americas
    { code: 'US', name: 'United States', aliases: ['United States of America'], caseSensitiveAliases: ['US', 'USA', 'U.S.', 'U.S.A.'], regions: NA },
    { code: 'CA', name: 'Canada', regions: NA },
    { code: 'MX', name: 'Mexico', aliases: ['México'], regions: [...LA, 'North America'] },
    { code: 'BR', name: 'Brazil', aliases: ['Brasil'], regions: LA },
    { code: 'AR', name: 'Argentina', regions: LA },
    { code: 'UY', name: 'Uruguay', regions: LA },
    { code: 'CO', name: 'Colombia', regions: LA },
    { code: 'CL', name: 'Chile', regions: LA },
    { code: 'PE', name: 'Peru', regions: LA },
    // APAC
    { code: 'IN', name: 'India', regions: AP },
    { code: 'SG', name: 'Singapore', regions: AP },
    { code: 'HK', name: 'Hong Kong', regions: AP },
    { code: 'TW', name: 'Taiwan', regions: AP },
    { code: 'CN', name: 'China', regions: AP },
    { code: 'JP', name: 'Japan', regions: AP },
    { code: 'KR', name: 'South Korea', aliases: ['Korea'], regions: AP },
    { code: 'AU', name: 'Australia', regions: AP },
    { code: 'NZ', name: 'New Zealand', regions: AP },
    { code: 'PH', name: 'Philippines', regions: AP },
    { code: 'TH', name: 'Thailand', regions: AP },
    { code: 'VN', name: 'Vietnam', aliases: ['Viet Nam'], regions: AP },
    { code: 'MY', name: 'Malaysia', regions: AP },
    { code: 'ID', name: 'Indonesia', regions: AP },
    { code: 'PK', name: 'Pakistan', regions: AP },
    { code: 'KZ', name: 'Kazakhstan', regions: ['CIS', 'APAC'] },
];

/** City → country code. Used only when the text names a city without a country. */
export const CITIES: Record<string, string> = {
    atlanta: 'US', lagos: 'NG', abuja: 'NG', ibadan: 'NG', 'port harcourt': 'NG', kano: 'NG', enugu: 'NG', yenagoa: 'NG',
    nairobi: 'KE', mombasa: 'KE', kisumu: 'KE',
    accra: 'GH', kumasi: 'GH',
    kigali: 'RW', kampala: 'UG', 'dar es salaam': 'TZ', 'addis ababa': 'ET',
    cairo: 'EG', alexandria: 'EG', casablanca: 'MA', rabat: 'MA', tunis: 'TN', algiers: 'DZ',
    dakar: 'SN', abidjan: 'CI', douala: 'CM', 'yaoundé': 'CM', yaounde: 'CM', cotonou: 'BJ', 'lomé': 'TG', lome: 'TG',
    johannesburg: 'ZA', 'cape town': 'ZA', durban: 'ZA', pretoria: 'ZA',
    lusaka: 'ZM', harare: 'ZW', maputo: 'MZ', luanda: 'AO', kinshasa: 'CD', gaborone: 'BW', windhoek: 'NA',
    freetown: 'SL', monrovia: 'LR', bamako: 'ML', ouagadougou: 'BF',
    london: 'GB', manchester: 'GB', edinburgh: 'GB', dublin: 'IE', berlin: 'DE', munich: 'DE', paris: 'FR',
    madrid: 'ES', barcelona: 'ES', lisbon: 'PT', porto: 'PT', warsaw: 'PL', krakow: 'PL', 'kraków': 'PL',
    bucharest: 'RO', 'iași': 'RO', iasi: 'RO', amsterdam: 'NL', stockholm: 'SE', oslo: 'NO', zurich: 'CH', 'zürich': 'CH',
    'new york': 'US', 'san francisco': 'US', seattle: 'US', boston: 'US', austin: 'US', chicago: 'US',
    'los angeles': 'US', 'ann arbor': 'US', 'foster city': 'US', 'south san francisco': 'US',
    toronto: 'CA', montreal: 'CA', vancouver: 'CA',
    bangalore: 'IN', bengaluru: 'IN', mumbai: 'IN', 'new delhi': 'IN', hyderabad: 'IN', pune: 'IN',
    taipei: 'TW', tokyo: 'JP', seoul: 'KR', sydney: 'AU', melbourne: 'AU', brisbane: 'AU', auckland: 'NZ', wellington: 'NZ',
    dubai: 'AE', 'abu dhabi': 'AE', riyadh: 'SA', manama: 'BH', amman: 'JO', 'tel aviv': 'IL', istanbul: 'TR',
    'sao paulo': 'BR', 'são paulo': 'BR', 'buenos aires': 'AR', montevideo: 'UY', 'bogota': 'CO', 'bogotá': 'CO',
    'mexico city': 'MX', 'ciudad de méxico': 'MX', 'ciudad de mexico': 'MX', santiago: 'CL', lima: 'PE',
    'kuala lumpur': 'MY', shanghai: 'CN', beijing: 'CN', manila: 'PH', bangkok: 'TH', 'ho chi minh': 'VN', jakarta: 'ID',
};

const REGION_PATTERNS: [Region, RegExp][] = [
    ['Sub-Saharan Africa', /\bsub[\s-]saharan africa\b|\bssa\b/i],
    ['MENA', /\bmena\b|\bmiddle east (?:&|and) north africa\b/i],
    ['Africa', /\bafrica\b/i],
    ['EMEA', /\bemea\b/i],
    ['Europe', /\beurope\b|\beuropean union\b|\bEU\b/],
    ['Middle East', /\bmiddle east\b/i],
    ['North America', /\bnorth america\b/i],
    ['LATAM', /\blatam\b|\blatin america\b|\bsouth america\b|\bcentral america\b/i],
    ['Americas', /\bamericas\b/i],
    ['APAC', /\bapac\b|\basia[\s-]pacific\b|\basia\b|\bsouth east asia\b|\bsoutheast asia\b/i],
    ['CIS', /\bcis region\b|\bcis\b/],
];

const WORLDWIDE_RE =
    /\b(anywhere|worldwide|world[\s-]wide|global(?:ly)?(?![\s-]*(?:team|company|brand|leader|payments?|fintech|scale))|international(?:ly)? remote|any location|all locations|work from anywhere|remote from anywhere)\b/i;

function escapeRe(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface Matcher {
    code: string;
    re: RegExp;
}

// Longest names first so "South Sudan" wins over "Sudan", "Guinea-Bissau" over "Guinea".
const MATCHERS: Matcher[] = COUNTRIES.flatMap((c) => {
    const ci = [c.name, ...(c.aliases ?? [])].map((n) => ({ code: c.code, re: new RegExp(`(?<![\\p{L}-])${escapeRe(n)}(?![\\p{L}-])`, 'iu'), len: n.length }));
    const cs = (c.caseSensitiveAliases ?? []).map((n) => ({ code: c.code, re: new RegExp(`(?<![\\p{L}.])${escapeRe(n)}(?![\\p{L}])`, 'u'), len: n.length }));
    return [...ci, ...cs];
})
    .sort((a, b) => b.len - a.len)
    .map(({ code, re }) => ({ code, re }));

const CITY_MATCHERS: Matcher[] = Object.entries(CITIES)
    .sort((a, b) => b[0].length - a[0].length)
    .map(([city, code]) => ({ code, re: new RegExp(`(?<![\\p{L}])${escapeRe(city)}(?![\\p{L}])`, 'iu') }));

export const COUNTRY_BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

export function countryName(code: string): string {
    return COUNTRY_BY_CODE.get(code)?.name ?? code;
}

export function regionsOf(code: string): Region[] {
    return COUNTRY_BY_CODE.get(code)?.regions ?? [];
}

export function regionIncludes(region: Region, code: string): boolean {
    return regionsOf(code).includes(region);
}

export interface ParsedGeo {
    countries: string[];
    regions: Region[];
    worldwide: boolean;
}

/** Read countries, regions and worldwide statements from free text. */
export function parseGeo(text: string): ParsedGeo {
    let masked = text;
    const countries = new Set<string>();
    for (const m of MATCHERS) {
        const found = m.re.exec(masked);
        if (found) {
            countries.add(m.code);
            masked = masked.replace(m.re, ' ');
        }
    }
    // "Middle East & North Africa" must not also read as "Africa"; resolve regions on the masked text.
    const regions = new Set<Region>();
    let regionText = masked;
    for (const [region, re] of REGION_PATTERNS) {
        if (re.test(regionText)) {
            regions.add(region);
            regionText = regionText.replace(re, ' ');
        }
    }
    for (const m of CITY_MATCHERS) {
        if (m.re.test(masked)) {
            countries.add(m.code);
            masked = masked.replace(m.re, ' ');
        }
    }
    return { countries: [...countries], regions: [...regions], worldwide: WORLDWIDE_RE.test(text) };
}
