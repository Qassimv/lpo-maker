// Small display helpers shared by the screen and the PDF.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2026-11-10" -> "10 Nov 2026" (always with the year)
export function fmtDate(iso) {
  if (!iso) return '-';
  const [y, m, d] = iso.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}

// basis points -> "10%", "2.5%"
export const pct = (bp) => `${bp / 100}%`;

// Today and today + n days as "YYYY-MM-DD" in local time.
export function isoDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
