// All money math lives here. Pure functions, no DOM, so it can be tested in Node.
//
// Units (all integers, never floats):
//   money    -> fils        (1 BD = 1000 fils)      45.500 BD -> 45500
//   quantity -> milli-units (1 unit = 1000)         12.750 m  -> 12750
//   percent  -> basis points (1% = 100)             5%        -> 500

// Integer division that rounds half away from zero (rule 1).
export function roundDiv(n, d) {
  const sign = (n < 0) !== (d < 0) ? -1 : 1;
  const a = Math.abs(n), b = Math.abs(d);
  return sign * Math.floor((2 * a + b) / (2 * b));
}

// "45.5" -> 45500. Accepts up to 3 decimals, rejects anything else.
export function parse3(text) {
  const s = String(text).trim();
  if (!/^\d+(\.\d{1,3})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  return Number(whole) * 1000 + Number(frac.padEnd(3, '0'));
}

// 45500 -> "45.500", 1200000 -> "1,200.000"
export function fmt3(n) {
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  const whole = Math.floor(a / 1000).toLocaleString('en-US');
  return `${sign}${whole}.${String(a % 1000).padStart(3, '0')}`;
}

// "5" or "2.5" -> basis points. Returns null if invalid or over 100%.
export function parsePercent(text) {
  const s = String(text ?? '').trim();
  if (s === '') return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [w, f = ''] = s.split('.');
  const bp = Number(w) * 100 + Number(f.padEnd(2, '0'));
  return bp > 10000 ? null : bp;
}

// Rule 2: line net = qty x price, less the line discount.
export function lineAmounts(line) {
  const gross = roundDiv(line.qty * line.price, 1000);
  const discount = roundDiv(gross * line.discountBp, 10000);
  return { gross, discount, net: gross - discount };
}

// Rules 3 + 4: totals for the whole order.
export function orderTotals(lines, docDiscount) {
  // Group line nets by VAT rate. Groups run from highest rate to lowest,
  // so the lowest-rate group is "last" and takes any leftover fraction.
  const byRate = new Map();
  for (const line of lines) {
    const { net } = lineAmounts(line);
    byRate.set(line.vatBp, (byRate.get(line.vatBp) ?? 0) + net);
  }
  const rates = [...byRate.keys()].sort((a, b) => b - a);
  const net = rates.reduce((s, r) => s + byRate.get(r), 0);

  // Split the document discount by each group's share of the net.
  let allocated = 0;
  const groups = rates.map((rate, i) => {
    const groupNet = byRate.get(rate);
    const isLast = i === rates.length - 1;
    const share = isLast
      ? docDiscount - allocated
      : (net === 0 ? 0 : roundDiv(docDiscount * groupNet, net));
    allocated += share;
    const taxable = groupNet - share;
    const vat = roundDiv(taxable * rate, 10000); // rounded once per group
    return { rate, net: groupNet, discount: share, taxable, vat };
  });

  const vat = groups.reduce((s, g) => s + g.vat, 0);
  const taxable = net - docDiscount;
  return { net, docDiscount, taxable, groups, vat, total: taxable + vat };
}
