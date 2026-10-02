/** CSV cell escaping, including neutralising spreadsheet formula injection (=, +, -, @). */
export function csvEscape(v: unknown): string {
  let s = String(v ?? '');
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
