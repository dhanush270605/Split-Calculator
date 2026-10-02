/** Money is always integer paise. 1 INR = 100 paise. */
export const MAX_AMOUNT_PAISE = 10_000_000_00; // ₹1 crore cap per expense

export function rupeesToPaise(rupees: number | string): number {
  const s = typeof rupees === 'number' ? rupees.toFixed(2) : rupees.trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) throw new Error(`Invalid rupee amount: ${rupees}`);
  const neg = s.startsWith('-');
  const [i, f = ''] = s.replace('-', '').split('.');
  const p = Number(i) * 100 + Number((f + '00').slice(0, 2));
  return neg ? -p : p;
}

export function formatINR(paise: number): string {
  const neg = paise < 0;
  const abs = Math.abs(paise);
  const r = String(Math.floor(abs / 100));
  const p = String(abs % 100).padStart(2, '0');
  // Indian digit grouping: 12,34,567
  const grouped = r.length > 3 ? r.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + r.slice(-3) : r;
  return `${neg ? '-' : ''}₹${grouped}.${p}`;
}
