const TRACKING_KEYS = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'yclid',
  'igshid',
  'spm',
  'scm',
  'ref_src',
  'ref_url',
  'mc_cid',
  'mc_eid',
  'chksm',
  'scene',
  'poc_token',
  'from',
  'isappinstalled',
]);

/**
 * Mirrors ArcMD's Go `clipper.NormalizeURL` so highlight storage and duplicate
 * URL detection stay 100% consistent across browser and desktop.
 */
export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return trimmed.toLowerCase().replace(/\/+$/, '');
  }
  const scheme = u.protocol.toLowerCase();
  const host = u.hostname.toLowerCase();
  let port = u.port;
  if ((scheme === 'http:' && port === '80') || (scheme === 'https:' && port === '443')) {
    port = '';
  }
  const hostPart = host.includes(':') ? `[${host}]` : host;
  const authority = port ? `${hostPart}:${port}` : hostPart;
  let pathname = u.pathname || '/';
  if (pathname !== '/') {
    pathname = pathname.replace(/\/+$/, '') || '/';
  }

  const entries: Array<[string, string]> = [];
  u.searchParams.forEach((value, key) => {
    const lk = key.toLowerCase();
    if (lk.startsWith('utm_') || TRACKING_KEYS.has(lk)) return;
    entries.push([key, value]);
  });
  entries.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  const qs = new URLSearchParams();
  for (const [k, v] of entries) {
    qs.append(k, v);
  }
  const queryStr = qs.toString();
  return `${scheme}//${authority}${pathname}${queryStr ? '?' + queryStr : ''}`;
}

export function extractDomain(raw: string): string {
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function resolveUrl(candidate: string, baseUrl: string): string {
  const s = (candidate || '').trim();
  if (!s) return '';
  if (s.startsWith('data:') || s.startsWith('blob:')) return s;
  try {
    return new URL(s, baseUrl).href;
  } catch {
    return s;
  }
}
