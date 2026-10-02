/** Display/parse helpers only. Authoritative money math lives on the server. */
export function formatINR(paise: number | null | undefined): string {
  const p = paise ?? 0;
  const neg = p < 0;
  const abs = Math.abs(p);
  const r = String(Math.floor(abs / 100));
  const f = String(abs % 100).padStart(2, '0');
  const g = r.length > 3 ? r.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + r.slice(-3) : r;
  return `${neg ? '-' : ''}₹${g}.${f}`;
}

/** "123.45" -> 12345. Returns null for invalid input. */
export function parseRupees(s: string): number | null {
  const t = s.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [i, f = ''] = t.split('.');
  return Number(i) * 100 + Number((f + '00').slice(0, 2));
}

export const pctToBp = (s: string): number | null => {
  const t = s.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [i, f = ''] = t.split('.');
  return Number(i) * 100 + Number((f + '00').slice(0, 2));
};
