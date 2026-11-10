// Builds the LPO PDF with jsPDF + autotable (loaded as globals from /vendor).
import { fmt3, lineAmounts, orderTotals } from './money.js';
import { fmtDate, pct } from './format.js';

export function downloadPdf(order) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 14;
  const t = orderTotals(order.lines, order.docDiscount);

  // Header
  doc.setFont('helvetica', 'bold').setFontSize(16).text('LOCAL PURCHASE ORDER', M, 18);
  doc.setFontSize(11).text(order.number, W - M, 18, { align: 'right' });
  doc.setFont('helvetica', 'normal').setFontSize(9)
    .text(`Status: ${order.status.toUpperCase()}`, W - M, 23, { align: 'right' });
  doc.setLineWidth(0.5).line(M, 26, W - M, 26);

  // Buyer and supplier
  const party = (label, p, x) => {
    doc.setFont('helvetica', 'bold').setFontSize(8).text(label, x, 33);
    doc.setFontSize(10).text(p.name, x, 38);
    doc.setFont('helvetica', 'normal').setFontSize(9);
    if (p.address) doc.text(p.address, x, 43);
    if (p.vat) doc.text(`VAT ${p.vat}`, x, 48);
  };
  party('BUYER', order.buyer, M);
  party('SUPPLIER', order.supplier, W / 2 + 2);

  // Reference and dates
  const meta = [['Reference', order.reference || '-'], ['Order date', fmtDate(order.orderDate)], ['Due date', fmtDate(order.dueDate)]];
  meta.forEach(([k, v], i) => {
    const x = M + i * ((W - 2 * M) / 3);
    doc.setFontSize(8).setTextColor(110).text(k, x, 57);
    doc.setFontSize(10).setTextColor(0).text(v, x, 62);
  });

  // Lines: ordered, received, pending for each
  doc.autoTable({
    startY: 68,
    margin: { left: M, right: M },
    head: [['No', 'Description', 'Unit', 'Ordered', 'Received', 'Pending', 'Price', 'Disc', 'VAT', 'Net']],
    body: order.lines.map((l, i) => [
      i + 1, l.description, l.unit, fmt3(l.qty), fmt3(l.received), fmt3(l.qty - l.received),
      fmt3(l.price), l.discountBp ? pct(l.discountBp) : '-', pct(l.vatBp), fmt3(lineAmounts(l).net),
    ]),
    styles: { fontSize: 8, cellPadding: 1.8 },
    headStyles: { fillColor: [30, 41, 59] },
    columnStyles: { 0: { halign: 'center' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' },
      6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' }, 9: { halign: 'right' } },
    // Number column headers line up with the numbers under them.
    didParseCell: (d) => { if (d.section === 'head' && d.column.index >= 3) d.cell.styles.halign = 'right'; },
  });

  // Totals: net, document discount, then VAT per rate group, then total
  const rows = [['Net', fmt3(t.net)], ['Document discount', `-${fmt3(t.docDiscount)}`], ['Net after all discounts', fmt3(t.taxable)]];
  for (const g of t.groups) rows.push([`VAT ${pct(g.rate)} on ${fmt3(g.taxable)}`, fmt3(g.vat)]);
  rows.push(['Total BD', fmt3(t.total)]);
  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 6,
    margin: { left: W / 2, right: M },
    body: rows,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1.5 },
    columnStyles: { 1: { halign: 'right' } },
    didParseCell: (d) => { if (d.row.index === rows.length - 1) d.cell.styles.fontStyle = 'bold'; },
  });

  doc.setFontSize(7).setTextColor(130)
    .text('Amounts in Bahraini dinar. VAT computed per rate group after the document discount.', M, 287);
  doc.save(`${order.number}.pdf`);
}
